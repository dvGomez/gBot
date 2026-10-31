import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BrowserInfo } from '@shared/types'
import { getSettings } from '../settings'

/** Navegadores Chromium que o gBot sabe abrir, em ordem de preferência (Edge primeiro: melhor com M365 corporativo). */
const KNOWN: { id: string; name: string; mac: string; win: string }[] = [
  {
    id: 'edge',
    name: 'Microsoft Edge',
    mac: 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    win: 'Microsoft\\Edge\\Application\\msedge.exe'
  },
  {
    id: 'chrome',
    name: 'Google Chrome',
    mac: 'Google Chrome.app/Contents/MacOS/Google Chrome',
    win: 'Google\\Chrome\\Application\\chrome.exe'
  },
  {
    id: 'brave',
    name: 'Brave',
    mac: 'Brave Browser.app/Contents/MacOS/Brave Browser',
    win: 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'
  }
]

function candidates(entry: (typeof KNOWN)[number]): string[] {
  if (process.platform === 'darwin') return ['/Applications', join(homedir(), 'Applications')].map((d) => join(d, entry.mac))
  if (process.platform === 'win32') {
    const roots = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']]
    return roots.filter(Boolean).map((r) => join(r!, entry.win))
  }
  return []
}

export function executableFor(id: string): string | undefined {
  const entry = KNOWN.find((b) => b.id === id)
  return entry && candidates(entry).find((p) => existsSync(p))
}

export function listBrowsers(): BrowserInfo[] {
  return KNOWN.map((b) => ({ id: b.id, name: b.name, installed: !!executableFor(b.id) }))
}

/** Navegador escolhido nas configurações, ou o primeiro instalado. */
export function chosenBrowser(): BrowserInfo | undefined {
  const all = listBrowsers().filter((b) => b.installed)
  const chosen = getSettings().browserId
  return all.find((b) => b.id === chosen) ?? all[0]
}
