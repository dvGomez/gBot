import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { ChatEvent } from '@shared/types'
import { ASK_BOT_TOOL, describeTool, HIDDEN_TOOLS } from './tools'

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
}

interface Turn {
  emit(event: ChatEvent): void
  done(): void
  interrupted: boolean
  hasText: boolean
  tools: Map<string, { name: string; summary: string; botName?: string }>
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

  constructor(private opts: SessionOptions) {
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode', 'manual',
      ...(opts.resume ? ['--resume', opts.sessionId] : ['--session-id', opts.sessionId]),
      ...(opts.appendSystemPrompt ? ['--append-system-prompt', opts.appendSystemPrompt] : []),
      ...(opts.model ? ['--model', opts.model] : []),
      ...(opts.mcpConfig ? ['--mcp-config', opts.mcpConfig] : []),
      ...(opts.allowedTools?.length ? ['--allowedTools', opts.allowedTools.join(',')] : [])
    ]
    // Consultar outro bot pode levar minutos: o limite de tempo de ferramentas MCP precisa acompanhar.
    const env = { ...opts.env, MCP_TOOL_TIMEOUT: String(15 * 60_000) }
    this.proc = spawn(opts.bin, args, { cwd: opts.cwd, env })
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

  /** Envia uma mensagem (depois da anterior, se houver) e resolve quando o turno termina. */
  send(text: string, emit: (event: ChatEvent) => void, signal: AbortSignal): Promise<void> {
    const run = () =>
      new Promise<void>((resolve) => {
        if (this.exited || signal.aborted) {
          if (!signal.aborted) emit({ type: 'error', message: 'A sessão do Claude Code foi encerrada.' })
          return resolve()
        }
        this.lastUsed = Date.now()
        this.lastTurnFailed = false
        this.turn = { emit, done: resolve, interrupted: false, hasText: false, tools: new Map() }
        signal.addEventListener('abort', () => this.interrupt(), { once: true })
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
    if (!this.exited) this.proc.kill('SIGTERM')
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
        const denied = [...new Set((line.permission_denials ?? []).map((d) => d.tool_name))]
        if (denied.length) this.lastTurnFailed = true
        if (denied.length) {
          emit({
            type: 'notice',
            text: `Precisou de permissão para ${denied.join(', ')} e foi negado (o gBot ainda não aprova essas ações).`
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
