import { t as tr, useLanguage } from '@/i18n'
import { Globe, SquareTerminal } from 'lucide-react'
import type { ApprovalRequest } from '@shared/types'
import { useApp } from '@/state/app'

/** Frase do pedido, também usada no aviso do topo e na tela inicial. */
export function approvalTitle(req: ApprovalRequest): string {
  const who = req.requester || tr('O assistente')
  if (req.kind !== 'tool') return req.requester ? tr('{0} quer usar o navegador em {1}', req.requester, req.host) : tr('Usar o navegador em {0}?', req.host)
  return req.host.startsWith('Bash') ? tr('{0} quer rodar um comando', who) : tr('{0} quer fazer uma ação fora da pasta de trabalho', who)
}

/** Cartão pedindo para o usuário liberar uma ação: o navegador num site ou um comando do Claude Code. */
export function ApprovalCard({ req }: { req: ApprovalRequest }) {
  useLanguage()
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
        >{tr('Negar')}</button>
        <button
          onClick={() => app.respondApproval(req.id, 'always')}
          className="h-8 rounded-full border border-line px-3.5 text-[13px] font-medium text-fg-2 hover:bg-hover"
        >
          {tool ? (req.alwaysLabel ? tr(req.alwaysLabel) : tr('Sempre permitir')) : tr('Sempre em {0}', req.host)}
        </button>
        <button
          onClick={() => app.respondApproval(req.id, 'conversation')}
          className="h-8 rounded-full bg-primary px-3.5 text-[13px] font-medium text-on-primary hover:opacity-90"
        >
          {inChat ? tr('Permitir nesta conversa') : tr('Permitir')}
        </button>
      </div>
    </div>
  )
}
