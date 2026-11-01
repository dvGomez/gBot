import { useState } from 'react'
import { Check, ChevronDown, CircleSlash, LoaderCircle, X } from 'lucide-react'
import type { FlowRun, FlowStepStatus } from '@shared/types'
import { Markdown } from '@/components/Markdown'
import { cn } from '@/lib/cn'

function StepIcon({ status }: { status: FlowStepStatus | FlowRun['status'] }) {
  if (status === 'running') return <LoaderCircle size={14} className="shrink-0 animate-spin text-warning" />
  if (status === 'done') return <Check size={14} strokeWidth={2.5} className="shrink-0 text-success" />
  if (status === 'error') return <X size={14} strokeWidth={2.5} className="shrink-0 text-danger" />
  if (status === 'skipped') return <CircleSlash size={14} className="shrink-0 text-muted" />
  return <span className="size-3.5 shrink-0 rounded-full border border-line" />
}

function when(ts: number) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts)
}

function duration(run: FlowRun) {
  const ms = (run.finishedAt ?? Date.now()) - run.startedAt
  return ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`
}

/** Execuções do fluxo, mais recentes primeiro; cada uma abre com o resultado de cada caixinha. */
export function RunHistory({ runs }: { runs: FlowRun[] }) {
  const [open, setOpen] = useState<string | undefined>(runs[0]?.id)
  if (!runs.length) return <p className="text-[13px] text-muted">Nenhuma execução ainda. Use "Rodar agora" para testar.</p>

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <div key={run.id} className="rounded-tile border border-line">
          <button onClick={() => setOpen(open === run.id ? undefined : run.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
            <StepIcon status={run.status} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">{when(run.startedAt)}</span>
              <span className="block text-[12px] text-muted">
                {run.trigger === 'manual' ? 'Manual' : 'Agendada'} · {duration(run)}
              </span>
            </span>
            <ChevronDown size={14} className={cn('text-muted transition-transform', open === run.id && 'rotate-180')} />
          </button>
          {open === run.id && (
            <div className="space-y-3 border-t border-line px-3 py-3">
              {run.steps.map((s, i) => (
                <div key={`${s.nodeId}-${i}`}>
                  <p className="flex items-center gap-2 text-[13px] font-medium">
                    <StepIcon status={s.status} /> {s.label}
                  </p>
                  {s.chosen && <p className="mt-1 pl-5 text-[12px] text-warning">Escolheu: {s.chosen}</p>}
                  {s.error && (
                    <p className={`mt-1 pl-5 text-[12px] ${s.status === 'skipped' ? 'text-muted' : 'text-danger'}`}>{s.error}</p>
                  )}
                  {s.notices?.map((n, j) => (
                    <p key={j} className="mt-1 pl-5 text-[12px] text-warning">
                      {n}
                    </p>
                  ))}
                  {s.output && (
                    <div className="selectable mt-1.5 ml-5 max-h-[320px] overflow-y-auto rounded-nav bg-sidebar px-3 py-2 text-[13px]">
                      <Markdown text={s.output} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
