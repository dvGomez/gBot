import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { FilesFilter, TouchedFile } from '@shared/types'

/**
 * Arquivos mexidos pelas conversas, bots e rotinas (criados, alterados, lidos ou anexados), em data/files.jsonl, um
 * registro por linha. Alimenta o painel de arquivos de cada conversa, rotina e bot. Guarda os últimos 90 dias.
 */
const KEEP_DAYS = 90
const DAY = 24 * 60 * 60_000
/** Arquivo com "nascimento" mais recente que isso, ao ser gravado, conta como criado (senão, alterado). */
const CREATED_WINDOW_MS = 15 * 60_000

type Action = 'write' | 'read' | 'attached'

interface FileRecord {
  path: string
  action: 'created' | 'modified' | 'read' | 'attached'
  at: number
  conversationId?: string
  flowId?: string
  botId?: string
}

export interface FileContext {
  conversationId?: string
  flowId?: string
  botId?: string
}

function file() {
  const dir = join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'files.jsonl')
}

/** Pastas internas do gBot (perfis das contas, dados do app): o que acontece lá não interessa ao usuário. */
function internal(path: string): boolean {
  const root = app.getPath('userData')
  return ['claude-profile', 'claude-accounts', 'codex-accounts', 'data', 'browser-profiles'].some((d) =>
    path.toLowerCase().startsWith(join(root, d).toLowerCase() + sep)
  )
}

function readAll(): FileRecord[] {
  let raw = ''
  try {
    raw = readFileSync(file(), 'utf8')
  } catch {
    return []
  }
  const out: FileRecord[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as FileRecord)
    } catch {
      // linha cortada: ignora
    }
  }
  return out
}

/** Tira do arquivo o que passou do prazo (roda uma vez ao abrir o app). */
export function pruneFileIndex() {
  const all = readAll()
  const keep = all.filter((r) => r.at > Date.now() - KEEP_DAYS * DAY)
  if (keep.length !== all.length) writeFileSync(file(), keep.map((r) => JSON.stringify(r)).join('\n') + (keep.length ? '\n' : ''))
}

/** Evita encher o índice com a mesma leitura repetida em sequência. */
const recent = new Map<string, number>()

/** Registra arquivos mexidos num contexto (conversa, rotina, bot) e avisa as janelas. */
export function recordFiles(entries: { path: string; action: Action }[], ctx: FileContext) {
  const now = Date.now()
  const records: FileRecord[] = []
  for (const e of entries) {
    if (!e.path) continue
    const path = resolve(e.path)
    if (internal(path)) continue
    const key = `${path}|${e.action}|${ctx.conversationId ?? ''}|${ctx.flowId ?? ''}|${ctx.botId ?? ''}`
    if (now - (recent.get(key) ?? 0) < 5000) continue
    recent.set(key, now)
    let action: FileRecord['action'] = e.action === 'write' ? 'modified' : e.action
    if (e.action === 'write') {
      try {
        const st = statSync(path)
        if (!st.isFile()) continue
        if (st.birthtimeMs >= now - CREATED_WINDOW_MS) action = 'created'
      } catch {
        continue
      }
    }
    records.push({ path, action, at: now, ...ctx })
  }
  if (!records.length) return
  appendFileSync(file(), records.map((r) => JSON.stringify(r)).join('\n') + '\n')
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('files:touched', ctx)
}

/** Peso de cada ação: o painel mostra a mais forte que já aconteceu com o arquivo. */
const RANK: Record<FileRecord['action'], number> = { created: 3, modified: 2, attached: 1, read: 0 }

/** Arquivos mexidos no contexto pedido, um por caminho, do mais recente ao mais antigo. */
export function listTouchedFiles(filter: FilesFilter): TouchedFile[] {
  const match = (r: FileRecord) =>
    (!filter.conversationId || r.conversationId === filter.conversationId) &&
    (!filter.flowId || r.flowId === filter.flowId) &&
    (!filter.botId || r.botId === filter.botId)
  if (!filter.conversationId && !filter.flowId && !filter.botId) return []
  const byPath = new Map<string, TouchedFile>()
  for (const r of readAll()) {
    if (!match(r)) continue
    const prev = byPath.get(r.path)
    if (!prev) {
      byPath.set(r.path, { path: r.path, name: basename(r.path), action: r.action, at: r.at, conversationId: r.conversationId, flowId: r.flowId })
      continue
    }
    prev.at = Math.max(prev.at, r.at)
    if (RANK[r.action] > RANK[prev.action]) prev.action = r.action
    prev.conversationId ??= r.conversationId
    prev.flowId ??= r.flowId
  }
  return [...byPath.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, 300)
    .map((f) => {
      try {
        const st = statSync(f.path)
        return { ...f, size: st.size, exists: st.isFile() }
      } catch {
        return { ...f, exists: false }
      }
    })
}
