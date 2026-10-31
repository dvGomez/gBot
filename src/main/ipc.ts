import { ipcMain, type WebContents } from 'electron'
import type { ChatEvent, SendMessageRequest } from '@shared/types'
import { getProvider, listProviders } from './providers/registry'

const running = new Map<string, AbortController>()

function emitTo(sender: WebContents, requestId: string, event: ChatEvent) {
  if (!sender.isDestroyed()) sender.send('chat:event', requestId, event)
}

export function registerIpc() {
  ipcMain.handle('providers:list', () => listProviders())

  ipcMain.handle('providers:action', async (e, providerId: string, actionId: string) => {
    const provider = getProvider(providerId)
    if (!provider?.runAction) throw new Error('Ação indisponível')
    return provider.runAction(actionId, (text, url) => {
      if (!e.sender.isDestroyed()) e.sender.send('providers:progress', { providerId, actionId, text, url })
    })
  })

  ipcMain.handle('chat:send', async (e, req: SendMessageRequest) => {
    const provider = getProvider(req.providerId)
    if (!provider) {
      emitTo(e.sender, req.requestId, { type: 'error', message: `Provedor desconhecido: ${req.providerId}` })
      return
    }

    const controller = new AbortController()
    running.set(req.requestId, controller)
    try {
      await provider.send(req, (ev) => emitTo(e.sender, req.requestId, ev), controller.signal)
    } catch (err) {
      if (controller.signal.aborted) emitTo(e.sender, req.requestId, { type: 'done' })
      else emitTo(e.sender, req.requestId, { type: 'error', message: (err as Error).message })
    } finally {
      running.delete(req.requestId)
    }
  })

  ipcMain.handle('chat:cancel', (_e, requestId: string) => {
    running.get(requestId)?.abort()
  })
}
