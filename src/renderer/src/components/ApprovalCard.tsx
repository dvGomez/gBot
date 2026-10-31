import { Globe } from 'lucide-react'
import type { ApprovalRequest } from '@shared/types'
import { useApp } from '@/state/app'

/** Cartão pedindo para o usuário liberar uma ação do navegador num site. */
export function ApprovalCard({ req }: { req: ApprovalRequest }) {
  const app = useApp()
  return (
    <div className="mb-3 rounded-card border border-warning/50 bg-sidebar p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-tile text-warning">
          <Globe size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium">
            {req.requester ? `${req.requester} quer usar o navegador em ` : 'Usar o navegador em '}
            <span className="font-semibold">{req.host}</span>
            {req.requester ? '' : '?'}
          </p>
          <p className="selectable mt-0.5 truncate text-[13px] text-muted">{req.action}</p>
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
          Sempre em {req.host}
        </button>
        <button
          onClick={() => app.respondApproval(req.id, 'conversation')}
          className="h-8 rounded-full bg-primary px-3.5 text-[13px] font-medium text-on-primary hover:opacity-90"
        >
          Permitir nesta conversa
        </button>
      </div>
    </div>
  )
}
