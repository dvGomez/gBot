import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { chosenBrowser, executableFor } from './browsers'

/**
 * Navegador do gBot: o Edge/Chrome instalado, aberto com um perfil fixo do gBot e controlado via CDP.
 * O perfil é um só por navegador e é compartilhado por todas as conversas e bots, então logins e
 * cookies continuam salvos depois de fechar o navegador ou o app.
 */
export function profileDir(browserId: string): string {
  const dir = join(app.getPath('userData'), 'browser-profiles', browserId)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Na primeira vez, deixa o perfil com "continuar de onde parou": assim os cookies de sessão
 * (logins sem "manter conectado") também sobrevivem quando o navegador é fechado.
 */
function seedProfile(dir: string) {
  const prefs = join(dir, 'Default', 'Preferences')
  if (existsSync(prefs)) return
  mkdirSync(join(dir, 'Default'), { recursive: true })
  writeFileSync(prefs, JSON.stringify({ session: { restore_on_startup: 1 }, browser: { has_seen_welcome_page: true } }))
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

class BrowserController {
  private browser?: Browser
  private context?: BrowserContext
  private active?: Page
  private browserId?: string
  private connecting?: Promise<void>

  /** Garante o navegador aberto e conectado; devolve a aba em uso. */
  async page(): Promise<Page> {
    await this.connect()
    const pages = this.context!.pages()
    if (!this.active || this.active.isClosed()) this.active = pages.at(-1) ?? (await this.context!.newPage())
    return this.active
  }

  async tabs(): Promise<Page[]> {
    await this.connect()
    return this.context!.pages()
  }

  async newTab(): Promise<Page> {
    await this.connect()
    this.active = await this.context!.newPage()
    return this.active
  }

  select(page: Page) {
    this.active = page
  }

  /** Abre a janela (ou traz para frente), sem navegar. */
  async show() {
    const page = await this.page()
    await page.bringToFront()
  }

  private connect(): Promise<void> {
    const info = chosenBrowser()
    if (!info) return Promise.reject(new Error('Nenhum navegador compatível encontrado (Edge, Chrome ou Brave).'))
    if (this.browser?.isConnected() && this.browserId === info.id) return Promise.resolve()
    this.connecting ??= this.open(info.id).finally(() => (this.connecting = undefined))
    return this.connecting
  }

  private async open(browserId: string) {
    const dir = profileDir(browserId)
    const portFile = join(dir, 'DevToolsActivePort')

    // O navegador do gBot pode já estar aberto (de antes): tenta conectar nele primeiro.
    let browser = await this.tryConnect(portFile)
    if (!browser) {
      rmSync(portFile, { force: true })
      seedProfile(dir)
      const exe = executableFor(browserId)!
      const proc = spawn(
        exe,
        [
          `--user-data-dir=${dir}`,
          '--remote-debugging-port=0',
          '--no-first-run',
          '--no-default-browser-check',
          // Sem isso o site vê navigator.webdriver = true e alguns logins recusam o navegador.
          '--disable-blink-features=AutomationControlled'
        ],
        { detached: true, stdio: 'ignore' }
      )
      proc.unref()
      for (let i = 0; i < 75 && !browser; i++) {
        await wait(200)
        browser = await this.tryConnect(portFile)
      }
      if (!browser) throw new Error('O navegador não abriu a tempo. Tente de novo.')
    }

    this.browser = browser
    this.browserId = browserId
    this.context = browser.contexts()[0]
    this.active = this.context.pages().at(-1)
    this.context.on('page', (p) => (this.active = p))
    browser.on('disconnected', () => {
      if (this.browser === browser) {
        this.browser = undefined
        this.context = undefined
        this.active = undefined
      }
    })
  }

  private async tryConnect(portFile: string): Promise<Browser | undefined> {
    try {
      const port = readFileSync(portFile, 'utf8').split('\n')[0].trim()
      if (!port) return undefined
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 3000 })
    } catch {
      return undefined
    }
  }
}

export const browserController = new BrowserController()
