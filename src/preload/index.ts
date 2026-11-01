import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ApprovalRequest, BotTask, ChatEvent, FlowRun, GbotApi, MemoryOwner, ProviderActionProgress } from '@shared/types'

declare const __APP_VERSION__: string

const api: GbotApi = {
  platform: process.platform,
  versions: { app: __APP_VERSION__, electron: process.versions.electron },
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    runAction: (providerId, actionId) => ipcRenderer.invoke('providers:action', providerId, actionId),
    onActionProgress: (listener) => {
      const handler = (_: unknown, progress: ProviderActionProgress) => listener(progress)
      ipcRenderer.on('providers:progress', handler)
      return () => ipcRenderer.removeListener('providers:progress', handler)
    }
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    save: (project) => ipcRenderer.invoke('projects:save', project),
    remove: (id) => ipcRenderer.invoke('projects:remove', id),
    pickFolder: (current) => ipcRenderer.invoke('projects:pickFolder', current)
  },
  bots: {
    list: () => ipcRenderer.invoke('bots:list'),
    save: (bot) => ipcRenderer.invoke('bots:save', bot),
    remove: (id) => ipcRenderer.invoke('bots:remove', id),
    suggest: (instructions) => ipcRenderer.invoke('bots:suggest', instructions),
    tasks: () => ipcRenderer.invoke('bots:tasks'),
    cancelTask: (id) => ipcRenderer.invoke('bots:cancel-task', id),
    files: (botId) => ipcRenderer.invoke('bots:files', botId),
    // Arquivos arrastados chegam como File: o caminho real só é acessível aqui no preload.
    addFiles: (botId, files) => ipcRenderer.invoke('bots:add-files', botId, files?.map((f) => webUtils.getPathForFile(f))),
    removeFile: (botId, name) => ipcRenderer.invoke('bots:remove-file', botId, name),
    setFileNote: (botId, name, note) => ipcRenderer.invoke('bots:file-note', botId, name, note),
    revealFile: (botId, name) => ipcRenderer.invoke('bots:reveal-file', botId, name),
    onTasks: (cb) => {
      const handler = (_e: Electron.IpcRendererEvent, tasks: BotTask[]) => cb(tasks)
      ipcRenderer.on('bots:tasks', handler)
      return () => ipcRenderer.removeListener('bots:tasks', handler)
    }
  },
  conversations: {
    list: () => ipcRenderer.invoke('conversations:list'),
    get: (id) => ipcRenderer.invoke('conversations:get', id),
    save: (c) => ipcRenderer.invoke('conversations:save', c),
    remove: (id) => ipcRenderer.invoke('conversations:remove', id)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },
  files: {
    open: (path) => ipcRenderer.invoke('files:open', path),
    reveal: (path) => ipcRenderer.invoke('files:reveal', path)
  },
  attachments: {
    add: (conversationId, files) =>
      ipcRenderer.invoke('attachments:add', conversationId, files.map((f) => ({ name: f.name, path: webUtils.getPathForFile(f) }))),
    addData: (conversationId, name, data) => ipcRenderer.invoke('attachments:add', conversationId, [{ name, data }]),
    pick: (conversationId) => ipcRenderer.invoke('attachments:pick', conversationId)
  },
  browser: {
    list: () => ipcRenderer.invoke('browser:list'),
    open: () => ipcRenderer.invoke('browser:open')
  },
  approvals: {
    onRequest: (listener) => {
      const handler = (_: unknown, req: ApprovalRequest) => listener(req)
      ipcRenderer.on('approval:request', handler)
      return () => ipcRenderer.removeListener('approval:request', handler)
    },
    onResolved: (listener) => {
      const handler = (_: unknown, id: string) => listener(id)
      ipcRenderer.on('approval:resolved', handler)
      return () => ipcRenderer.removeListener('approval:resolved', handler)
    },
    respond: (id, decision) => ipcRenderer.invoke('approvals:respond', id, decision)
  },
  memory: {
    list: (owner) => ipcRenderer.invoke('memory:list', owner),
    all: () => ipcRenderer.invoke('memory:all'),
    autoNotes: () => ipcRenderer.invoke('memory:autoNotes'),
    removeAutoNote: (path) => ipcRenderer.invoke('memory:removeAutoNote', path),
    save: (lesson) => ipcRenderer.invoke('memory:save', lesson),
    remove: (owner, id) => ipcRenderer.invoke('memory:remove', owner, id),
    onChanged: (listener) => {
      const handler = (_: unknown, owner: MemoryOwner) => listener(owner)
      ipcRenderer.on('memory:changed', handler)
      return () => ipcRenderer.removeListener('memory:changed', handler)
    }
  },
  usage: {
    summary: () => ipcRenderer.invoke('usage:summary'),
    conversation: (id) => ipcRenderer.invoke('usage:conversation', id),
    records: (since) => ipcRenderer.invoke('usage:records', since),
    onChanged: (listener) => {
      const handler = () => listener()
      ipcRenderer.on('usage:changed', handler)
      return () => ipcRenderer.removeListener('usage:changed', handler)
    }
  },
  flows: {
    list: () => ipcRenderer.invoke('flows:list'),
    save: (flow) => ipcRenderer.invoke('flows:save', flow),
    remove: (id) => ipcRenderer.invoke('flows:remove', id),
    run: (id) => ipcRenderer.invoke('flows:run', id),
    runs: (flowId) => ipcRenderer.invoke('flows:runs', flowId),
    onRunUpdate: (listener) => {
      const handler = (_: unknown, run: FlowRun) => listener(run)
      ipcRenderer.on('flows:run-update', handler)
      return () => ipcRenderer.removeListener('flows:run-update', handler)
    }
  },
  chat: {
    send: (req) => ipcRenderer.invoke('chat:send', req),
    cancel: (requestId) => ipcRenderer.invoke('chat:cancel', requestId),
    onEvent: (listener) => {
      const handler = (_: unknown, requestId: string, event: ChatEvent) => listener(requestId, event)
      ipcRenderer.on('chat:event', handler)
      return () => ipcRenderer.removeListener('chat:event', handler)
    }
  }
}

contextBridge.exposeInMainWorld('gbot', api)
