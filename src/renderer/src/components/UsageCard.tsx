import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useState } from 'react'
import { MessageSquareText, Workflow } from 'lucide-react'
import type { TokenUsage, UsageSummary } from '@shared/types'
import { totalTokens } from '@shared/usage'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Card } from '@/components/ui'
import { formatTokens, usageDetail } from '@/lib/format'
import { useApp } from '@/state/app'

function Stat({ label, usage }: { label: string; usage: TokenUsage }) {
  useLanguage()
  return (
    <div className="flex-1 rounded-tile bg-sidebar px-3 py-2.5" title={usageDetail(usage)}>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-0.5 text-[18px] font-semibold tracking-[-0.01em]">{formatTokens(totalTokens(usage))}</p>
      <p className="text-[11px] text-muted">tokens</p>
    </div>
  )
}

/** Quanto o gBot gastou hoje e na semana, e quem mais pesou (rotina, bot ou conversa). */
export function UsageCard() {
  useLanguage()
  const app = useApp()
  const [summary, setSummary] = useState<UsageSummary>()

  useEffect(() => {
    const load = () => void window.gbot.usage.summary().then(setSummary)
    load()
    return window.gbot.usage.onChanged(load)
  }, [])

  if (!summary || !totalTokens(summary.week)) return null
  const max = Math.max(...summary.top.map((t) => t.usage.cost), 1e-9)

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between pb-3">
        <p className="text-[13px] font-medium text-muted">{tr('Consumo')}</p>
        <button onClick={() => app.setView('usage')} className="text-[12px] text-fg-2 hover:text-fg hover:underline">{tr('Ver detalhes')}</button>
      </div>
      <div className="flex gap-2">
        <Stat label={tr('Hoje')} usage={summary.today} />
        <Stat label={tr('Últimos 7 dias')} usage={summary.week} />
      </div>
      {summary.top.length > 0 && (
        <>
          <p className="pt-4 pb-1 text-[12px] text-muted">{tr('O que mais gastou na semana')}</p>
          {summary.top.map((t) => {
            const bot = t.kind === 'bot' ? app.getBot(t.id) : undefined
            const flow = t.kind === 'flow' ? app.flows.find((f) => f.id === t.id) : undefined
            const conv = t.kind === 'conversation' ? app.conversations.find((c) => c.id === t.id) : undefined
            // Fluxo do bot (todas as rotinas dele) aparece com o nome do bot dono, que é quem as roda.
            const owner = flow && app.getBot(flow.botId)
            const routine = flow && (owner ? `${owner.name} · ${tr('rotinas')}` : tr('Rotinas'))
            const name =
              bot?.name ??
              routine ??
              conv?.title ??
              (t.kind === 'conversation' ? tr('Conversa excluída') : t.kind === 'flow' ? tr('Rotina excluída') : tr('Excluído'))
            const open = bot
              ? () => app.openBot(bot.id)
              : flow
                ? () => app.openFlow(flow.id)
                : conv
                  ? () => app.openConversation(conv.id)
                  : undefined
            return (
              <button
                key={`${t.kind}:${t.id}`}
                onClick={open}
                disabled={!open}
                title={usageDetail(t.usage)}
                className="flex w-full items-center gap-3 py-2 text-left hover:opacity-85 disabled:opacity-60"
              >
                <span className="flex w-6 shrink-0 justify-center">
                  {t.kind === 'flow' ? (
                    <Workflow size={16} className="text-muted" />
                  ) : t.kind === 'bot' ? (
                    <AgentAvatar avatar={bot?.avatar} size={20} animated={false} />
                  ) : (
                    <MessageSquareText size={16} className="text-muted" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{name}</span>
                    <span className="shrink-0 text-[12px] text-muted">{formatTokens(totalTokens(t.usage))}</span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-tile">
                    <span className="block h-full rounded-full bg-fg-2/60" style={{ width: `${(t.usage.cost / max) * 100}%` }} />
                  </span>
                </span>
              </button>
            )
          })}
        </>
      )}
    </Card>
  )
}
