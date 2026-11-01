import { basename, join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import type {
  AppSettings,
  ApprovalDecision,
  Bot,
  ChatEvent,
  Conversation,
  Flow,
  Lesson,
  MemoryOwner,
  Project,
  SendMessageRequest
} from '@shared/types'
import { addBotFiles, botFilesDir, listBotFiles, removeBotFile, setBotFileNote } from './botFiles'
import { cancelBotTask, listBotTasks, runAsBot, waitNotice } from './botQueue'
import { runFlow } from './flows/runner'
import { listLessons, removeLesson, saveLesson } from './memory'
import * as flows from './flows/store'
import { respondApproval } from './approvals'
import { listBrowsers } from './browser/browsers'
import { browserController } from './browser/controller'
import { getSettings, updateSettings } from './settings'
import { suggestBotIdentity } from './providers/claude-code'
import { getProvider, listProviders } from './providers/registry'
import * as store from './store'

const running = new Map<string, AbortController>()

function emitTo(sender: WebContents, requestId: string, event: ChatEvent) {
  if (!sender.isDestroyed()) sender.send('chat:event', requestId, event)
}

export function registerIpc() {
  ipcMain.handle('memory:list', (_e, owner: MemoryOwner) => listLessons(owner))
  ipcMain.handle('memory:save', (_e, lesson: Lesson) => saveLesson(lesson))
  ipcMain.handle('memory:remove', (_e, owner: MemoryOwner, id: string) => removeLesson(owner, id))

  ipcMain.handle('flows:list', () => flows.listFlows())
  ipcMain.handle('flows:save', (_e, flow: Flow) => flows.saveFlow(flow))
  ipcMain.handle('flows:remove', (_e, id: string) => flows.removeFlow(id))
  ipcMain.handle('flows:runs', (_e, flowId: string) => flows.listRuns(flowId))
  ipcMain.handle('flows:run', (_e, id: string) => {
    const flow = flows.getFlow(id)
    if (!flow) throw new Error('Fluxo não encontrado.')
    return runFlow(flow, 'manual')
  })

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => updateSettings(patch))
  ipcMain.handle('browser:list', () => listBrowsers())
  ipcMain.handle('browser:open', () => browserController.show())
  ipcMain.handle('approvals:respond', (_e, id: string, decision: ApprovalDecision) => respondApproval(id, decision))

  ipcMain.handle('projects:list', () => store.listProjects())
  ipcMain.handle('projects:save', (_e, project: Project) => store.saveProject(project))
  ipcMain.handle('projects:remove', (_e, id: string) => {
    store.removeProject(id)
    flows.detachFlows(id)
  })
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
  ipcMain.handle('bots:tasks', () => listBotTasks())
  ipcMain.handle('bots:cancel-task', (_e, id: string) => cancelBotTask(id))
  ipcMain.handle('bots:files', (_e, botId: string) => listBotFiles(botId))
  ipcMain.handle('bots:add-files', async (e, botId: string, paths?: string[]) => {
    if (!paths) {
      const win = BrowserWindow.fromWebContents(e.sender)
      const options: Electron.OpenDialogOptions = {
        title: 'Arquivos de referência do bot',
        buttonLabel: 'Adicionar',
        properties: ['openFile', 'multiSelections']
      }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (result.canceled) return listBotFiles(botId)
      paths = result.filePaths
    }
    return addBotFiles(botId, paths)
  })
  ipcMain.handle('bots:remove-file', (_e, botId: string, name: string) => removeBotFile(botId, name))
  ipcMain.handle('bots:file-note', (_e, botId: string, name: string, note: string) => setBotFileNote(botId, name, note))
  ipcMain.handle('bots:reveal-file', (_e, botId: string, name: string) => shell.showItemInFolder(join(botFilesDir(botId), basename(name))))

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
    const emit = (ev: ChatEvent) => emitTo(e.sender, req.requestId, ev)
    // Mensagem para um bot (conversa com ele ou @menção) entra na fila dele: um bot faz uma tarefa por vez.
    const bot = store.getBot(req.targetBotId ?? req.bot?.id ?? '')
    try {
      if (bot) {
        const title = store.getConversation(req.conversationId)?.title
        await runAsBot(
          bot.id,
          { label: title ? `Conversa "${title}"` : 'Conversa', origin: 'chat', originId: req.conversationId },
          controller.signal,
          (signal) => provider.send(req, emit, signal),
          (ahead) => emit({ type: 'notice', text: waitNotice(bot.name, ahead) })
        )
      } else {
        await provider.send(req, emit, controller.signal)
      }
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
