import type { ChatProvider } from './types'
import { runInLoginShell } from './shell'

interface AuthStatus {
  loggedIn: boolean
  authMethod?: string
  subscriptionType?: string
}

/**
 * Claude Code rodando na máquina, logado na assinatura do usuário.
 * Etapa 1: só detecta instalação e login. Etapa 2: conversa via channel (`claude --channels`).
 */
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
      version = (await runInLoginShell('claude --version')).split(' ')[0]
    } catch {
      return { status: 'unavailable', detail: 'Claude Code não encontrado. Instale e rode `claude` uma vez.' }
    }

    try {
      const auth = JSON.parse(await runInLoginShell('claude auth status --json')) as AuthStatus
      if (!auth.loggedIn) {
        return { status: 'not-configured', detail: `v${version} · faça login com \`claude auth login\`` }
      }
      const plan = auth.subscriptionType ? `plano ${auth.subscriptionType}` : auth.authMethod
      return { status: 'coming-soon', detail: `v${version} · logado (${plan}) · conexão na Etapa 2` }
    } catch {
      return { status: 'coming-soon', detail: `v${version} · conexão na Etapa 2` }
    }
  },

  async send(_req, emit) {
    emit({ type: 'error', message: 'A conexão com o Claude Code chega na Etapa 2. Use o provedor Eco por enquanto.' })
  }
}
