import { Check, LoaderCircle, X } from 'lucide-react'
import type { ToolActivity } from '@shared/types'

/** Linha discreta com cada ferramenta usada na resposta. */
export function ToolList({ tools }: { tools: ToolActivity[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {tools.map((t) => (
        <span
          key={t.id}
          title={t.name}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[12px] text-fg-2"
        >
          {t.status === 'running' && <LoaderCircle size={12} className="shrink-0 animate-spin text-muted" />}
          {t.status === 'done' && <Check size={12} strokeWidth={2.5} className="shrink-0 text-success" />}
          {t.status === 'error' && <X size={12} strokeWidth={2.5} className="shrink-0 text-danger" />}
          <span className="truncate">{t.summary}</span>
        </span>
      ))}
    </div>
  )
}
