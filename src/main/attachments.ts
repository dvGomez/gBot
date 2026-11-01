import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app, nativeImage } from 'electron'
import type { ChatFile } from '@shared/types'

/**
 * Anexos que o usuário manda no chat, copiados para `data/attachments/<conversa>/`. A sessão da conversa (e os bots
 * chamados nela) ganham leitura dessa pasta; a mensagem diz quais arquivos ler.
 */

/** Tamanho máximo de um anexo. */
const MAX_BYTES = 50 * 1024 ** 2

const safeId = (id: string) => id.replace(/[^\w-]/g, '')

export function attachmentsDir(conversationId: string): string {
  return join(app.getPath('userData'), 'data', 'attachments', safeId(conversationId))
}

function freeName(dir: string, name: string): string {
  const clean = basename(name).replace(/^\.+/, '') || 'anexo'
  const ext = extname(clean)
  const stem = clean.slice(0, clean.length - ext.length)
  let candidate = clean
  for (let i = 2; existsSync(join(dir, candidate)); i++) candidate = `${stem} (${i})${ext}`
  return candidate
}

/** Miniatura (data URL) de uma imagem, para o chat mostrar sem depender do arquivo; vazio se não for imagem. */
function thumbnail(path: string): string | undefined {
  if (!/\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i.test(path)) return undefined
  const img = nativeImage.createFromPath(path)
  if (img.isEmpty()) return undefined
  const { width, height } = img.getSize()
  const scale = Math.min(1, 240 / Math.max(width, height))
  return img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' }).toDataURL()
}

/** Copia arquivos (pelo caminho) ou grava dados colados (ex.: print da área de transferência). */
export function saveAttachments(conversationId: string, items: { name: string; path?: string; data?: Uint8Array }[]): ChatFile[] {
  const dir = attachmentsDir(conversationId)
  mkdirSync(dir, { recursive: true })
  const saved: ChatFile[] = []
  for (const item of items) {
    const size = item.path ? (existsSync(item.path) && statSync(item.path).isFile() ? statSync(item.path).size : -1) : (item.data?.byteLength ?? -1)
    if (size < 0) continue
    if (size > MAX_BYTES) throw new Error(`"${item.name}" passa de 50 MB.`)
    const target = join(dir, freeName(dir, item.name))
    if (item.path) copyFileSync(item.path, target)
    else writeFileSync(target, item.data!)
    const thumb = thumbnail(target)
    saved.push({ path: target, name: basename(target), size, ...(thumb ? { thumb } : {}) })
  }
  return saved
}

export function removeAttachments(conversationId: string) {
  rmSync(attachmentsDir(conversationId), { recursive: true, force: true })
}

/** Pasta e regra de leitura dos anexos da conversa (vazio se ela não tem anexos). */
export function attachmentsAccess(conversationId: string): { addDirs: string[]; allowedTools: string[] } {
  const dir = attachmentsDir(conversationId)
  if (!existsSync(dir)) return { addDirs: [], allowedTools: [] }
  return { addDirs: [dir], allowedTools: [`Read(//${dir.replace(/\\/g, '/').replace(/^\/+/, '')}/**)`] }
}

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

/** Texto da mensagem com a lista de anexos, para o Claude ler o que precisar. */
export function withAttachments(text: string, attachments?: ChatFile[]): string {
  if (!attachments?.length) return text
  return [
    text,
    '',
    '<anexos_do_usuario>',
    'O usuário anexou estes arquivos nesta mensagem. Leia com a ferramenta Read (ela também mostra imagens):',
    ...attachments.map((f) => `- ${f.path} (${size(f.size)})`),
    '</anexos_do_usuario>'
  ].join('\n')
}
