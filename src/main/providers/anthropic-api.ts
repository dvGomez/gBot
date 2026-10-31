import type { ChatProvider } from './types'

/** Anthropic API com chave própria (cobrança por uso). Ainda não implementado. */
export const anthropicApiProvider: ChatProvider = {
  info: {
    id: 'anthropic-api',
    name: 'Anthropic API',
    kind: 'api',
    description: 'Chamada direta à API da Anthropic com a sua chave (cobrança por uso).'
  },

  async checkStatus() {
    return { status: 'coming-soon' }
  },

  async send(_req, emit) {
    emit({ type: 'error', message: 'O provedor Anthropic API ainda não está disponível.' })
  }
}
