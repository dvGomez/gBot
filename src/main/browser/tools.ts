import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Page } from 'playwright-core'
import { z } from 'zod'
import { requestApproval } from '../approvals'
import { browserController } from './controller'

/** Quem chama a ferramenta (para o pedido de aprovação mostrar a conversa e o nome certos). */
export interface BrowserCaller {
  conversationId: string
  callerName: string
}

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
const text = (t: string): { content: Content[] } => ({ content: [{ type: 'text', text: t }] })
const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true })

function hostOf(url: string): string {
  try {
    const u = new URL(url)
    return u.protocol.startsWith('http') ? u.hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

function normalizeUrl(url: string): string {
  const u = url.trim()
  return /^[a-z]+:\/\//i.test(u) || u.startsWith('about:') ? u : `https://${u}`
}

/** Pede aprovação para agir num site; páginas sem site (about:blank) passam direto. */
async function approve(caller: BrowserCaller, host: string, action: string) {
  if (!host) return
  const decision = await requestApproval({
    conversationId: caller.conversationId,
    requester: caller.callerName,
    host,
    action
  })
  if (decision === 'deny') throw new Error(`O usuário não permitiu: ${action}. Não tente de novo a menos que ele peça.`)
}

/** Lê a página: título, endereço, elementos clicáveis numerados ([n]) e o texto visível. */
const SNAPSHOT = `(() => {
  const MAX = 150
  document.querySelectorAll('[data-gbot-ref]').forEach((e) => e.removeAttribute('data-gbot-ref'))
  const sel = 'a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=radio], [role=switch], [role=option], [role=combobox], [role=textbox], [contenteditable="true"]'
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
  }
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
  const label = (el) =>
    clean(el.getAttribute('aria-label')) || clean(el.labels && el.labels[0] && el.labels[0].innerText) ||
    clean(el.getAttribute('placeholder')) || clean(el.innerText) || clean(el.getAttribute('title')) ||
    clean(el.getAttribute('alt')) || clean(el.getAttribute('name')) || clean(el.value)
  const kind = (el) => {
    const role = el.getAttribute('role')
    if (role) return role
    const t = el.tagName.toLowerCase()
    if (t === 'a') return 'link'
    if (t === 'button' || t === 'summary') return 'botão'
    if (t === 'select') return 'lista'
    if (t === 'textarea') return 'campo de texto'
    if (t === 'input') {
      const ty = (el.getAttribute('type') || 'text').toLowerCase()
      if (ty === 'checkbox') return 'caixa de seleção'
      if (ty === 'radio') return 'opção'
      if (ty === 'submit' || ty === 'button') return 'botão'
      if (ty === 'password') return 'campo de senha'
      return 'campo de texto'
    }
    if (el.isContentEditable) return 'campo de texto'
    return t
  }
  const out = []
  let n = 0
  for (const el of document.querySelectorAll(sel)) {
    if (n >= MAX) break
    if (!visible(el)) continue
    n++
    el.setAttribute('data-gbot-ref', String(n))
    let line = '[' + n + '] ' + kind(el) + ' "' + label(el) + '"'
    if (el.tagName === 'A') line += ' -> ' + (el.getAttribute('href') || '').slice(0, 80)
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) line += el.checked ? ' (marcado)' : ' (desmarcado)'
    else if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.value)
      line += el.type === 'password' ? ' (preenchido)' : ' (valor: "' + el.value.slice(0, 40) + '")'
    out.push(line)
  }
  const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 6000)
  return { title: document.title, url: location.href, elements: out, text, truncated: n >= MAX }
})()`

async function readPage(page: Page): Promise<string> {
  const snap = (await page.evaluate(SNAPSHOT)) as {
    title: string
    url: string
    elements: string[]
    text: string
    truncated: boolean
  }
  return [
    `Página: ${snap.title || '(sem título)'} — ${snap.url}`,
    '',
    'Elementos (use o número em browser_click / browser_type):',
    ...(snap.elements.length ? snap.elements : ['(nenhum)']),
    snap.truncated ? '(lista cortada: role a página ou navegue para ver mais)' : '',
    '',
    'Texto da página:',
    snap.text || '(vazio)'
  ].join('\n')
}

async function element(page: Page, ref: number) {
  const loc = page.locator(`[data-gbot-ref="${ref}"]`)
  if ((await loc.count()) === 0) throw new Error(`Não achei o elemento [${ref}]. Use browser_read de novo: a página pode ter mudado.`)
  return loc.first()
}

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(600)
}

/** Ferramentas de navegador no servidor MCP do gBot. Toda ação num site passa pela aprovação do usuário. */
export function registerBrowserTools(server: McpServer, caller: BrowserCaller) {
  const run = async (fn: () => Promise<{ content: Content[] }>) => {
    try {
      return await fn()
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  server.registerTool(
    'browser_navigate',
    {
      description:
        'Abre um endereço no navegador do gBot (Edge/Chrome com perfil próprio, onde o usuário pode estar logado) e devolve a página lida.',
      inputSchema: { url: z.string().describe('Endereço, ex.: https://github.com ou outlook.office.com') }
    },
    ({ url }) =>
      run(async () => {
        const target = normalizeUrl(url)
        await approve(caller, hostOf(target), `Abrir ${target}`)
        const page = await browserController.page()
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await settle(page)
        return text(await readPage(page))
      })
  )

  server.registerTool(
    'browser_read',
    {
      description: 'Lê a aba atual do navegador: título, endereço, elementos clicáveis numerados e o texto visível.',
      inputSchema: {}
    },
    () =>
      run(async () => {
        const page = await browserController.page()
        await approve(caller, hostOf(page.url()), `Ler a página ${page.url()}`)
        return text(await readPage(page))
      })
  )

  server.registerTool(
    'browser_click',
    {
      description: 'Clica num elemento da página pelo número [n] de browser_read.',
      inputSchema: {
        ref: z.number().int().describe('Número do elemento em browser_read'),
        description: z.string().describe('O que está sendo clicado, para o usuário (ex.: botão Entrar)')
      }
    },
    ({ ref, description }) =>
      run(async () => {
        const page = await browserController.page()
        await approve(caller, hostOf(page.url()), `Clicar em ${description}`)
        await (await element(page, ref)).click({ timeout: 10_000 })
        await settle(page)
        return text(await readPage(page))
      })
  )

  server.registerTool(
    'browser_type',
    {
      description:
        'Digita num campo da página pelo número [n] de browser_read (substitui o conteúdo). Nunca digite senhas: peça ao usuário para fazer login na janela.',
      inputSchema: {
        ref: z.number().int().describe('Número do campo em browser_read'),
        text: z.string().describe('Texto a digitar'),
        description: z.string().describe('Qual campo é, para o usuário (ex.: campo de busca)'),
        submit: z.boolean().optional().describe('Apertar Enter depois de digitar')
      }
    },
    ({ ref, text: value, description, submit }) =>
      run(async () => {
        const page = await browserController.page()
        await approve(caller, hostOf(page.url()), `Digitar em ${description}`)
        const el = await element(page, ref)
        if ((await el.getAttribute('type'))?.toLowerCase() === 'password') {
          throw new Error('Campo de senha: peça ao usuário para digitar a senha na janela do navegador.')
        }
        await el.fill(value, { timeout: 10_000 })
        if (submit) await el.press('Enter')
        await settle(page)
        return text(await readPage(page))
      })
  )

  server.registerTool(
    'browser_press',
    {
      description: 'Aperta uma tecla na aba atual (ex.: Enter, Escape, PageDown, Tab).',
      inputSchema: { key: z.string().describe('Nome da tecla no padrão do Playwright, ex.: Enter, PageDown') }
    },
    ({ key }) =>
      run(async () => {
        const page = await browserController.page()
        await approve(caller, hostOf(page.url()), `Apertar ${key}`)
        await page.keyboard.press(key)
        await settle(page)
        return text(`Tecla ${key} enviada. Use browser_read para ver a página.`)
      })
  )

  server.registerTool(
    'browser_screenshot',
    { description: 'Tira um print da parte visível da aba atual.', inputSchema: {} },
    () =>
      run(async () => {
        const page = await browserController.page()
        await approve(caller, hostOf(page.url()), `Tirar print de ${page.url()}`)
        const img = await page.screenshot({ type: 'jpeg', quality: 70 })
        return { content: [{ type: 'image', data: img.toString('base64'), mimeType: 'image/jpeg' }] }
      })
  )

  server.registerTool(
    'browser_tabs',
    {
      description: 'Lista as abas do navegador do gBot; com `select` muda para uma aba, com `new` abre uma aba vazia.',
      inputSchema: {
        select: z.number().int().optional().describe('Número da aba (da lista) para usar'),
        new: z.boolean().optional().describe('Abrir uma aba nova')
      }
    },
    ({ select, new: openNew }) =>
      run(async () => {
        if (openNew) await browserController.newTab()
        const tabs = await browserController.tabs()
        if (select !== undefined) {
          const tab = tabs[select - 1]
          if (!tab) throw new Error(`Não existe a aba ${select}.`)
          browserController.select(tab)
          await tab.bringToFront()
        }
        const current = await browserController.page()
        const lines = await Promise.all(
          tabs.map(async (t, i) => `${i + 1}. ${t === current ? '(atual) ' : ''}${(await t.title().catch(() => '')) || '(sem título)'} — ${t.url()}`)
        )
        return text(lines.join('\n'))
      })
  )

  server.registerTool(
    'browser_back',
    { description: 'Volta para a página anterior na aba atual.', inputSchema: {} },
    () =>
      run(async () => {
        const page = await browserController.page()
        await approve(caller, hostOf(page.url()), 'Voltar a página')
        await page.goBack({ timeout: 15_000 })
        await settle(page)
        return text(await readPage(page))
      })
  )
}

export const BROWSER_TOOL_NAMES = [
  'browser_navigate',
  'browser_read',
  'browser_click',
  'browser_type',
  'browser_press',
  'browser_screenshot',
  'browser_tabs',
  'browser_back'
]
