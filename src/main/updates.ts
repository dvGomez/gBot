import { execFile } from 'node:child_process'
import { dirname } from 'node:path'
import { app, BrowserWindow, Notification, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AppUpdateState } from '@shared/types'
import { getSettings, updateSettings } from './settings'
import { uiText } from './localization'
import { listFlows } from './flows/store'
import { isFlowRunning } from './flows/runner'
import { listBotTasks } from './botQueue'

const releasesUrl = 'https://github.com/dvGomez/gBot/releases/latest'
let state: AppUpdateState = { status: app.isPackaged ? 'idle' : 'development', currentVersion: app.getVersion() }
let initialized = false
let manual = false
let checking: Promise<void> | undefined
let downloading: Promise<void> | undefined
let openWindow: () => void = () => undefined
let hasChatWork: () => boolean = () => false
const announced = new Set<string>()

function publish(patch: Partial<AppUpdateState>) {
  state = { ...state, ...patch }
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('updates:changed', state)
}

function notify(title: string, body: string) {
  if (!Notification.isSupported()) return
  const notification = new Notification({ title: uiText(title), body: uiText(body) })
  notification.on('click', openWindow)
  notification.on('failed', () => undefined)
  notification.show()
}

/** Unsigned/ad-hoc macOS builds cannot be installed by Squirrel.Mac; offer the verified release page instead. */
async function canInstall() {
  if (process.platform !== 'darwin') return true
  return new Promise<boolean>((resolve) => {
    execFile('codesign', ['-dv', '--verbose=2', dirname(dirname(dirname(process.execPath)))], { timeout: 10000 }, (error, _stdout, stderr) =>
      resolve(!error && /Authority=Developer ID Application:/.test(stderr)))
  })
}

export const updateState = () => state

export function startUpdates(showWindow: () => void, chatWork: () => boolean) {
  if (initialized || !app.isPackaged) return
  initialized = true
  openWindow = showWindow
  hasChatWork = chatWork
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.on('checking-for-update', () => publish({ status: 'checking', error: undefined }))
  autoUpdater.on('update-not-available', () => publish({ status: 'up-to-date', error: undefined }))
  autoUpdater.on('update-available', (info) => {
    const dismissed = getSettings().ignoredUpdateVersion === info.version
    publish({ status: manual ? 'manual' : 'available', version: info.version, error: undefined, dismissed })
    if (!dismissed && !announced.has(info.version)) {
      announced.add(info.version)
      notify('Nova versão do gBot', 'Uma atualização está disponível. Abra o gBot para ver os detalhes.')
    }
    if (!dismissed && !manual && getSettings().autoDownloadUpdates !== false) void downloadUpdate().catch(() => undefined)
  })
  autoUpdater.on('download-progress', (progress) => publish({ status: 'downloading', percent: Math.round(progress.percent) }))
  autoUpdater.on('update-downloaded', (info) => {
    publish({ status: 'downloaded', version: info.version, percent: 100, error: undefined })
    if (!state.dismissed) notify('Atualização pronta', 'A nova versão foi baixada. Reinicie o gBot quando suas tarefas terminarem para instalar.')
  })
  autoUpdater.on('error', (error) => publish({ status: 'error', error: error.message }))
  const timer = setTimeout(() => void checkUpdates().catch(() => undefined), 15000)
  timer.unref()
  const interval = setInterval(() => void checkUpdates().catch(() => undefined), 4 * 60 * 60_000)
  interval.unref()
  app.once('before-quit', () => { clearTimeout(timer); clearInterval(interval) })
}

export async function checkUpdates(): Promise<void> {
  if (!app.isPackaged) { publish({ status: 'development' }); return }
  if (state.status === 'downloading' || state.status === 'downloaded') return
  if (checking) return checking
  checking = (async () => {
    try {
      manual = !(await canInstall())
      await autoUpdater.checkForUpdates()
    } catch (error) {
      publish({ status: 'error', error: (error as Error).message })
    } finally { checking = undefined }
  })()
  return checking
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged || manual || state.status === 'downloaded') return
  if (downloading) return downloading
  if (state.status !== 'available' && state.status !== 'error') return
  downloading = (async () => {
    try {
      publish({ status: 'downloading', percent: 0, error: undefined, dismissed: false })
      await autoUpdater.downloadUpdate()
    } catch (error) {
      publish({ status: 'error', error: (error as Error).message })
    } finally { downloading = undefined }
  })()
  return downloading
}

export function installUpdate() {
  if (!app.isPackaged || manual || state.status !== 'downloaded') return
  const busy = () => hasChatWork() || listBotTasks().length > 0 || listFlows().some((flow) => isFlowRunning(flow.id))
  if (busy()) {
    throw new Error(uiText('Aguarde as tarefas terminarem ou pare as execuções antes de reiniciar.'))
  }
  // The installer starts after the IPC response reaches the renderer.
  setImmediate(() => {
    if (busy()) {
      publish({ error: uiText('Aguarde as tarefas terminarem ou pare as execuções antes de reiniciar.') })
      return
    }
    autoUpdater.quitAndInstall(false, true)
  })
}

export function dismissUpdate() {
  if (!state.version) return
  updateSettings({ ignoredUpdateVersion: state.version })
  publish({ dismissed: true })
}

export const openUpdateRelease = () => shell.openExternal(releasesUrl)
