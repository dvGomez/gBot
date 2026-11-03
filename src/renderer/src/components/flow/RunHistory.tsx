import { t as tr, locale, useLanguage } from '@/i18n'
import { useState } from 'react'
import { Check, ChevronDown, CircleSlash, Hand, LoaderCircle, Search, Square, X } from 'lucide-react'
import type { FlowRun, FlowStepStatus, TokenUsage } from '@shared/types'
import { addUsage, totalTokens } from '@shared/usage'
import { Markdown } from '@/components/Markdown'
import { cn } from '@/lib/cn'
import { formatTokens, usageDetail } from '@/lib/format'
import { useApp } from '@/state/app'

function StepIcon({ status }: { status: FlowStepStatus | FlowRun['status'] }) {
  useLanguage()
  if (status === 'running') return <LoaderCircle size={14} className="shrink-0 animate-spin text-warning" />
  if (status === 'done') return <Check size={14} strokeWidth={2.5} className="shrink-0 text-success" />
  if (status === 'error') return <X size={14} strokeWidth={2.5} className="shrink-0 text-danger" />
  if (status === 'skipped') return <CircleSlash size={14} className="shrink-0 text-muted" />
  if (status === 'waiting') return <Hand size={14} className="shrink-0 animate-pulse text-warning" />
  if (status === 'stopped') return <Square size={14} className="shrink-0 text-muted" />
  return <span className="size-3.5 shrink-0 rounded-full border border-line" />
}

function when(ts: number) {
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts)
}

function Tokens({ usage, className }: { usage?: TokenUsage; className?: string }) {
  useLanguage()
  if (!usage || !totalTokens(usage)) return null
  return (
    <span className={cn('shrink-0 text-[11.5px] font-normal text-muted', className)} title={usageDetail(usage)}>
      {formatTokens(totalTokens(usage))} tokens
    </span>
  )
}

function duration(run: FlowRun) {
  const ms = (run.finishedAt ?? Date.now()) - run.startedAt
  return ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`
}

/** Execuções da rotina, mais recentes primeiro; cada uma abre com o resultado de cada caixinha. */
export function RunHistory({ runs }: { runs: FlowRun[] }) {
  useLanguage()
  const app = useApp()
  const [open, setOpen] = useState<string | undefined>(runs[0]?.id)
  if (!runs.length) return <p className="text-[13px] text-muted">{tr('Nenhuma execução ainda. Use "Rodar agora" para testar.')}</p>

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <div key={run.id} className="rounded-tile border border-line">
          <button onClick={() => setOpen(open === run.id ? undefined : run.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
            <StepIcon status={run.status} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">{when(run.startedAt)}</span>
              <span className="block text-[12px] text-muted">
                {run.trigger === 'manual' ? 'Manual' : tr('Agendada')} · {duration(run)}{run.status === 'stopped' ? tr(' · Parado por você') : ''}
              </span>
            </span>
            <Tokens usage={run.steps.reduce<TokenUsage | undefined>((sum, s) => (s.usage ? addUsage(sum, s.usage) : sum), undefined)} />
            <ChevronDown size={14} className={cn('text-muted transition-transform', open === run.id && 'rotate-180')} />
          </button>
          {open === run.id && (
            <div className="space-y-3 border-t border-line px-3 py-3">
              <button
                onClick={() => app.openMemory({ botId: app.flows.find((f) => f.id === run.flowId)?.botId })}
                className="flex items-center gap-1.5 text-[12px] text-muted hover:text-fg"
                title={tr('Lições aprendidas e instruções do bot da rotina e das especializações dele')}
              >
                <Search size={12} />{tr(' Alguma resposta citou uma regra? Ver de onde ela vem')}</button>
              {run.steps.map((s, i) => (
                <div key={`${s.nodeId}-${i}`}>
                  <p className="flex items-center gap-2 text-[13px] font-medium">
                    <StepIcon status={s.status} /> <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <Tokens usage={s.usage} />
                  </p>
                  {s.status === 'waiting' && (
                    <button
                      onClick={() => {
                        const pending = app.confirmations.find((c) => c.runId === run.id && c.nodeId === s.nodeId)
                        if (pending) app.openConfirmation(pending.id)
                      }}
                      className="mt-1 ml-5 text-[12px] font-medium text-warning hover:underline"
                    >{tr('Esperando sua confirmação · responder')}</button>
                  )}
                  {s.chosen && <p className="mt-1 pl-5 text-[12px] text-warning">{tr('Escolheu: ')}{s.chosen}</p>}
                  {s.note && <p className="mt-0.5 pl-5 text-[12px] text-fg-2">{tr('Comentário: ')}{s.note}</p>}
                  {s.error && (
                    <p className={`mt-1 pl-5 text-[12px] ${s.status === 'skipped' ? 'text-muted' : 'text-danger'}`}>{tr(s.error)}</p>
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
