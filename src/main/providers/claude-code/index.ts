import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Persona } from '@shared/types'
import type { ChatProvider } from '../types'
import { resolveClaudeEnv, runClaude } from './env'
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

function closeAllSessions() {
  sessions.forEach((s) => s.kill())
  sessions.clear()
}

app.on('before-quit', closeAllSessions)

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
      version = (await runClaude(['--version'])).split(' ')[0]
    } catch {
      return { status: 'unavailable', detail: 'Claude Code não encontrado. Instale e rode `claude` uma vez no terminal.' }
    }

    let auth: AuthStatus = { loggedIn: false }
    try {
      auth = JSON.parse(await runClaude(['auth', 'status', '--json'])) as AuthStatus
    } catch {
      // sem login ainda: `auth status` pode sair com erro
    }
    if (!auth.loggedIn) {
      return {
        status: 'not-configured',
        detail: `v${version} · entre com a sua conta Claude para usar a assinatura`,
        actions: [{ id: 'login', label: 'Entrar com conta Claude', primary: true }]
      }
    }
    const plan = auth.subscriptionType ? `plano ${auth.subscriptionType}` : auth.authMethod
    return { status: 'ready', detail: `v${version} · logado (${plan})`, actions: [{ id: 'logout', label: 'Sair' }] }
  },

  async runAction(actionId, progress) {
    const { bin, env } = await resolveClaudeEnv()

    if (actionId === 'logout') {
      closeAllSessions()
      await runClaude(['auth', 'logout'])
      return 'Você saiu da conta Claude no gBot.'
    }

    if (actionId !== 'login') throw new Error(`Ação desconhecida: ${actionId}`)

    // Login oficial do Claude Code: abre o navegador e conclui sozinho quando você autoriza.
    progress('Abrindo o navegador para você entrar na sua conta Claude…')
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, ['auth', 'login', '--claudeai'], { env })
      let output = ''
      const onOutput = (chunk: Buffer) => {
        output += chunk.toString()
        const url = output.match(/https:\/\/\S+/)?.[0]
        if (url) progress('Conclua o login no navegador. Se ele não abriu, use o link abaixo.', url)
      }
      proc.stdout.on('data', onOutput)
      proc.stderr.on('data', onOutput)
      const timer = setTimeout(() => proc.kill('SIGTERM'), 5 * 60_000)
      proc.on('error', (err) => reject(err))
      proc.on('exit', (code) => {
        clearTimeout(timer)
        closeAllSessions()
        if (code === 0) resolve('Login concluído.')
        else reject(new Error(output.trim().split('\n').at(-1) || 'O login não foi concluído.'))
      })
    })
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
