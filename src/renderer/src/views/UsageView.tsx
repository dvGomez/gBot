import { t as tr, locale, localized, useLanguage } from '@/i18n'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Lightbulb, MessageSquareText, Workflow } from 'lucide-react'
import type { TokenUsage, UsageRecord } from '@shared/types'
import { addUsage, emptyUsage, totalTokens } from '@shared/usage'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Card, Chip } from '@/components/ui'
import { HBars, StackedColumns, type Column, type Series } from '@/components/usage/charts'
import { cn } from '@/lib/cn'
import { formatTokens, usageDetail } from '@/lib/format'
import { useApp } from '@/state/app'

const DAY = 24 * 60 * 60_000

type Period = 'today' | '7d' | '30d' | '90d'
const PERIODS: { id: Period; label: string; days: number }[] = localized([{
  id: 'today',
  label: tr('Hoje'),
  days: 1
}, {
  id: '7d',
  label: tr('7 dias'),
  days: 7
}, {
  id: '30d',
  label: tr('30 dias'),
  days: 30
}, {
  id: '90d',
  label: tr('90 dias'),
  days: 90
}])

/** Peso no limite (preço equivalente na API) ou tokens processados. */
type Measure = 'cost' | 'tokens'

/** Cores categóricas (paleta validada para o fundo escuro, ordem fixa). */
const KINDS: Series[] = localized([{
  key: 'conversation',
  label: tr('Conversas'),
  color: '#3987e5'
}, {
  key: 'mention',
  label: tr('@menções'),
  color: '#d95926'
}, {
  key: 'consult',
  label: tr('Consultas entre bots'),
  color: '#199e70'
}, {
  key: 'flow',
  label: tr('Fluxos'),
  color: '#c98500'
}, {
  key: 'reflection',
  label: tr('Reflexão automática'),
  color: '#d55181'
}, {
  key: 'suggest',
  label: tr('Sugestões de nome'),
  color: '#008300'
}, {
  key: 'plan',
  label: tr('Planos da página inicial'),
  color: '#8a63d2'
}])
const BAR_COLOR = '#3987e5'

const usd = (v: number) =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: v < 1 ? 3 : 2 }).format(v)

const only = ({ input, output, cacheRead, cacheWrite, cost }: TokenUsage): TokenUsage => ({ input, output, cacheRead, cacheWrite, cost })

export function modelFamily(model?: string): string {
  if (!model) return tr('Não registrado')
  const m = model.toLowerCase()
  for (const f of ['opus', 'sonnet', 'haiku', 'fable']) if (m.includes(f)) return f.charAt(0).toUpperCase() + f.slice(1)
  return model
}

/** Uma resposta pode gerar um registro por modelo (ex.: subagente em outro modelo); juntos contam como uma. */
const turnKey = (r: UsageRecord) => `${r.at}|${r.kind}|${r.conversationId ?? ''}|${r.botId ?? ''}|${r.flowId ?? ''}`

type Owner = { kind: 'flow' | 'bot' | 'conversation' | 'other'; id: string }
/** Quem gastou: o fluxo (inclusive bots consultados nele), senão o bot, senão a conversa. */
const ownerOf = (r: UsageRecord): Owner =>
  r.flowId
    ? { kind: 'flow', id: r.flowId }
    : r.botId
      ? { kind: 'bot', id: r.botId }
      : r.conversationId
        ? { kind: 'conversation', id: r.conversationId }
        : { kind: 'other', id: r.kind }

interface Group {
  owner: Owner
  usage: TokenUsage
  turns: number
  /** Peso por família de modelo. */
  byModel: Map<string, number>
}

function Stat({ label, value, sub, title }: { label: string; value: string; sub: string; title?: string }) {
  useLanguage()
  return (
    <Card className="flex-1 p-4">
      <div title={title}>
        <p className="text-[12px] text-muted">{label}</p>
        <p className="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.02em]">{value}</p>
        <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
      </div>
    </Card>
  )
}

function Panel({ title, sub, aside, children, className }: { title: string; sub?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  useLanguage()
  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold">{title}</p>
          {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
        </div>
        {aside}
      </div>
      {children}
    </Card>
  )
}

/** Página de consumo: quanto o gBot gastou, quando, em quê e onde dá para economizar. */
export function UsageView() {
  useLanguage()
  const app = useApp()
  const [period, setPeriod] = useState<Period>('7d')
  const [measure, setMeasure] = useState<Measure>('cost')
  const [records, setRecords] = useState<UsageRecord[]>()
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Owner['kind'] | 'all'>('all')

  const days = PERIODS.find((p) => p.id === period)!.days
  const start = period === 'today' ? new Date().setHours(0, 0, 0, 0) : new Date().setHours(0, 0, 0, 0) - (days - 1) * DAY

  useEffect(() => {
    let alive = true
    const load = () => {
      setLoading(true)
      void window.gbot.usage.records(start).then((r) => {
        if (!alive) return
        setRecords(r)
        setLoading(false)
      })
    }
    load()
    const off = window.gbot.usage.onChanged(load)
    return () => {
      alive = false
      off()
    }
  }, [start])

  const value = (u: TokenUsage) => (measure === 'cost' ? u.cost : totalTokens(u))
  const fmt = (v: number) => (measure === 'cost' ? usd(v) : formatTokens(v))

  const data = useMemo(() => {
    const list = records ?? []
    let total = emptyUsage()
    const turns = new Set<string>()
    const byKind = new Map<string, TokenUsage>()
    const byModel = new Map<string, TokenUsage>()
    const groups = new Map<string, Group>()
    const groupTurns = new Map<string, Set<string>>()
    for (const r of list) {
      const u = only(r)
      total = addUsage(total, u)
      turns.add(turnKey(r))
      byKind.set(r.kind, addUsage(byKind.get(r.kind), u))
      const fam = modelFamily(r.model)
      byModel.set(fam, addUsage(byModel.get(fam), u))
      const owner = ownerOf(r)
      const k = `${owner.kind}:${owner.id}`
      const g = groups.get(k) ?? { owner, usage: emptyUsage(), turns: 0, byModel: new Map() }
      g.usage = addUsage(g.usage, u)
      g.byModel.set(fam, (g.byModel.get(fam) ?? 0) + u.cost)
      groups.set(k, g)
      const set = groupTurns.get(k) ?? new Set()
      set.add(turnKey(r))
      groupTurns.set(k, set)
    }
    for (const [k, g] of groups) g.turns = groupTurns.get(k)!.size

    // Colunas: por hora (hoje) ou por dia.
    const buckets: { start: number; label: string; title: string }[] = []
    if (period === 'today') {
      for (let h = 0; h < 24; h++) {
        const s = start + h * 60 * 60_000
        buckets.push({ start: s, label: `${h}h`, title: tr('Hoje, {0}:00–{1}:59', String(h).padStart(2, '0'), String(h).padStart(2, '0')) })
      }
    } else {
      for (let d = 0; d < days; d++) {
        const s = new Date(start + d * DAY + 12 * 60 * 60_000).setHours(0, 0, 0, 0)
        const date = new Date(s)
        buckets.push({
          start: s,
          label: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`,
          title: new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
        })
      }
    }
    const perBucket = buckets.map(() => new Map<string, TokenUsage>())
    for (const r of list) {
      let i = buckets.length - 1
      while (i > 0 && buckets[i].start > r.at) i--
      perBucket[i].set(r.kind, addUsage(perBucket[i].get(r.kind), only(r)))
    }
    return { total, turns: turns.size, byKind, byModel, groups: [...groups.values()], buckets, perBucket }
  }, [records, period, start, days, locale()])

  const columns: Column[] = data.buckets.map((b, i) => ({
    label: b.label,
    title: b.title,
    values: Object.fromEntries([...data.perBucket[i]].map(([k, u]) => [k, value(u)]))
  }))

  const nameOf = (o: Owner) => {
    if (o.kind === 'bot') return app.getBot(o.id)?.name ?? tr('Bot excluído')
    if (o.kind === 'flow') return app.flows.find((f) => f.id === o.id)?.name ?? tr('Fluxo excluído')
    if (o.kind === 'conversation') return app.conversations.find((c) => c.id === o.id)?.title ?? tr('Conversa excluída')
    return KINDS.find((k) => k.key === o.id)?.label ?? tr('Outros')
  }
  const openOf = (o: Owner): (() => void) | undefined => {
    if (o.kind === 'bot' && app.getBot(o.id)) return () => app.openBot(o.id)
    if (o.kind === 'flow' && app.flows.some((f) => f.id === o.id)) return () => app.openFlow(o.id)
    if (o.kind === 'conversation' && app.conversations.some((c) => c.id === o.id)) return () => app.openConversation(o.id)
    return undefined
  }
  const iconOf = (o: Owner) =>
    o.kind === 'bot' ? (
      <AgentAvatar avatar={app.getBot(o.id)?.avatar} size={20} animated={false} />
    ) : o.kind === 'flow' ? (
      <Workflow size={16} className="text-muted" />
    ) : (
      <MessageSquareText size={16} className="text-muted" />
    )

  // ── Dicas: o que mais dá para cortar neste período ──
  const tips = useMemo(() => {
    const out: { key: string; text: ReactNode; open?: () => void; action?: string }[] = []
    const cost = data.total.cost || 1e-12
    const opus = data.byModel.get('Opus')?.cost ?? 0
    if (opus / cost > 0.4) {
      const heavy = data.groups
        .filter((g) => (g.byModel.get('Opus') ?? 0) / cost > 0.05)
        .sort((a, b) => (b.byModel.get('Opus') ?? 0) - (a.byModel.get('Opus') ?? 0))
        .slice(0, 3)
      out.push({
        key: 'opus',
        text: (
          <>
            <b>{Math.round((opus / cost) * 100)}{tr('% do peso veio do Opus')}</b>{tr(', o modelo que mais gasta.')}{heavy.length > 0 && <>{tr(' Quem mais usou: ')}{heavy.map((g) => nameOf(g.owner)).join(', ')}.</>}{tr(' Para tarefas do dia a dia, escolha o Sonnet no editor do bot ou na conversa: a qualidade costuma ser parecida por bem menos.')}</>
        ),
        open: heavy[0] && openOf(heavy[0].owner),
        action: heavy[0] && tr('Abrir {0}', nameOf(heavy[0].owner))
      })
    }
    // Conversas que relêem muito contexto a cada mensagem.
    for (const g of data.groups) {
      if (g.owner.kind !== 'conversation' && g.owner.kind !== 'bot') continue
      const perTurn = (g.usage.input + g.usage.cacheRead + g.usage.cacheWrite) / Math.max(1, g.turns)
      if (perTurn < 60_000 || g.turns < 3) continue
      out.push({
        key: `long-${g.owner.id}`,
        text: (
          <>
            <b>{nameOf(g.owner)}</b>{tr(' relê em média ')}{formatTokens(perTurn)}{tr(' tokens a cada resposta: o histórico ficou longo. Para assunto novo, comece outra conversa, que sai bem mais leve.')}</>
        ),
        open: openOf(g.owner),
        action: tr('Abrir')
      })
      if (out.length > 4) break
    }
    for (const g of data.groups) {
      if (g.owner.kind !== 'flow' || g.usage.cost / cost < 0.25) continue
      const flow = app.flows.find((f) => f.id === g.owner.id)
      const sched = flow?.nodes.find((n) => n.type === 'trigger')?.data.schedule
      const perDay = sched?.mode === 'interval' ? Math.round((24 * 60) / sched.everyMinutes) : undefined
      out.push({
        key: `flow-${g.owner.id}`,
        text: (
          <>{tr('O fluxo ')}<b>{nameOf(g.owner)}</b>{tr(' responde por ')}{Math.round((g.usage.cost / cost) * 100)}{tr('% do peso')}{perDay ? <>{tr(' e roda cerca de ')}{perDay}{tr(' vezes por dia')}</> : null}{tr('. Veja se dá para rodar menos vezes, juntar caixinhas ou usar um modelo mais leve nelas.')}</>
        ),
        open: openOf(g.owner),
        action: tr('Abrir fluxo')
      })
    }
    const consult = data.byKind.get('consult')?.cost ?? 0
    if (consult / cost > 0.3) {
      out.push({
        key: 'consult',
        text: (
          <>
            <b>{tr('Consultas entre bots')}</b>{tr(' foram ')}{Math.round((consult / cost) * 100)}{tr('% do peso. Cada bot consultado tem a própria sessão; quando já souber quem deve responder, chame o bot direto com @.')}</>
        )
      })
    }
    const reflection = data.byKind.get('reflection')?.cost ?? 0
    if (reflection / cost > 0.08) {
      out.push({
        key: 'reflection',
        text: (
          <>{tr('A ')}<b>{tr('reflexão automática')}</b>{tr(' (registrar lições depois de falhas) foi ')}{Math.round((reflection / cost) * 100)}{tr('% do peso: houve muitas falhas de ferramenta. Vale ver os avisos nas conversas e fluxos.')}</>
        )
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, app.flows, app.bots, app.conversations, locale()])

  const cacheShare = data.total.cacheRead / Math.max(1, data.total.input + data.total.cacheRead + data.total.cacheWrite)
  const rows = data.groups
    .filter((g) => tab === 'all' || g.owner.kind === tab)
    .sort((a, b) => value(b.usage) - value(a.usage))
  const rowsMax = Math.max(...rows.map((g) => value(g.usage)), 1e-12)
  const totalValue = value(data.total) || 1e-12
  const empty = records && !records.length

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <button onClick={() => app.setView('home')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft size={14} />{tr(' Início')}</button>
      <p className="text-[12px] font-medium tracking-[0.02em] text-muted">{tr('Sistema')}</p>
      <h1 className="mt-1 text-[36px] leading-tight font-medium tracking-[-0.03em]">{tr('Consumo')}</h1>
      <p className="mt-1 text-[15px] text-muted">{tr('Quanto o gBot gastou do seu limite, em quê, e onde dá para economizar.')}</p>

      {/* Filtros: valem para tudo abaixo. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Chip key={p.id} active={period === p.id} onClick={() => setPeriod(p.id)}>
            {p.label}
          </Chip>
        ))}
        <span className="mx-2 h-5 w-px bg-line" />
        <Chip active={measure === 'cost'} onClick={() => setMeasure('cost')} title={tr('Preço equivalente na API: a melhor medida do peso no limite')}>{tr('Peso no limite')}</Chip>
        <Chip active={measure === 'tokens'} onClick={() => setMeasure('tokens')}>
          Tokens
        </Chip>
      </div>

      {empty ? (
        <Card className="mt-6 p-8 text-center text-[14px] text-muted">{tr('Nenhum consumo registrado neste período. Os números aparecem aqui conforme você usa conversas, bots e fluxos.')}</Card>
      ) : (
        <div className={cn('mt-6 space-y-4 transition-opacity', loading && records && 'opacity-60')}>
          <div className="flex gap-3">
            <Stat
              label={tr('Peso estimado')}
              value={usd(data.total.cost)}
              sub={tr('se fosse pela API (na assinatura não é cobrado)')}
              title={tr('Ler do cache custa ~10% de um token novo; gerar texto custa bem mais. Por isso o peso é a melhor comparação.')}
            />
            <Stat label={tr('Tokens processados')} value={formatTokens(totalTokens(data.total))} sub={tr('entrada, cache e saída')} title={usageDetail(data.total)} />
            <Stat label={tr('Respostas')} value={String(data.turns)} sub={tr('≈ {0} tokens cada', formatTokens(totalTokens(data.total) / Math.max(1, data.turns)))} />
            <Stat
              label={tr('Lido do cache')}
              value={`${Math.round(cacheShare * 100)}%`}
              sub={tr('da entrada (quanto maior, mais barato)')}
            />
          </div>

          <Panel title={tr('Ao longo do tempo')} sub={tr('{0} por {1}, separado por tipo de uso', measure === 'cost' ? tr('Peso') : 'Tokens', period === 'today' ? tr('hora') : tr('dia'))}>
            <StackedColumns series={KINDS} columns={columns} format={fmt} />
          </Panel>

          <div className="grid grid-cols-2 gap-4">
            <Panel title={tr('Por modelo')} sub={tr('Opus gasta bem mais que Sonnet, que gasta bem mais que Haiku')}>
              <HBars
                color={BAR_COLOR}
                format={fmt}
                rows={[...data.byModel]
                  .map(([k, u]) => ({ key: k, label: k, value: value(u), detail: usageDetail(u) }))
                  .filter((r) => r.value > 0)
                  .sort((a, b) => b.value - a.value)}
              />
            </Panel>
            <Panel title={tr('Por tipo de uso')} sub={tr('Onde os tokens foram gastos')}>
              <HBars
                color={BAR_COLOR}
                format={fmt}
                rows={KINDS.map((k) => {
                  const u = data.byKind.get(k.key) ?? emptyUsage()
                  return { key: k.key, label: k.label, value: value(u), detail: usageDetail(u) }
                })
                  .filter((r) => r.value > 0)
                  .sort((a, b) => b.value - a.value)}
              />
            </Panel>
          </div>

          <Panel title={tr('Para onde vão os tokens')} sub={tr('Cada mensagem reenvia instruções, ferramentas e o histórico; o cache barateia a releitura')}>
            <div className="grid grid-cols-4 gap-3">
              {(
                [
                  [tr('Lido do cache'), data.total.cacheRead, tr('Histórico e instruções relidos. Pesa ~10% de um token novo.')],
                  [tr('Escrito no cache'), data.total.cacheWrite, tr('Conteúdo novo guardado para reler depois (sessão nova, pausa longa).')],
                  [tr('Entrada nova'), data.total.input, tr('O que entrou sem passar pelo cache.')],
                  [tr('Gerados'), data.total.output, tr('Texto e raciocínio do modelo. É o tipo mais caro por token.')]
                ] as const
              ).map(([label, n, hint]) => {
                const all = Math.max(1, totalTokens(data.total))
                return (
                  <div key={label} className="rounded-tile bg-sidebar p-3" title={hint}>
                    <p className="text-[12px] text-muted">{label}</p>
                    <p className="mt-1 text-[18px] font-semibold">{formatTokens(n)}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-tile">
                      <div className="h-full rounded-full" style={{ width: `${(n / all) * 100}%`, background: BAR_COLOR }} />
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{hint}</p>
                  </div>
                )
              })}
            </div>
          </Panel>

          <Panel title={tr('Onde economizar')} sub={tr('Sugestões a partir do consumo deste período')}>
            {tips.length ? (
              <div className="space-y-2">
                {tips.map((t) => (
                  <div key={t.key} className="flex items-start gap-3 rounded-tile bg-sidebar px-4 py-3">
                    <Lightbulb size={16} className="mt-0.5 shrink-0 text-warning" />
                    <p className="flex-1 text-[13px] leading-relaxed text-fg-2 [&_b]:font-semibold [&_b]:text-fg">{t.text}</p>
                    {t.open && (
                      <button onClick={t.open} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] text-fg-2 hover:bg-hover">
                        {t.action ?? tr('Abrir')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">{tr('Nada fora do comum neste período.')}</p>
            )}
          </Panel>

          <Panel
            title={tr('Detalhes')}
            sub={tr('Quem gastou: o fluxo (com os bots consultados nele), senão o bot, senão a conversa')}
            aside={
              <div className="flex gap-1.5">
                {(
                  [
                    ['all', tr('Tudo')],
                    ['bot', 'Bots'],
                    ['flow', tr('Fluxos')],
                    ['conversation', tr('Conversas')]
                  ] as const
                ).map(([id, label]) => (
                  <Chip key={id} active={tab === id} onClick={() => setTab(id)} className="h-7 px-3 text-[12px]">
                    {label}
                  </Chip>
                ))}
              </div>
            }
          >
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-muted">
                  <th className="pb-2 font-medium">{tr('Nome')}</th>
                  <th className="pb-2 text-right font-medium">{tr('Respostas')}</th>
                  <th className="pb-2 text-right font-medium">Tokens</th>
                  <th className="pb-2 text-right font-medium">{tr('Peso')}</th>
                  <th className="pb-2 text-right font-medium">{tr('Média por resposta')}</th>
                  <th className="w-[160px] pb-2 pl-4 font-medium">{tr('Parte do total')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const open = openOf(g.owner)
                  const share = value(g.usage) / totalValue
                  const models = [...g.byModel].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([m]) => m)
                  return (
                    <tr
                      key={`${g.owner.kind}:${g.owner.id}`}
                      onClick={open}
                      className={cn('border-b border-line last:border-0', open && 'cursor-pointer hover:bg-hover')}
                      title={usageDetail(g.usage)}
                    >
                      <td className="py-2.5">
                        <span className="flex items-center gap-2.5">
                          <span className="flex w-5 shrink-0 justify-center">{iconOf(g.owner)}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{nameOf(g.owner)}</span>
                            <span className="block text-[11.5px] text-muted">{models.join(' · ')}</span>
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-fg-2">{g.turns}</td>
                      <td className="py-2.5 text-right text-fg-2">{formatTokens(totalTokens(g.usage))}</td>
                      <td className="py-2.5 text-right text-fg-2">{usd(g.usage.cost)}</td>
                      <td className="py-2.5 text-right text-fg-2">{formatTokens(totalTokens(g.usage) / Math.max(1, g.turns))}</td>
                      <td className="py-2.5 pl-4">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-tile">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${(value(g.usage) / rowsMax) * 100}%`, background: BAR_COLOR }}
                            />
                          </span>
                          <span className="w-9 text-right text-[12px] text-muted">{Math.round(share * 100)}%</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!rows.length && <p className="pt-3 text-[13px] text-muted">{tr('Nada nesta categoria.')}</p>}
          </Panel>
        </div>
      )}
    </div>
  )
}
