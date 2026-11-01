import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { ChatEvent, TokenUsage, UsageRecord } from '@shared/types'
import { addUsage, emptyUsage, totalTokens } from '@shared/usage'
import { recordFiles } from '../../fileIndex'
import { recordUsage } from '../../usage'
import { killProcessTree, processGroup } from '../../processTree'
import { APPROVE_TOOL } from './permissions'
import { sanitizePlan } from './architect'
import { ASK_BOT_TOOL, describeTool, HIDDEN_TOOLS, PROPOSE_PLAN_TOOL } from './tools'

export interface SessionOptions {
  bin: string
  env: NodeJS.ProcessEnv
  cwd: string
  sessionId: string
  /** true quando a sessão já existe em disco e deve ser retomada (`--resume`). */
  resume: boolean
  appendSystemPrompt?: string
  model?: string
  /** JSON do `--mcp-config` (servidor de ferramentas do gBot). */
  mcpConfig?: string
  /** Ferramentas liberadas sem pedir permissão (as do gBot). */
  allowedTools?: string[]
  /** Pastas extras que a sessão pode ler (ex.: os arquivos de referência do bot). */
  addDirs?: string[]
}

/** Quem está gastando num turno (para o registro de consumo). */
export type UsageTag = Omit<UsageRecord, keyof TokenUsage | 'at' | 'model'>

interface Turn {
  emit(event: ChatEvent): void
  tag?: UsageTag
  done(): void
  interrupted: boolean
  hasText: boolean
  tools: Map<string, { name: string; summary: string; botName?: string }>
  /** Arquivos que as ferramentas deste turno vão mexer, registrados quando cada uma termina bem. */
  files: Map<string, { path: string; action: 'write' | 'read' }>
  /** Planos propostos pelo arquiteto neste turno (entrada de `propose_plan`), até o resultado confirmar. */
  plans: Map<string, unknown>
}

// Linhas do stream-json do Claude Code (só os campos que usamos).
type Block = {
  type: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  is_error?: boolean
  content?: string | { type: string; text?: string }[]
}

const blockText = (content: Block['content']) =>
  typeof content === 'string' ? content : (content ?? []).map((c) => c.text ?? '').join('\n')
type Line = {
  type: string
  subtype?: string
  parent_tool_use_id?: string | null
  event?: { type: string; content_block?: Block; delta?: { type: string; text?: string } }
  message?: { content?: Block[] | string }
  result?: string
  is_error?: boolean
  errors?: string[]
  attempt?: number
  max_retries?: number
  permission_denials?: { tool_name: string }[]
  modelUsage?: Record<
    string,
    {
      inputTokens?: number
      outputTokens?: number
      cacheReadInputTokens?: number
      cacheCreationInputTokens?: number
      costUSD?: number
    }
  >
}

/**
 * Consumo acumulado do processo até aqui, por modelo. No modo stream-json o `modelUsage` do resultado soma todos os
 * turnos do processo (e todos os modelos, inclusive subagentes); o gasto do turno é a diferença entre dois resultados.
 */
export function usageByModel(line: Pick<Line, 'modelUsage'>): Map<string, TokenUsage> {
  const out = new Map<string, TokenUsage>()
  for (const [model, m] of Object.entries(line.modelUsage ?? {})) {
    out.set(model, {
      input: m.inputTokens ?? 0,
      output: m.outputTokens ?? 0,
      cacheRead: m.cacheReadInputTokens ?? 0,
      cacheWrite: m.cacheCreationInputTokens ?? 0,
      cost: m.costUSD ?? 0
    })
  }
  return out
}

/** Ferramentas do Claude Code que leem ou gravam um arquivo (e em que campo vem o caminho). */
const FILE_TOOLS: Record<string, 'write' | 'read'> = { Write: 'write', Edit: 'write', MultiEdit: 'write', NotebookEdit: 'write', Read: 'read' }

function fileOf(name: string, input?: Record<string, unknown>): { path: string; action: 'write' | 'read' } | undefined {
  const action = FILE_TOOLS[name]
  const path = input?.file_path ?? input?.notebook_path
  return action && typeof path === 'string' ? { path, action } : undefined
}

/** Onde o arquivo foi mexido: a conversa, o fluxo e o bot do turno. */
export const fileContext = (tag: UsageTag) => ({ conversationId: tag.conversationId, flowId: tag.flowId, botId: tag.botId })

/** Diferença entre dois acumulados por modelo (só os modelos que gastaram algo). */
function usageDelta(now: Map<string, TokenUsage>, before: Map<string, TokenUsage>): Map<string, TokenUsage> {
  const out = new Map<string, TokenUsage>()
  for (const [model, u] of now) {
    const b = before.get(model) ?? emptyUsage()
    const d = {
      input: u.input - b.input,
      output: u.output - b.output,
      cacheRead: u.cacheRead - b.cacheRead,
      cacheWrite: u.cacheWrite - b.cacheWrite,
      cost: Math.max(0, u.cost - b.cost)
    }
    if (totalTokens(d) > 0) out.set(model, d)
  }
  return out
}

/** Registra o gasto de um turno, um registro por modelo, e devolve o total. */
export function recordTurn(byModel: Map<string, TokenUsage>, tag?: UsageTag): TokenUsage {
  let total = emptyUsage()
  const at = Date.now()
  for (const [model, u] of byModel) {
    total = addUsage(total, u)
    if (tag) recordUsage({ ...tag, ...u, model, at })
  }
  return total
}

/**
 * Um processo `claude -p` de longa duração para uma conversa. Mensagens entram pelo stdin em
 * stream-json e os eventos saem pelo stdout, um JSON por linha.
 */
export class ClaudeSession {
  private proc: ChildProcessWithoutNullStreams
  private buffer = ''
  private stderrTail = ''
  private turn?: Turn
  lastUsed = Date.now()
  exited = false
  /** O último turno teve ferramenta com erro ou negada (usado para a reflexão automática da memória). */
  lastTurnFailed = false
  /** Turnos entram em fila: uma mensagem nova espera a anterior (inclusive a reflexão automática). */
  private queue: Promise<unknown> = Promise.resolve()
  /** Consumo acumulado do processo no último resultado, por modelo. */
  private spent = new Map<string, TokenUsage>()

  constructor(private opts: SessionOptions) {
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      // Criar e editar arquivos na pasta de trabalho é livre; o resto pergunta ao usuário pelo gBot.
      '--permission-mode', 'acceptEdits',
      '--permission-prompt-tool', APPROVE_TOOL,
      // As perguntas ao usuário vão pelo cartão do gBot (ask_user); a do Claude Code não tem onde aparecer aqui.
      '--disallowedTools', 'AskUserQuestion',
      ...(opts.resume ? ['--resume', opts.sessionId] : ['--session-id', opts.sessionId]),
      ...(opts.appendSystemPrompt ? ['--append-system-prompt', opts.appendSystemPrompt] : []),
      ...(opts.model ? ['--model', opts.model] : []),
      ...(opts.mcpConfig ? ['--mcp-config', opts.mcpConfig] : []),
      ...(opts.addDirs ?? []).flatMap((dir) => ['--add-dir', dir]),
      ...(opts.allowedTools?.length ? ['--allowedTools', opts.allowedTools.join(',')] : [])
    ]
    // Consultar outro bot pode levar minutos: o limite de tempo de ferramentas MCP precisa acompanhar.
    const env = { ...opts.env, MCP_TOOL_TIMEOUT: String(15 * 60_000) }
    this.proc = spawn(opts.bin, args, { cwd: opts.cwd, env, ...processGroup })
    this.proc.stdout.setEncoding('utf8')
    this.proc.stdout.on('data', (chunk: string) => this.onData(chunk))
    this.proc.stderr.on('data', (chunk: Buffer) => (this.stderrTail = (this.stderrTail + chunk.toString()).slice(-2000)))
    this.proc.on('error', (err) => this.finish({ type: 'error', message: `Não foi possível iniciar o Claude Code: ${err.message}` }))
    this.proc.on('exit', (code) => {
      this.exited = true
      const detail = this.stderrTail.trim().split('\n').at(-1)
      this.finish({ type: 'error', message: `O Claude Code encerrou inesperadamente (código ${code}).${detail ? ` ${detail}` : ''}` })
    })
  }

  get busy() {
    return !!this.turn
  }

  /** Envia uma mensagem (depois da anterior, se houver) e resolve quando o turno termina; `tag` registra o consumo. */
  send(text: string, emit: (event: ChatEvent) => void, signal: AbortSignal, tag?: UsageTag): Promise<void> {
    const run = () =>
      new Promise<void>((resolve) => {
        if (this.exited || signal.aborted) {
          if (!signal.aborted) emit({ type: 'error', message: 'A sessão do Claude Code foi encerrada.' })
          return resolve()
        }
        this.lastUsed = Date.now()
        this.lastTurnFailed = false
        this.turn = { emit, tag, done: resolve, interrupted: false, hasText: false, tools: new Map(), files: new Map(), plans: new Map() }
        const abort = () => tag?.flowId ? this.kill() : this.interrupt()
        signal.addEventListener('abort', abort, { once: true })
        const turn = this.turn
        turn.done = () => {
          signal.removeEventListener('abort', abort)
          resolve()
        }
        emit({ type: 'mood', mood: 'thinking' })
        this.write({ type: 'user', message: { role: 'user', content: text } })
      })
    const p = this.queue.then(run)
    this.queue = p.catch(() => undefined)
    return p
  }

  /** Pede ao Claude Code para parar o turno atual; se não responder, encerra o processo. */
  interrupt() {
    if (!this.turn) return
    this.turn.interrupted = true
    this.write({ type: 'control_request', request_id: randomUUID(), request: { subtype: 'interrupt' } })
    const turn = this.turn
    setTimeout(() => {
      if (this.turn === turn) this.kill()
    }, 4000)
  }

  kill() {
    if (this.exited) return
    this.exited = true
    killProcessTree(this.proc)
    this.finish({ type: 'done' })
  }

  private write(obj: unknown) {
    if (!this.exited) this.proc.stdin.write(JSON.stringify(obj) + '\n')
  }

  private finish(final: ChatEvent) {
    const turn = this.turn
    if (!turn) return
    this.turn = undefined
    this.lastUsed = Date.now()
    turn.emit(turn.interrupted ? { type: 'done' } : final)
    turn.done()
  }

  private onData(chunk: string) {
    this.buffer += chunk
    let nl: number
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const raw = this.buffer.slice(0, nl).trim()
      this.buffer = this.buffer.slice(nl + 1)
      if (!raw) continue
      try {
        this.onLine(JSON.parse(raw) as Line)
      } catch {
        // linha que não é JSON (aviso do CLI): ignora
      }
    }
  }

  private onLine(line: Line) {
    const turn = this.turn
    if (!turn) return
    // Mensagens de subagentes ficam de fora; só a conversa principal aparece no chat.
    if (line.parent_tool_use_id) return
    const { emit } = turn

    switch (line.type) {
      case 'stream_event': {
        const ev = line.event
        if (ev?.type === 'content_block_start') {
          const block = ev.content_block
          if (block?.type === 'thinking') emit({ type: 'mood', mood: 'thinking' })
          if (block?.type === 'text') {
            emit({ type: 'mood', mood: 'talking' })
            if (turn.hasText) emit({ type: 'delta', text: '\n\n' })
          }
          if (block?.type === 'tool_use' && block.id && block.name && !HIDDEN_TOOLS.has(block.name)) {
            emit({ type: 'mood', mood: 'thinking' })
            const summary = describeTool(block.name)
            turn.tools.set(block.id, { name: block.name, summary })
            emit({ type: 'tool', tool: { id: block.id, name: block.name, summary, status: 'running' } })
          }
        } else if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          turn.hasText = true
          emit({ type: 'delta', text: ev.delta.text })
        }
        break
      }

      case 'assistant': {
        // Mensagem completa: agora temos o input das ferramentas para descrevê-las melhor.
        const blocks = Array.isArray(line.message?.content) ? line.message.content : []
        for (const b of blocks) {
          if (b.type === 'tool_use' && b.id && b.name === PROPOSE_PLAN_TOOL) turn.plans.set(b.id, b.input)
          if (b.type === 'tool_use' && b.id && b.name) {
            const file = fileOf(b.name, b.input)
            if (file) turn.files.set(b.id, file)
          }
          if (b.type !== 'tool_use' || !b.id || !b.name || HIDDEN_TOOLS.has(b.name)) continue
          const summary = describeTool(b.name, b.input)
          const botName = b.name === ASK_BOT_TOOL ? String(b.input?.bot ?? '') : undefined
          turn.tools.set(b.id, { name: b.name, summary, botName })
          emit({ type: 'tool', tool: { id: b.id, name: b.name, summary, botName, status: 'running' } })
        }
        break
      }

      case 'user': {
        const blocks = Array.isArray(line.message?.content) ? line.message.content : []
        for (const b of blocks) {
          if (b.type !== 'tool_result' || !b.tool_use_id) continue
          // Arquivo lido ou gravado com sucesso entra no painel de arquivos de quem pediu.
          const file = turn.files.get(b.tool_use_id)
          if (file && !b.is_error && turn.tag) recordFiles([file], fileContext(turn.tag))
          // Plano aceito pela ferramenta: vira o cartão com "Criar tudo" na resposta.
          if (turn.plans.has(b.tool_use_id) && !b.is_error) {
            try {
              emit({ type: 'plan', plan: sanitizePlan(turn.plans.get(b.tool_use_id)) })
            } catch {
              // a ferramenta já validou; se falhar aqui, o modelo recebeu o erro e tenta de novo
            }
          }
          const t = turn.tools.get(b.tool_use_id)
          if (!t) continue
          if (b.is_error) this.lastTurnFailed = true
          const summary = b.is_error ? `Não concluiu: ${t.summary.charAt(0).toLowerCase()}${t.summary.slice(1)}` : t.summary
          // Para consultas a bots, guarda a resposta para mostrar no chat.
          const detail = t.botName ? blockText(b.content).slice(0, 20_000) : undefined
          emit({
            type: 'tool',
            tool: { id: b.tool_use_id, name: t.name, summary, botName: t.botName, detail, status: b.is_error ? 'error' : 'done' }
          })
        }
        emit({ type: 'mood', mood: 'thinking' })
        break
      }

      case 'system':
        if (line.subtype === 'api_retry') {
          emit({ type: 'notice', text: `Instabilidade na API, tentando de novo (${line.attempt}/${line.max_retries})…` })
        }
        break

      case 'result': {
        const now = usageByModel(line)
        const usage = recordTurn(usageDelta(now, this.spent), turn.tag)
        this.spent = now
        if (totalTokens(usage) > 0) emit({ type: 'usage', usage })
        const denied = [...new Set((line.permission_denials ?? []).map((d) => d.tool_name))]
        if (denied.length) this.lastTurnFailed = true
        if (denied.length) {
          emit({
            type: 'notice',
            text: `Precisou de permissão para ${denied.join(', ')} e não foi permitido.`
          })
        }
        if (line.subtype === 'success' && !line.is_error) {
          if (!turn.hasText && line.result) emit({ type: 'delta', text: line.result })
          this.finish({ type: 'done' })
        } else {
          const msg = line.result || line.errors?.join('\n') || 'O Claude Code não conseguiu concluir a resposta.'
          this.finish({ type: 'error', message: msg })
        }
        break
      }
    }
  }
}
