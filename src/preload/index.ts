import { contextBridge, ipcRenderer } from 'electron'
import type { ChatEvent, GbotApi } from '@shared/types'

declare const __APP_VERSION__: string

const api: GbotApi = {
  platform: process.platform,
  versions: { app: __APP_VERSION__, electron: process.versions.electron },
  providers: {
    list: () => ipcRenderer.invoke('providers:list')
  },
  chat: {
    send: (req) => ipcRenderer.invoke('chat:send', req),
    cancel: (requestId) => ipcRenderer.invoke('chat:cancel', requestId),
    onEvent: (listener) => {
      const handler = (_: unknown, requestId: string, event: ChatEvent) => listener(requestId, event)
      ipcRenderer.on('chat:event', handler)
      return () => ipcRenderer.removeListener('chat:event', handler)
    }
  },
  theme: {
    set: (pref) => ipcRenderer.invoke('theme:set', pref)
  }
}

contextBridge.exposeInMainWorld('gbot', api)
