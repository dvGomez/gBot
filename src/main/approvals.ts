import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import type { ApprovalDecision, ApprovalRequest } from '@shared/types'
import { getSettings, updateSettings } from './settings'

/** Tempo para o usuário responder antes de o pedido ser negado. */
const TIMEOUT_MS = 5 * 60_000

const pending = new Map<
  string,
  { kind: 'site' | 'tool'; host: string; conversationId?: string; resolve(d: ApprovalDecision): void; timer: NodeJS.Timeout }
>()

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

export const isSiteAllowed = (host: string) => getSettings().allowedSites.includes(host)
const isToolAllowed = (rule: string) => (getSettings().allowedTools ?? []).includes(rule)

/** Sites e ações liberados só para uma conversa ("Permitir nesta conversa"), enquanto o app está aberto. */
const allowedInConversation = new Set<string>()
const convKey = (conversationId: string | undefined, host: string) => `${conversationId ?? ''}|${host}`

/**
 * Pede ao usuário para aprovar uma ação: o navegador num site (só se a aprovação de sites estiver ligada) ou um
 * comando/ação do Claude Code (só se "liberar sem perguntar" estiver desligado). O que já foi liberado com "Sempre"
 * passa direto; o resto mostra um cartão no chat e aguarda a resposta (ou nega depois de 5 minutos).
 */
export function requestApproval(req: Omit<ApprovalRequest, 'id'>): Promise<ApprovalDecision> {
  const kind = req.kind ?? 'site'
  const settings = getSettings()
  if (kind === 'site' && (!settings.browserApprovals || isSiteAllowed(req.host))) return Promise.resolve('always')
  if (kind === 'tool' && (settings.autoApproveTools || isToolAllowed(req.host))) return Promise.resolve('always')
  if (allowedInConversation.has(convKey(req.conversationId, req.host))) return Promise.resolve('conversation')
  const id = randomUUID()
  return new Promise((resolve) => {
    const timer = setTimeout(() => respondApproval(id, 'deny'), TIMEOUT_MS)
    pending.set(id, { kind, host: req.host, conversationId: req.conversationId, resolve, timer })
    broadcast('approval:request', { ...req, id } satisfies ApprovalRequest)
  })
}

export function respondApproval(id: string, decision: ApprovalDecision) {
  const p = pending.get(id)
  if (!p) return
  pending.delete(id)
  clearTimeout(p.timer)
  if (decision === 'always' && p.kind === 'site' && !isSiteAllowed(p.host)) {
    updateSettings({ allowedSites: [...getSettings().allowedSites, p.host] })
  }
  if (decision === 'always' && p.kind === 'tool' && !isToolAllowed(p.host)) {
    updateSettings({ allowedTools: [...(getSettings().allowedTools ?? []), p.host] })
  }
  if (decision === 'conversation') allowedInConversation.add(convKey(p.conversationId, p.host))
  broadcast('approval:resolved', id)
  p.resolve(decision)
}
