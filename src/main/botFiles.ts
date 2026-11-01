import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import type { BotFile } from '@shared/types'

/**
 * Arquivos de referência de cada bot (`data/bot-files/<bot>/`). O bot recebe só a lista (nome, tamanho e nota)
 * no prompt e lê o conteúdo com a ferramenta Read quando o pedido precisar: assim não gasta tokens à toa.
 */

const META = '.gbot-files.json'
type Meta = Record<string, { note?: string; addedAt: number }>

const safeId = (id: string) => id.replace(/[^\w-]/g, '')

export function botFilesDir(botId: string): string {
  return join(app.getPath('userData'), 'data', 'bot-files', safeId(botId))
}

function readMeta(dir: string): Meta {
  try {
    return JSON.parse(readFileSync(join(dir, META), 'utf8')) as Meta
  } catch {
    return {}
  }
}

const writeMeta = (dir: string, meta: Meta) => writeFileSync(join(dir, META), JSON.stringify(meta, null, 2))

export function listBotFiles(botId: string): BotFile[] {
  const dir = botFilesDir(botId)
  if (!existsSync(dir)) return []
  const meta = readMeta(dir)
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .map((name) => ({ name, st: statSync(join(dir, name)) }))
    .filter(({ st }) => st.isFile())
    .map(({ name, st }) => ({ name, size: st.size, addedAt: meta[name]?.addedAt ?? st.mtimeMs, note: meta[name]?.note }))
    .sort((a, b) => b.addedAt - a.addedAt)
}

/** Nome livre na pasta: "contrato.pdf", "contrato (2).pdf"… */
function freeName(dir: string, name: string): string {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  let candidate = name
  for (let i = 2; existsSync(join(dir, candidate)); i++) candidate = `${stem} (${i})${ext}`
  return candidate
}

export function addBotFiles(botId: string, paths: string[]): BotFile[] {
  const dir = botFilesDir(botId)
  mkdirSync(dir, { recursive: true })
  const meta = readMeta(dir)
  for (const path of paths) {
    if (!existsSync(path) || !statSync(path).isFile()) continue
    const name = freeName(dir, basename(path).replace(/^\.+/, ''))
    copyFileSync(path, join(dir, name))
    meta[name] = { addedAt: Date.now() }
  }
  writeMeta(dir, meta)
  return listBotFiles(botId)
}

export function removeBotFile(botId: string, name: string) {
  const dir = botFilesDir(botId)
  const file = join(dir, basename(name))
  if (existsSync(file)) rmSync(file)
  const meta = readMeta(dir)
  delete meta[basename(name)]
  if (existsSync(dir)) writeMeta(dir, meta)
}

export function setBotFileNote(botId: string, name: string, note: string) {
  const dir = botFilesDir(botId)
  const meta = readMeta(dir)
  const key = basename(name)
  meta[key] = { addedAt: meta[key]?.addedAt ?? Date.now(), note: note.trim() || undefined }
  writeMeta(dir, meta)
}

export function removeAllBotFiles(botId: string) {
  rmSync(botFilesDir(botId), { recursive: true, force: true })
}

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

/** Pasta e regra de leitura que a sessão do bot recebe (vazio se ele não tem arquivos). */
export function botFilesAccess(botId: string): { addDirs: string[]; allowedTools: string[] } {
  if (!listBotFiles(botId).length) return { addDirs: [], allowedTools: [] }
  const dir = botFilesDir(botId)
  // Regra de permissão do Claude Code: caminho absoluto começa com "//".
  const rule = `Read(//${dir.replace(/\\/g, '/').replace(/^\/+/, '')}/**)`
  return { addDirs: [dir], allowedTools: [rule] }
}

/** Linhas do prompt com a lista de arquivos (no máximo 50), para o bot ler quando precisar. */
export function botFilesPrompt(botId: string): string[] {
  const files = listBotFiles(botId)
  if (!files.length) return []
  const dir = botFilesDir(botId)
  return [
    `O usuário deixou arquivos de referência para você em ${dir}.`,
    'Leia com a ferramenta Read só os que forem úteis para o pedido (não leia todos de uma vez). Lista (nome | tamanho | nota):',
    ...files.slice(0, 50).map((f) => `- ${f.name} | ${size(f.size)}${f.note ? ` | ${f.note}` : ''}`)
  ]
}
