import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Persona } from '@shared/types'
import type { ChatProvider } from '../types'
import { runInLoginShell } from '../shell'
import { resolveClaudeEnv } from './env'
import { ClaudeSession } from './session'

interface AuthStatus {
  loggedIn: boolean
  authMethod?: string
  subscriptionType?: string
}

/** Sessões abertas, uma por conversa. Processos parados há muito tempo são encerrados. */
const sessions = new Map<string, ClaudeSession>()
/** Conversas que já têm sessão salva em disco pelo Claude Code (para usar `--resume`). */
const started = new Set<string>()
const IDLE_MS = 15 * 60_000

setInterval(() => {
  for (const [id, s] of sessions) {
    if (!s.busy && Date.now() - s.lastUsed > IDLE_MS) {
      s.kill()
      sessions.delete(id)
    }
  }
}, 60_000).unref()

app.on('before-quit', () => sessions.forEach((s) => s.kill()))

/** Pasta onde o Claude Code trabalha. Configurável numa etapa futura. */
export function workspaceDir(): string {
  const dir = join(app.getPath('userData'), 'workspace')
  mkdirSync(dir, { recursive: true })
  return dir
}

function systemPrompt(persona: Persona | undefined, cwd: string): string {
  return [
    'Você está conversando com o usuário pelo gBot, um aplicativo de chat para desktop.',
    persona && `Nesta conversa você se apresenta como ${persona.name} — ${persona.personality.toLowerCase()}.`,
    'Responda no idioma do usuário, de forma direta e amigável. Use Markdown quando ajudar a leitura.',
    `Sua pasta de trabalho é ${cwd}.`,
    'O gBot ainda não consegue mostrar pedidos de permissão: ações que precisam de aprovação serão negadas. Se precisar de uma, explique ao usuário o que faria.'
  ]
    .filter(Boolean)
    .join(' ')
}

/** Claude Code instalado na máquina, logado na assinatura do usuário (binário oficial, sem modificações). */
export const claudeCodeProvider: ChatProvider = {
  info: {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'local-cli',
    description: 'Usa o Claude Code instalado neste computador, com os limites da sua assinatura.'
  },

  async checkStatus() {
    let version: string
    try {
      const { bin } = await resolveClaudeEnv()
      version = (await runInLoginShell(`"${bin}" --version`)).split(' ')[0]
    } catch {
      return { status: 'unavailable', detail: 'Claude Code não encontrado. Instale e rode `claude` uma vez.' }
    }

    try {
      const auth = JSON.parse(await runInLoginShell('claude auth status --json')) as AuthStatus
      if (!auth.loggedIn) return { status: 'not-configured', detail: `v${version} · faça login com \`claude auth login\`` }
      const plan = auth.subscriptionType ? `plano ${auth.subscriptionType}` : auth.authMethod
      return { status: 'ready', detail: `v${version} · logado (${plan})` }
    } catch {
      return { status: 'ready', detail: `v${version}` }
    }
  },

  async send(req, emit, signal) {
    const env = await resolveClaudeEnv()
    let session = sessions.get(req.conversationId)
    if (!session || session.exited) {
      const cwd = workspaceDir()
      session = new ClaudeSession({
        ...env,
        cwd,
        sessionId: req.conversationId,
        resume: started.has(req.conversationId),
        appendSystemPrompt: systemPrompt(req.persona, cwd)
      })
      sessions.set(req.conversationId, session)
      started.add(req.conversationId)
    }
    await session.send(req.text, emit, signal)
  }
}
