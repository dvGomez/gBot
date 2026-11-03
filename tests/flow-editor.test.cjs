const { test } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync } = require('node:fs')
const { resolve } = require('node:path')
const { chromium } = require('playwright-core')

// An isolated browser and fake preload keep this test away from the user's running flows and accounts.
test('editor bloqueia alterações durante execução e libera depois de Parar tudo', { timeout: 60000 }, async (t) => {
  const executablePath = process.env.GBOT_TEST_BROWSER || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium'
  ].find(existsSync)
  if (!executablePath) return t.skip('Defina GBOT_TEST_BROWSER para testar com um navegador Chromium instalado.')
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    const bot = { id: 'b1', name: 'Bot de teste', description: '', instructions: '', specializationIds: [], createdAt: 1, updatedAt: 1 }
    const flow = { id: 'test', botId: 'b1', name: 'Rotina de teste', enabled: false, createdAt: 1, updatedAt: 1,
      nodes: [
        { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'p', type: 'task', position: { x: 320, y: 0 }, data: { label: 'Etapa de teste', message: 'Mensagem' } }
      ], edges: [{ id: 'e', source: 't', target: 'p' }] }
    const run = { id: 'run', flowId: 'test', trigger: 'manual', status: 'running', startedAt: Date.now(),
      steps: [{ nodeId: 'p', label: 'Etapa de teste', status: 'running' }] }
    const listeners = new Set()
    window.testFlow = { saves: 0, stops: 0 }
    const onRunUpdate = (callback) => { listeners.add(callback); return () => listeners.delete(callback) }
    const fallback = new Proxy({}, { get: (_, name) => String(name).startsWith('on') ? () => () => {} : async () => [] })
    window.gbot = new Proxy({ platform: 'win32', versions: { app: 'test' },
      providers: { ...fallback, list: async () => [{ id: 'claude-code', name: 'Teste', kind: 'local-cli', status: 'ready', models: [] }] },
      bots: { list: async () => [bot], save: async () => {}, tasks: async () => [], onTasks: () => () => {} },
      flows: { list: async () => [flow], runs: async () => [structuredClone(run)], onRunUpdate,
        save: async () => {
          if (run.status === 'running') throw new Error('Rotina em execução')
          window.testFlow.saves++
        },
        stop: async () => {
          window.testFlow.stops++
          run.status = 'stopped'; run.finishedAt = Date.now(); run.steps[0].status = 'stopped'
          listeners.forEach((callback) => callback(structuredClone(run)))
        }
      },
      usage: new Proxy({ summary: async () => undefined }, { get: (obj, key) => obj[key] || fallback[key] }),
      settings: { get: async () => ({ allowedSites: [], language: 'pt-BR' }) }
    }, { get: (obj, key) => obj[key] || fallback })
    window.gbot.providers.onActionProgress = () => () => {}
  })
  await page.goto(server.resolvedUrls.local[0])
  // A rotina fica na página do bot dono dela.
  await page.locator('nav').getByText('Bot de teste', { exact: true }).click()
  await page.getByRole('button', { name: /^Rotina de teste/ }).first().click()
  await page.getByRole('button', { name: 'Parar tudo', exact: true }).waitFor()
  assert(await page.getByRole('textbox', { name: 'Nome da rotina' }).isDisabled())
  for (const name of ['Tarefa', 'Decisão', 'Confirmação']) {
    assert(await page.getByRole('button', { name, exact: true }).isDisabled(), name)
  }
  await page.locator('.react-flow__node[data-id="p"]').click()
  assert(await page.locator('aside fieldset input').first().isDisabled())
  const position = await page.locator('.react-flow__node[data-id="p"]').getAttribute('style')
  await page.locator('.react-flow__node[data-id="p"]').dragTo(page.locator('.react-flow__node[data-id="t"]'))
  assert.equal(await page.locator('.react-flow__node[data-id="p"]').getAttribute('style'), position)
  assert.equal(await page.evaluate(() => window.testFlow.saves), 0)
  await page.getByRole('button', { name: 'Parar tudo', exact: true }).click()
  await page.getByRole('button', { name: 'Rodar agora', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.testFlow.stops), 1)
  assert(await page.getByRole('textbox', { name: 'Nome da rotina' }).isEnabled())
  assert(await page.getByRole('button', { name: 'Tarefa', exact: true }).isEnabled())
  await page.getByRole('button', { name: 'Execuções (1)', exact: true }).click()
  await page.getByText(/Parado por você/).first().waitFor()
  await page.getByRole('button', { name: 'Tarefa', exact: true }).click()
  await page.waitForFunction(() => window.testFlow.saves > 0)
  assert.equal(await page.locator('.react-flow__node').count(), 3)
  assert.deepEqual(errors, [])
})
