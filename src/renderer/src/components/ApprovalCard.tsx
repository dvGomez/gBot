import { Globe, SquareTerminal } from 'lucide-react'
import type { ApprovalRequest } from '@shared/types'
import { useApp } from '@/state/app'

/** Frase do pedido, também usada no aviso do topo e na tela inicial. */
export function approvalTitle(req: ApprovalRequest): string {
  const who = req.requester || 'O assistente'
  if (req.kind !== 'tool') return req.requester ? `${req.requester} quer usar o navegador em ${req.host}` : `Usar o navegador em ${req.host}?`
  return req.host.startsWith('Bash') ? `${who} quer rodar um comando` : `${who} quer fazer uma ação fora da pasta de trabalho`
}

/** Cartão pedindo para o usuário liberar uma ação: o navegador num site ou um comando do Claude Code. */
export function ApprovalCard({ req }: { req: ApprovalRequest }) {
  const app = useApp()
  const tool = req.kind === 'tool'
  const inChat = !!req.conversationId && app.conversations.some((c) => c.id === req.conversationId)
  return (
    <div className="mb-3 rounded-card border border-warning/50 bg-sidebar p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-tile text-warning">
          {tool ? <SquareTerminal size={17} /> : <Globe size={17} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium">{approvalTitle(req)}</p>
          {tool ? (
            <pre className="selectable mt-2 max-h-40 overflow-auto rounded-nav bg-page px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg-2">
              {req.action}
            </pre>
          ) : (
            <p className="selectable mt-0.5 truncate text-[13px] text-muted">{req.action}</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          onClick={() => app.respondApproval(req.id, 'deny')}
          className="h-8 rounded-full px-3.5 text-[13px] font-medium text-fg-2 hover:bg-hover"
        >
          Negar
        </button>
        <button
          onClick={() => app.respondApproval(req.id, 'always')}
          className="h-8 rounded-full border border-line px-3.5 text-[13px] font-medium text-fg-2 hover:bg-hover"
        >
          {tool ? (req.alwaysLabel ?? 'Sempre permitir') : `Sempre em ${req.host}`}
        </button>
        <button
          onClick={() => app.respondApproval(req.id, 'conversation')}
          className="h-8 rounded-full bg-primary px-3.5 text-[13px] font-medium text-on-primary hover:opacity-90"
        >
          {inChat ? 'Permitir nesta conversa' : 'Permitir'}
        </button>
      </div>
    </div>
  )
}
