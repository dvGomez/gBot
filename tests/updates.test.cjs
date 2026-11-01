const { test } = require('node:test')
const assert = require('node:assert/strict')
const { resolve } = require('node:path')
const { createJiti } = require('jiti')
const mock = resolve(__dirname, 'helpers/updater-runtime.cjs')
const { state, app, autoUpdater } = require(mock)
const jiti = createJiti(__filename, { alias: Object.fromEntries([
  'electron', 'electron-updater', './settings', './localization', './flows/store', './flows/runner', './botQueue'
].map((key) => [key, mock])) })
const { startUpdates, checkUpdates, dismissUpdate, downloadUpdate, installUpdate, updateState } = jiti('../src/main/updates.ts')

test('updates respect download preference, active tasks and explicit installation', async (t) => {
  t.after(() => app.emit('before-quit'))
  startUpdates(() => {}, () => state.chatBusy)
  assert.equal(autoUpdater.autoInstallOnAppQuit, false)
  assert.equal(autoUpdater.allowPrerelease, false)
  await checkUpdates()
  assert.equal(updateState().status, 'available')
  assert.equal(state.downloads, 0)
  dismissUpdate()
  assert.equal(updateState().dismissed, true)
  assert.equal(state.ignored, '0.3.0')
  state.autoDownload = true
  await checkUpdates()
  assert.equal(updateState().dismissed, true)
  assert.equal(state.downloads, 0)
  await downloadUpdate()
  assert.equal(updateState().status, 'downloaded')
  assert.equal(updateState().version, '0.3.0')
  assert.equal(state.downloads, 1)
  assert.equal(state.installs, 0)
  state.chatBusy = true
  assert.throws(installUpdate, /tarefas/)
  state.chatBusy = false
  state.tasks = [{}]
  assert.throws(installUpdate, /tarefas/)
  state.tasks = []
  state.flowBusy = true
  assert.throws(installUpdate, /tarefas/)
  state.flowBusy = false
  installUpdate()
  await new Promise((r) => setImmediate(r))
  assert.equal(state.installs, 1)
  app.isPackaged = false
  await checkUpdates()
  assert.equal(updateState().status, 'development')
  assert.equal(state.checks, 2)
})
