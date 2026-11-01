const { EventEmitter } = require('node:events')
const state = { autoDownload: false, chatBusy: false, flowBusy: false, tasks: [], checks: 0, downloads: 0, installs: 0 }
const app = Object.assign(new EventEmitter(), { isPackaged: true, getVersion: () => '0.2.0' })
const autoUpdater = Object.assign(new EventEmitter(), {
  checkForUpdates: async () => { state.checks++; autoUpdater.emit('update-available', { version: '0.3.0' }) },
  downloadUpdate: async () => {
    state.downloads++
    autoUpdater.emit('download-progress', { percent: 50 })
    autoUpdater.emit('update-downloaded', { version: '0.3.0' })
  },
  quitAndInstall: () => { state.installs++ }
})
module.exports = { state, app, autoUpdater,
  BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false },
  shell: { openExternal: async () => {} },
  getSettings: () => ({ autoDownloadUpdates: state.autoDownload, ignoredUpdateVersion: state.ignored }),
  updateSettings: (patch) => { state.ignored = patch.ignoredUpdateVersion }, uiText: (text) => text,
  listFlows: () => [{ id: 'test' }], isFlowRunning: () => state.flowBusy, listBotTasks: () => state.tasks
}
