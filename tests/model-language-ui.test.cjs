const { test } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync } = require('node:fs')
const { resolve } = require('node:path')
const { chromium } = require('playwright-core')

test('unified picker, saved language override and user content work together', { timeout: 60000 }, async (t) => {
  const executablePath = process.env.GBOT_TEST_BROWSER || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium'
  ].find(existsSync)
  if (!executablePath) return t.skip('Set GBOT_TEST_BROWSER to an installed Chromium browser.')
  const { createServer } = await import('vite')
  const react = (await import('@vitejs/plugin-react')).default
  const tailwind = (await import('@tailwindcss/vite')).default
  const server = await createServer({ configFile: false, root: resolve(__dirname, '../src/renderer'),
    plugins: [react(), tailwind()], resolve: { alias: {
      '@': resolve(__dirname, '../src/renderer/src'), '@shared': resolve(__dirname, '../src/shared')
    } }, server: { port: 0, host: '127.0.0.1' } })
  t.after(() => server.close())
  await server.listen()
  const browser = await chromium.launch({ executablePath, headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    let settings = JSON.parse(localStorage.getItem('test-settings') || '{"allowedSites":[]}')
    const chatListeners = new Set()
    const updateListeners = new Set()
    const update = { status: 'available', currentVersion: '0.2.0', version: '0.3.0' }
    const conversations = [{ id: 'existing', title: 'Novo projeto', messages: [{ id: 'message', role: 'user', text: 'Configurações é o nome do meu arquivo.', createdAt: 1 }], createdAt: 1, updatedAt: 1, messageCount: 1 }]
    const fallback = new Proxy({}, { get: (_, name) => String(name).startsWith('on') ? () => () => {} : async () => [] })
    window.testState = { settingsChanges: 0 }
    window.gbot = new Proxy({
      platform: 'win32', versions: { app: 'test' }, systemLocale: async () => 'en-US',
      updates: {
        get: async () => update,
        onChanged: (callback) => { updateListeners.add(callback); return () => updateListeners.delete(callback) },
        dismiss: async () => {
          update.dismissed = true
          window.testState.updateSkipped = true
          updateListeners.forEach((callback) => callback({ ...update }))
        }
      },
      providers: { list: async () => [
        { id: 'claude-code', name: 'Claude Code', status: 'ready', kind: 'local-cli', models: [{ id: 'default', label: 'Padrão' }, { id: 'sonnet', label: 'Sonnet' }] },
        { id: 'codex', name: 'Codex (ChatGPT)', status: 'ready', kind: 'local-cli', models: [{ id: 'default', label: 'Padrão' }, { id: 'gpt-test', label: 'GPT test' }] },
        { id: 'anthropic-api', name: 'Anthropic API', status: 'coming-soon', kind: 'api' }
      ], onActionProgress: () => () => {} },
      bots: new Proxy({ list: async () => [], save: async (bot) => { window.testState.savedBot = bot } }, { get: (obj, key) => obj[key] || fallback[key] }),
      conversations: {
        list: async () => conversations,
        get: async (id) => conversations.find((c) => c.id === id),
        save: async (chat) => { const i = conversations.findIndex((c) => c.id === chat.id); if (i >= 0) conversations[i] = chat; else conversations.push(chat) }
      },
      chat: {
        onEvent: (callback) => { chatListeners.add(callback); return () => chatListeners.delete(callback) },
        send: async (request) => {
          window.testState.request = request
          queueMicrotask(() => chatListeners.forEach((callback) => {
            callback(request.requestId, { type: 'delta', text: 'Test response' })
            callback(request.requestId, { type: 'done' })
          }))
        }
      },
      settings: {
        get: async () => settings,
        set: async (patch) => {
          settings = { ...settings, ...patch }
          localStorage.setItem('test-settings', JSON.stringify(settings))
          window.testState.settingsChanges++
          return settings
        }
      },
      usage: new Proxy({ summary: async () => undefined }, { get: (obj, key) => obj[key] || fallback[key] })
    }, { get: (obj, key) => obj[key] || fallback })
  })
  await page.goto(server.resolvedUrls.local[0])
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  const avatar = await page.evaluate(async () => {
    const { AVATARS } = await import('/src/avatars/sprites.ts')
    return structuredClone(AVATARS[0])
  })
  assert.equal(typeof avatar.name, 'string')
  assert(Array.isArray(avatar.sprite))
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click()
  await page.getByText('Configurações é o nome do meu arquivo.', { exact: true }).waitFor()
  // An available update never blocks the user from opening a chat or continuing to use the app.
  await page.getByRole('button', { name: 'Skip this version', exact: true }).click()
  assert.equal(await page.evaluate(() => window.testState.updateSkipped), true)
  assert.equal(await page.getByRole('button', { name: 'Skip this version', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'New chat', exact: true }).first().click()
  const picker = page.getByRole('button', { name: 'Provider and model', exact: true })
  assert.equal(await picker.count(), 1)
  await picker.click()
  const dialog = page.getByRole('dialog', { name: 'Choose provider and model' })
  assert.equal(await dialog.locator('select').count(), 0)
  assert(await dialog.getByRole('treeitem', { name: 'Sonnet', exact: true }).isEnabled())
  assert(await dialog.getByRole('treeitem', { name: 'Anthropic API', exact: true }).getByRole('treeitem', { name: 'Default', exact: true }).isDisabled())
  const box = await dialog.boundingBox()
  assert(box.y >= 0 && box.y + box.height <= 850)
  if (process.env.GBOT_TEST_SCREENSHOT) await page.screenshot({ path: process.env.GBOT_TEST_SCREENSHOT })
  await page.keyboard.press('Escape')
  assert(await picker.evaluate((element) => element === document.activeElement))
  await picker.click()
  await page.getByRole('textbox', { name: 'Search models' }).fill('GPT test')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  assert((await picker.innerText()).includes('GPT test'))
  await page.locator('textarea').last().fill('Keep this user text unchanged')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByText('Test response', { exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => ({ provider: window.testState.request.providerId, model: window.testState.request.model })), { provider: 'codex', model: 'gpt-test' })
  // The home architect must expose Codex too, and retain its provider on later replies.
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await picker.click()
  await dialog.getByRole('treeitem', { name: 'GPT test', exact: true }).click()
  await page.locator('textarea').last().fill('Design an automation')
  await page.getByRole('button', { name: 'Get started', exact: true }).click()
  await page.getByText('Test response', { exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => ({ provider: window.testState.request.providerId, model: window.testState.request.model, architect: window.testState.request.architect })), { provider: 'codex', model: 'gpt-test', architect: true })
  await picker.click()
  assert(await dialog.getByRole('treeitem', { name: 'GPT test', exact: true }).isEnabled())
  await page.keyboard.press('Escape')
  // Every picker gets its catalog centrally, including the bot editor.
  await page.getByRole('button', { name: 'New bot', exact: true }).click()
  await picker.click()
  assert(await dialog.getByRole('treeitem', { name: 'Sonnet', exact: true }).isEnabled())
  await dialog.getByRole('treeitem', { name: 'GPT test', exact: true }).click()
  await page.getByRole('textbox', { name: 'Bot name', exact: true }).fill('Codex bot')
  await page.locator('textarea').fill('Test bot instructions')
  await page.getByRole('button', { name: 'Create bot', exact: true }).click()
  await page.waitForFunction(() => window.testState.savedBot?.providerId === 'codex')
  assert.equal(await page.evaluate(() => window.testState.savedBot.model), 'gpt-test')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  assert(await page.getByRole('button', { name: 'Follow system', exact: true }).getAttribute('aria-pressed') === 'true')
  await page.getByRole('button', { name: 'Português (Brasil)', exact: true }).click()
  await page.getByRole('button', { name: 'Configurações', exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'pt-BR')
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('test-settings')).language), 'pt-BR')
  await page.reload()
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  assert.equal(await page.locator('html').getAttribute('lang'), 'pt-BR')
  await page.getByRole('button', { name: 'Seguir o sistema', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  assert.deepEqual(errors, [])
})
