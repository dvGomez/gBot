import type { ChatProvider } from './types'

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new Error('aborted'))
    })
  })

/** Provedor de teste: simula "pensar" e devolve a mensagem palavra por palavra. */
export const echoProvider: ChatProvider = {
  info: {
    id: 'echo',
    name: 'Eco (teste)',
    kind: 'dev',
    description: 'Repete o que você escreveu. Serve para testar a interface sem gastar limites.'
  },

  async checkStatus() {
    return { status: 'ready' }
  },

  async send(req, emit, signal) {
    emit({ type: 'mood', mood: 'thinking' })
    await wait(900, signal)

    const reply =
      `Você disse: "${req.text.trim()}".\n\n` +
      'Sou o provedor de teste do gBot — na Etapa 2 quem responde aqui é o Claude Code, usando a sua assinatura.'

    emit({ type: 'mood', mood: 'talking' })
    for (const word of reply.split(/(\s+)/)) {
      emit({ type: 'delta', text: word })
      await wait(28, signal)
    }
    emit({ type: 'done' })
  }
}
