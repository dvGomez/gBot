import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import type { Bot, ChatEvent, Conversation, Project, SendMessageRequest } from '@shared/types'
import { suggestBotIdentity } from './providers/claude-code'
import { getProvider, listProviders } from './providers/registry'
import * as store from './store'

const running = new Map<string, AbortController>()

function emitTo(sender: WebContents, requestId: string, event: ChatEvent) {
  if (!sender.isDestroyed()) sender.send('chat:event', requestId, event)
}

export function registerIpc() {
  ipcMain.handle('projects:list', () => store.listProjects())
  ipcMain.handle('projects:save', (_e, project: Project) => store.saveProject(project))
  ipcMain.handle('projects:remove', (_e, id: string) => store.removeProject(id))
  ipcMain.handle('projects:pickFolder', async (e, current?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Pasta de trabalho do projeto',
      buttonLabel: 'Usar esta pasta',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory']
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? undefined : result.filePaths[0]
  })

  ipcMain.handle('bots:list', () => store.listBots())
  ipcMain.handle('bots:save', (_e, bot: Bot) => store.saveBot(bot))
  ipcMain.handle('bots:remove', (_e, id: string) => store.removeBot(id))
  ipcMain.handle('bots:suggest', (_e, instructions: string) => suggestBotIdentity(instructions))

  ipcMain.handle('conversations:list', () => store.listConversations())
  ipcMain.handle('conversations:get', (_e, id: string) => store.getConversation(id))
  ipcMain.handle('conversations:save', (_e, c: Conversation) => store.saveConversation(c))
  ipcMain.handle('conversations:remove', (_e, id: string) => store.removeConversation(id))

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
