import { existsSync, statSync } from 'node:fs'
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
  QuestionAnswer,
  Project,
  SendMessageRequest
} from '@shared/types'
import { saveAttachments } from './attachments'
import { addBotFiles, botFilesDir, listBotFiles, removeBotFile, setBotFileNote } from './botFiles'
import { cancelBotTask, listBotTasks, runAsBot, waitNotice } from './botQueue'
import { runFlow } from './flows/runner'
import { listAllLessons, listLessons, removeLesson, saveLesson } from './memory'
import { listAutoMemory, removeAutoMemory } from './providers/claude-code/autoMemory'
import { conversationUsage, pruneUsage, usageRecords, usageSummary } from './usage'
import * as flows from './flows/store'
import { respondApproval } from './approvals'
import { listConfirmations, respondConfirmation } from './confirmations'
import { respondQuestions } from './questions'
import { listBrowsers } from './browser/browsers'
import { browserController } from './browser/controller'
import { getSettings, updateSettings } from './settings'
import { suggestBotIdentity } from './providers/claude-code'
import { getProvider, listAccounts, listProviders, providerAccounts, refreshAccountLimits } from './providers/registry'
import * as store from './store'

const running = new Map<string, AbortController>()

function emitTo(sender: WebContents, requestId: string, event: ChatEvent) {
  if (!sender.isDestroyed()) sender.send('chat:event', requestId, event)
}

export function registerIpc() {
  ipcMain.handle('memory:list', (_e, owner: MemoryOwner) => listLessons(owner))
  ipcMain.handle('memory:all', () => listAllLessons())
  ipcMain.handle('memory:autoNotes', () => listAutoMemory())
  ipcMain.handle('memory:removeAutoNote', (_e, path: string) => removeAutoMemory(path))
  ipcMain.handle('memory:save', (_e, lesson: Lesson) => saveLesson(lesson))
  ipcMain.handle('memory:remove', (_e, owner: MemoryOwner, id: string) => removeLesson(owner, id))

  ipcMain.handle('flows:list', () => flows.listFlows())
  ipcMain.handle('flows:save', (_e, flow: Flow) => flows.saveFlow(flow))
  ipcMain.handle('flows:remove', (_e, id: string) => flows.removeFlow(id))
  ipcMain.handle('flows:runs', (_e, flowId: string) => flows.listRuns(flowId))
  pruneUsage()
  ipcMain.handle('usage:summary', () => usageSummary())
  ipcMain.handle('usage:conversation', (_e, id: string) => conversationUsage(id))
  ipcMain.handle('usage:records', (_e, since: number) => usageRecords(since))
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
  ipcMain.handle('confirmations:list', () => listConfirmations())
  ipcMain.handle('confirmations:respond', (_e, id: string, optionId: string, note?: string) => respondConfirmation(id, optionId, note))
  ipcMain.handle('questions:respond', (_e, id: string, answers?: QuestionAnswer[]) => respondQuestions(id, answers))

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
  // Arquivos gerados nas respostas. Executáveis e scripts nunca são abertos direto: só mostrados na pasta.
  ipcMain.handle('files:open', async (_e, path: string) => {
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error('O arquivo não existe mais.')
    if (/\.(app|command|sh|bash|zsh|exe|bat|cmd|ps1|msi|pkg|dmg|jar|scpt|workflow)$/i.test(path)) shell.showItemInFolder(path)
    else {
      const error = await shell.openPath(path)
      if (error) throw new Error(error)
    }
  })
  ipcMain.handle('files:reveal', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('attachments:add', (_e, conversationId: string, items: { name: string; path?: string; data?: Uint8Array }[]) =>
    saveAttachments(conversationId, items.filter((i) => i.path || i.data))
  )
  ipcMain.handle('attachments:pick', async (e, conversationId: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = { title: 'Anexar arquivos', buttonLabel: 'Anexar', properties: ['openFile', 'multiSelections'] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return []
    return saveAttachments(conversationId, result.filePaths.map((path) => ({ name: basename(path), path })))
  })
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

  ipcMain.handle('accounts:list', () => listAccounts())
  ipcMain.handle('accounts:refreshLimits', (_e, force?: boolean) => refreshAccountLimits(force))
  ipcMain.handle('accounts:setActive', (_e, providerId: string, id: string) => providerAccounts(providerId).setActive(id))
  ipcMain.handle('accounts:rename', (_e, providerId: string, id: string, name: string) =>
    providerAccounts(providerId).rename(id, name)
  )
  ipcMain.handle('accounts:remove', (_e, providerId: string, id: string) => providerAccounts(providerId).remove(id))

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
