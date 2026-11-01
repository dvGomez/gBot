import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { ChatEvent, TokenUsage } from '@shared/types'
import { totalTokens } from '@shared/usage'
import { recordFiles } from '../../fileIndex'
import { recordUsage } from '../../usage'
import { killProcessTree, processGroup } from '../../processTree'
import { fileContext, type UsageTag } from '../claude-code/session'
import { sanitizePlan } from '../claude-code/architect'
import { ASK_BOT_TOOL, describeTool, HIDDEN_TOOLS, PROPOSE_PLAN_TOOL } from '../claude-code/tools'
import { resolveCodexEnv } from './env'

/**
 * Um turno do Codex: um processo `codex exec --json` por mensagem. A primeira mensagem da conversa abre uma thread
 * nova; as seguintes continuam a mesma thread (`exec resume`). Threads são por conta (cada conta tem o próprio
 * histórico): ao trocar de conta, a conversa abre uma thread nova levando as últimas mensagens como contexto.
 */

export interface TurnOptions {
  conversationId: string
  cwd: string
  /** Instruções do gBot (persona, projeto, ferramentas, memória). */
  instructions: string
  prompt: string
  /** Mensagens anteriores da conversa, para quando a thread precisa recomeçar. */
  history: { role: string; text: string }[]
  model?: string
  /** Imagens anexadas (vão como imagem, além do caminho no texto). */
  images?: string[]
  mcp: { url: string; token: string }
  /** `workspace-write`: comandos só escrevem na pasta de trabalho · `danger-full-access`: sem sandbox. */
  sandbox: 'workspace-write' | 'danger-full-access'
  tag?: UsageTag
}

// Threads por conversa e conta, em data/codex-threads.json.
const threadsFile = () => {
  const dir = join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'codex-threads.json')
}
function readThreads(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(threadsFile(), 'utf8'))
  } catch {
    return {}
  }
}
function saveThread(key: string, threadId: string) {
  const tmp = `${threadsFile()}.tmp`
  writeFileSync(tmp, JSON.stringify({ ...readThreads(), [key]: threadId }))
  renameSync(tmp, threadsFile())
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

/** Últimas mensagens da conversa, para uma thread nova continuar de onde a conversa estava. */
function historyBlock(history: TurnOptions['history']): string {
  const recent = history.filter((m) => m.text.trim()).slice(-12)
  if (!recent.length) return ''
  return [
    '<conversa_anterior>',
    ...recent.map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${clip(m.text.trim(), 1500)}`),
    '</conversa_anterior>',
    ''
  ].join('\n')
}

type Item = {
  id?: string
  type?: string
  text?: string
  command?: string
  exit_code?: number | null
  status?: string
  server?: string
  tool?: string
  arguments?: Record<string, unknown> | string
  result?: { content?: { type?: string; text?: string }[] } | string | null
  error?: { message?: string } | string | null
  changes?: unknown[]
  query?: string
}
type Line = {
  type: string
  thread_id?: string
  item?: Item
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number; reasoning_output_tokens?: number }
  error?: { message?: string }
  message?: string
}

/** Comando sem o "powershell.exe -Command" na frente, para mostrar ao usuário. */
function shortCommand(command = ''): string {
  const inner = command.match(/-Command\s+(['"])([\s\S]*)\1\s*$/)?.[2] ?? command
  return clip(inner.replace(/\s+/g, ' ').trim(), 80)
}

const args = (a: Item['arguments']): Record<string, unknown> => {
  if (typeof a === 'string') {
    try {
      return JSON.parse(a)
    } catch {
      return {}
    }
  }
  return a ?? {}
}

const resultText = (r: Item['result']) =>
  typeof r === 'string' ? r : (r?.content ?? []).map((c) => c.text ?? '').join('\n')

export async function runCodexTurn(opts: TurnOptions, emit: (ev: ChatEvent) => void, signal: AbortSignal): Promise<void> {
  const { bin, env, accountId } = await resolveCodexEnv()
  signal.throwIfAborted()
  const key = `${opts.conversationId}:${accountId}`
  const threadId = readThreads()[key]
  const config = [
    `developer_instructions=${JSON.stringify(clip(opts.instructions, 20_000))}`,
    `sandbox_mode="${opts.sandbox}"`,
    'approval_policy="never"',
    `mcp_servers.gbot.url="${opts.mcp.url}"`,
    'mcp_servers.gbot.bearer_token_env_var="GBOT_MCP_TOKEN"',
    // Consultar outro bot pode levar minutos.
    'mcp_servers.gbot.tool_timeout_sec=900',
    'mcp_servers.gbot.startup_timeout_sec=30'
  ].flatMap((c) => ['-c', c])
  const argv = [
    'exec',
    ...(threadId ? ['resume', threadId] : []),
    '--json',
    '--skip-git-repo-check',
    ...(opts.model && opts.model !== 'default' ? ['-m', opts.model] : []),
    ...config,
    ...(opts.images ?? []).flatMap((p) => ['-i', p]),
    '-'
  ]
  const prompt = threadId ? opts.prompt : `${historyBlock(opts.history)}${opts.prompt}`

  emit({ type: 'mood', mood: 'thinking' })
  await new Promise<void>((resolve) => {
    const proc = spawn(bin, argv, { cwd: opts.cwd, env: { ...env, GBOT_MCP_TOKEN: opts.mcp.token }, ...processGroup })
    let buffer = ''
    let stderr = ''
    let finished = false
    let hasText = false
    // Quanto do texto de cada mensagem já foi mostrado (para atualizações parciais da mesma mensagem).
    const shown = new Map<string, number>()
    const tools = new Map<string, { name: string; summary: string; botName?: string }>()

    const finish = (ev: ChatEvent) => {
      if (finished) return
      finished = true
      emit(ev)
      resolve()
    }

    const onAbort = () => {
      killProcessTree(proc)
      finish({ type: 'done' })
    }
    signal.addEventListener('abort', onAbort, { once: true })

    const text = (item: Item) => {
      const id = item.id ?? ''
      const full = item.text ?? ''
      const from = shown.get(id) ?? 0
      if (full.length <= from) return
      if (from === 0) {
        emit({ type: 'mood', mood: 'talking' })
        if (hasText) emit({ type: 'delta', text: '\n\n' })
      }
      emit({ type: 'delta', text: full.slice(from) })
      shown.set(id, full.length)
      hasText = true
    }

    const tool = (item: Item, done: boolean) => {
      const id = item.id ?? ''
      let entry = tools.get(id)
      if (!entry) {
        if (item.type === 'command_execution') entry = { name: 'Bash', summary: `Rodando: ${shortCommand(item.command)}` }
        else if (item.type === 'file_change') {
          const n = item.changes?.length ?? 0
          entry = { name: 'Edit', summary: n > 1 ? `Editando ${n} arquivos` : 'Editando arquivo' }
        } else if (item.type === 'web_search') entry = { name: 'WebSearch', summary: `Pesquisando na web${item.query ? `: ${clip(item.query, 60)}` : ''}` }
        else if (item.type === 'mcp_tool_call') {
          const name = `mcp__${item.server ?? 'gbot'}__${item.tool ?? ''}`
          const input = args(item.arguments)
          entry = { name, summary: describeTool(name, input), botName: name === ASK_BOT_TOOL ? String(input.bot ?? '') : undefined }
        } else return
        tools.set(id, entry)
      }
      if (HIDDEN_TOOLS.has(entry.name)) return
      const failed =
        done && (item.status === 'failed' || !!item.error || (item.type === 'command_execution' && (item.exit_code ?? 0) !== 0))
      const detail = done && entry.botName ? clip(resultText(item.result), 20_000) : undefined
      const summary = failed ? `Não concluiu: ${entry.summary.charAt(0).toLowerCase()}${entry.summary.slice(1)}` : entry.summary
      emit({ type: 'mood', mood: 'thinking' })
      emit({ type: 'tool', tool: { id, name: entry.name, summary, botName: entry.botName, detail, status: !done ? 'running' : failed ? 'error' : 'done' } })
    }

    const onLine = (line: Line) => {
      if (finished || signal.aborted) return
      switch (line.type) {
        case 'thread.started':
          if (line.thread_id) saveThread(key, line.thread_id)
          break
        case 'item.started':
        case 'item.updated':
        case 'item.completed': {
          const item = line.item ?? {}
          const done = line.type === 'item.completed'
          // Arquivos que o Codex mudou entram no painel de arquivos de quem pediu.
          if (item.type === 'file_change' && done && opts.tag && item.status !== 'failed') {
            const paths = (item.changes ?? []).map((c) => (c as { path?: string; kind?: string }))
            recordFiles(
              paths.filter((c) => c.path && c.kind !== 'delete').map((c) => ({ path: c.path!, action: 'write' as const })),
              fileContext(opts.tag)
            )
          }
          // Plano aceito pela ferramenta: vira o cartão para aplicar, como no Claude Code.
          if (item.type === 'mcp_tool_call' && done && `mcp__${item.server}__${item.tool}` === PROPOSE_PLAN_TOOL && !item.error && item.status !== 'failed') {
            try {
              emit({ type: 'plan', plan: sanitizePlan(args(item.arguments)) })
            } catch {
              // a ferramenta já validou e devolveu o erro ao modelo
            }
          }
          if (item.type === 'agent_message') text(item)
          else if (item.type === 'reasoning') emit({ type: 'mood', mood: 'thinking' })
          else if (item.type === 'error' && done && item.text) emit({ type: 'notice', text: item.text })
          else tool(item, done)
          break
        }
        case 'turn.completed': {
          const u = line.usage ?? {}
          const cached = u.cached_input_tokens ?? 0
          const usage: TokenUsage = {
            input: Math.max(0, (u.input_tokens ?? 0) - cached),
            output: (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0),
            cacheRead: cached,
            cacheWrite: 0,
            cost: 0
          }
          if (totalTokens(usage) > 0) {
            if (opts.tag) recordUsage({ ...opts.tag, ...usage, model: opts.model && opts.model !== 'default' ? opts.model : 'codex', at: Date.now() })
            emit({ type: 'usage', usage })
          }
          finish({ type: 'done' })
          break
        }
        case 'turn.failed':
          finish({ type: 'error', message: line.error?.message || 'O Codex não conseguiu concluir a resposta.' })
          break
        case 'error': {
          const message = line.message ?? line.error?.message ?? ''
          // Reconexões da API chegam como erro, mas o Codex tenta de novo sozinho.
          if (/reconnect|retry/i.test(message)) emit({ type: 'notice', text: 'Instabilidade na conexão, tentando de novo…' })
          else if (message) finish({ type: 'error', message })
          break
        }
      }
    }

    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      buffer += chunk
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const raw = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!raw) continue
        try {
          onLine(JSON.parse(raw) as Line)
        } catch {
          // linha que não é JSON (aviso do CLI): ignora
        }
      }
    })
    proc.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-2000)))
    proc.on('error', (err) => finish({ type: 'error', message: `Não foi possível iniciar o Codex: ${err.message}` }))
    proc.on('exit', (code) => {
      signal.removeEventListener('abort', onAbort)
      const detail = stderr.trim().split('\n').at(-1)
      finish(
        code === 0 && hasText
          ? { type: 'done' }
          : { type: 'error', message: `O Codex encerrou sem concluir (código ${code}).${detail ? ` ${detail}` : ''}` }
      )
    })
    proc.stdin.end(prompt)
  })
}
