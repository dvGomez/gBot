import { randomUUID } from 'node:crypto'
import { BrowserWindow, nativeImage, Notification } from 'electron'
import type { ChatFile, FlowDecisionOption, PendingConfirmation } from '@shared/types'

/**
 * Confirmações manuais dos fluxos: a caixinha de confirmação pausa a execução até o usuário escolher uma opção.
 * Cada pedido vira uma notificação do sistema (com um botão por opção) e fica nas pendências do app até ser
 * respondido. Ficam só na memória: a execução que espera também só existe enquanto o app está aberto.
 */

const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i
/** Miniaturas mostradas no app (as outras imagens aparecem como arquivo). */
const MAX_THUMBS = 6

const pending = new Map<
  string,
  { item: PendingConfirmation; resolve(choice: { option: FlowDecisionOption; note?: string }): void; notification?: Notification }
>()

let openWindow: () => void = () => undefined

/** O processo principal informa como mostrar a janela (ela pode estar fechada, com o app na bandeja). */
export function setConfirmationWindowOpener(fn: () => void) {
  openWindow = fn
}

function broadcast(channel: string, payload?: unknown) {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

/** Imagens ganham miniatura (para ver sem abrir o arquivo). */
function withThumbs(files: ChatFile[]): ChatFile[] {
  let thumbs = 0
  return files.map((f) => {
    if (f.thumb || !IMAGE.test(f.name) || thumbs >= MAX_THUMBS) return f
    const img = nativeImage.createFromPath(f.path)
    if (img.isEmpty()) return f
    thumbs++
    return { ...f, thumb: img.resize({ width: Math.min(480, img.getSize().width) }).toDataURL() }
  })
}

const clip = (text: string, max: number) => {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** Mostra a pendência no app: abre a janela e pede para a interface exibir a confirmação. */
function show(id: string) {
  openWindow()
  // A janela pode estar abrindo agora: o pedido sai de novo quando ela terminar de carregar.
  broadcast('confirmations:open', id)
  setTimeout(() => broadcast('confirmations:open', id), 1500)
}

function notify(item: PendingConfirmation) {
  if (!Notification.isSupported()) return undefined
  const image = item.files.find((f) => IMAGE.test(f.name))
  const others = item.files.length - (image ? 1 : 0)
  const body = [
    clip(item.message || 'Escolha como o fluxo deve seguir.', 180),
    item.files.length ? `📎 ${item.files.length === 1 ? '1 arquivo' : `${item.files.length} arquivos`}${others && image ? ' (clique para ver)' : ''}` : ''
  ]
    .filter(Boolean)
    .join('\n')
  const n = new Notification({
    title: `${item.flowName} · ${item.title}`,
    body,
    // Uma imagem do resultado vai como ícone da notificação; clicar abre a confirmação com tudo.
    icon: image ? nativeImage.createFromPath(image.path).resize({ width: 256 }) : undefined,
    actions: item.options.map((o) => ({ type: 'button' as const, text: clip(o.label, 40) })),
    timeoutType: 'never',
    urgency: 'critical'
  })
  n.on('action', (e) => {
    const option = item.options[e.actionIndex]
    if (option) respondConfirmation(item.id, option.id)
  })
  n.on('click', () => show(item.id))
  n.on('failed', (_e, error) => console.error('[confirmações] a notificação falhou:', error))
  n.show()
  return n
}

/**
 * Pede a confirmação ao usuário e espera a escolha. `signal` cancela o pedido (ex.: a execução foi interrompida).
 */
export function requestConfirmation(
  req: Omit<PendingConfirmation, 'id' | 'createdAt' | 'files'> & { files: ChatFile[] },
  signal?: AbortSignal
): Promise<{ option: FlowDecisionOption; note?: string }> {
  const item: PendingConfirmation = { ...req, id: randomUUID(), files: withThumbs(req.files), createdAt: Date.now() }
  return new Promise((resolve, reject) => {
    pending.set(item.id, { item, resolve })
    pending.get(item.id)!.notification = notify(item)
    broadcast('confirmations:changed')
    signal?.addEventListener(
      'abort',
      () => {
        if (!pending.has(item.id)) return
        drop(item.id)
        reject(new Error('A confirmação foi cancelada.'))
      },
      { once: true }
    )
  })
}

function drop(id: string) {
  const p = pending.get(id)
  if (!p) return
  pending.delete(id)
  p.notification?.close()
  broadcast('confirmations:changed')
}

export function respondConfirmation(id: string, optionId: string, note?: string) {
  const p = pending.get(id)
  const option = p?.item.options.find((o) => o.id === optionId)
  if (!p || !option) return
  drop(id)
  p.resolve({ option, note: note?.trim() || undefined })
}

export const listConfirmations = (): PendingConfirmation[] =>
  [...pending.values()].map((p) => p.item).sort((a, b) => a.createdAt - b.createdAt)
