import { contextBridge, ipcRenderer } from 'electron'
import type { ApprovalRequest, ChatEvent, GbotApi, ProviderActionProgress } from '@shared/types'

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
    suggest: (instructions) => ipcRenderer.invoke('bots:suggest', instructions)
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
