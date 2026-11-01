import { t as tr, locale, useLanguage } from '@/i18n'
import type { ReactNode } from 'react'
import {
  Bot as BotIcon,
  Check,
  ChevronRight,
  CircleAlert,
  CircleSlash,
  FolderPlus,
  Hand,
  Clock,
  LoaderCircle,
  MessageSquarePlus,
  Workflow,
  X
} from 'lucide-react'
import type { Flow, FlowRun } from '@shared/types'
import { AgentAvatar } from '@/components/AgentAvatar'
import { CreateHero } from '@/components/home/CreateHero'
import { approvalTitle } from '@/components/ApprovalCard'
import { ProviderNotice } from '@/components/ProviderNotice'
import { TeamPanel } from '@/components/TeamPanel'
import { UsageCard } from '@/components/UsageCard'
import { Button, Card } from '@/components/ui'
import { greeting, longDate, timeAgo } from '@/lib/format'
import { describeSchedule, formatWhen, nextRun } from '@/lib/schedule'
import { isLive, useFlowRuns } from '@/lib/useFlowRuns'
import { useTeamActivity } from '@/lib/useTeamActivity'
import { useApp } from '@/state/app'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  useLanguage()
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-4 pb-2">
        <p className="text-[13px] font-medium text-muted">{title}</p>
        {aside}
      </div>
      {children}
    </Card>
  )
}

/** Linha de lista no estilo do MagmaFit: ícone, título, detalhe e seta. */
function Row({
  icon,
  title,
  detail,
  right,
  onClick
}: {
  icon: ReactNode
  title: ReactNode
  detail?: ReactNode
  right?: ReactNode
  onClick?: () => void
}) {
  useLanguage()
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 border-b border-line py-3 text-left last:border-0 hover:opacity-85"
    >
      <span className="flex w-9 shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{title}</span>
        {detail && <span className="block truncate text-[12px] text-muted">{detail}</span>}
      </span>
      {right}
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </button>
  )
}

/** Selo de data (dia + mês), como na agenda do MagmaFit. */
function DateBadge({ date }: { date: Date }) {
  useLanguage()
  return (
    <span className="flex w-11 flex-col items-center rounded-nav border border-line py-1 leading-none">
      <span className="text-[15px] font-semibold">{String(date.getDate()).padStart(2, '0')}</span>
      <span className="mt-0.5 text-[10px] text-muted uppercase">
        {new Intl.DateTimeFormat(locale(), { month: 'short' }).format(date).replace('.', '')}
      </span>
    </span>
  )
}

const StatusIcon = ({ status }: { status: FlowRun['status'] }) =>
  status === 'running' ? (
    <LoaderCircle size={17} className="animate-spin text-warning" />
  ) : status === 'done' ? (
    <Check size={17} strokeWidth={2.5} className="text-success" />
  ) : status === 'stopped' ? (
    <CircleSlash size={17} className="text-muted" />
  ) : (
    <X size={17} strokeWidth={2.5} className="text-danger" />
  )

/** Próximo disparo de um fluxo ativo (horários fixos ou intervalo a partir da última execução). */
function nextFor(flow: Flow, runs: FlowRun[] | undefined): Date | undefined {
  const schedule = flow.nodes.find((n) => n.type === 'trigger')?.data.schedule
  if (!schedule) return undefined
  if (schedule.mode === 'times') return nextRun(schedule)
  const last = runs?.[0]?.startedAt
  return last ? new Date(Math.max(Date.now(), last + schedule.everyMinutes * 60_000)) : undefined
}

export function HomeView() {
  useLanguage()
  const app = useApp()
  const runs = useFlowRuns(app.flows)
  const team = useTeamActivity(runs)
  const flowName = (id: string) => app.flows.find((f) => f.id === id)?.name ?? tr('Fluxo')

  // ── Agora ──
  const liveRuns = Object.values(runs)
    .map((list) => list[0])
    .filter((r): r is FlowRun => !!r && isLive(r))
  const conv = app.activeConversation
  const answering = app.busy && conv
  const answeringBot = answering ? app.getBot(conv.messages.at(-1)?.botId ?? conv.botId) : undefined
  const nowCount = liveRuns.length + (answering ? 1 : 0) + app.approvals.length + app.confirmations.length

  // ── Próximas execuções ──
  const upcoming = app.flows
    .filter((f) => f.enabled)
    .map((f) => ({ flow: f, at: nextFor(f, runs[f.id]) }))
    .sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity))

  // ── Atividade recente: execuções terminadas + conversas, em ordem de tempo ──
  type Item = { at: number; key: string; node: ReactNode }
  const items: Item[] = [
    ...Object.values(runs)
      .flat()
      .filter((r) => !isLive(r))
      .map((r) => ({
        at: r.finishedAt ?? r.startedAt,
        key: `run-${r.id}`,
        node: (
          <Row
            key={`run-${r.id}`}
            icon={<StatusIcon status={r.status === 'running' ? 'error' : r.status} />}
            title={flowName(r.flowId)}
            detail={`${r.status === 'done' ? tr('Fluxo concluído') : r.status === 'stopped' ? tr('Fluxo parado') : tr('Fluxo com erro')} · ${r.trigger === 'manual' ? 'manual' : 'agendado'} · ${timeAgo(r.finishedAt ?? r.startedAt)}`}
            onClick={() => app.openFlow(r.flowId)}
          />
        )
      })),
    ...app.conversations.map((c) => {
      const bot = app.getBot(c.botId)
      return {
        at: c.updatedAt,
        key: `conv-${c.id}`,
        node: (
          <Row
            key={`conv-${c.id}`}
            icon={<AgentAvatar avatar={bot?.avatar} size={24} animated={false} />}
            title={c.title}
            detail={`${bot ? tr('Conversa com {0}', bot.name) : tr('Conversa')} · ${plural(c.messageCount, 'mensagem', 'mensagens')} · ${timeAgo(c.updatedAt)}`}
            onClick={() => app.openConversation(c.id)}
          />
        )
      }
    })
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 12)

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <CreateHero />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[12px] font-medium tracking-[0.02em] text-muted">{longDate()}</p>
          <h1 className="mt-1 text-[24px] leading-tight font-medium tracking-[-0.02em]">{greeting()}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {plural(app.bots.length, 'bot', 'bots')} · {plural(app.projects.length, 'projeto', 'projetos')} ·{' '}
            {plural(app.flows.length, 'fluxo', 'fluxos')}
            {upcoming.length > 0 && <span className="text-success"> · {plural(upcoming.length, 'ativo', 'ativos')}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => app.newConversation()}>
            <MessageSquarePlus size={15} />{tr('Nova conversa')}</Button>
          <Button onClick={() => app.editBot()}>
            <BotIcon size={15} />{tr('Novo bot')}</Button>
          <Button onClick={() => app.editProject()}>
            <FolderPlus size={15} />{tr('Novo projeto')}</Button>
          <Button onClick={() => void app.newFlow()}>
            <Workflow size={15} />{tr('Novo fluxo')}</Button>
        </div>
      </div>

      <div className="mt-6">
        <ProviderNotice />
      </div>

      <div className="mb-4">
        <TeamPanel activity={team} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Section
            title={tr('Agora')}
            aside={
              nowCount > 0 && (
                <span className="flex items-center gap-1.5 text-[12px] text-warning">
                  <span className="size-1.5 animate-pulse rounded-full bg-warning" />
                  {plural(nowCount, 'coisa acontecendo', 'coisas acontecendo')}
                </span>
              )
            }
          >
            {nowCount === 0 ? (
              <p className="py-3 text-[14px] text-muted">{tr('Tudo tranquilo: nada rodando agora.')}</p>
            ) : (
              <>
                {app.confirmations.map((c) => (
                  <Row
                    key={c.id}
                    icon={<Hand size={18} className="text-warning" />}
                    title={c.title}
                    detail={tr('Fluxo {0}{1} · {2}', c.flowName, c.files.length ? ` · ${c.files.length === 1 ? tr('1 arquivo') : tr('{0} arquivos', c.files.length)}` : '', timeAgo(c.createdAt))}
                    right={<span className="text-[12px] text-warning">{tr('Sua confirmação')}</span>}
                    onClick={() => app.openConfirmation(c.id)}
                  />
                ))}
                {app.approvals.map((r) => (
                  <Row
                    key={r.id}
                    icon={<CircleAlert size={18} className="text-warning" />}
                    title={approvalTitle(r)}
                    detail={r.action}
                    right={<span className="text-[12px] text-warning">{tr('Aguardando você')}</span>}
                    onClick={() => r.conversationId && app.openConversation(r.conversationId)}
                  />
                ))}
                {liveRuns.map((r) => {
                  const done = r.steps.filter((s) => s.status === 'done').length
                  const current = r.steps.filter((s) => s.status === 'running').map((s) => s.label)
                  return (
                    <Row
                      key={r.id}
                      icon={<LoaderCircle size={18} className="animate-spin text-warning" />}
                      title={flowName(r.flowId)}
                      detail={tr('{0} · {1}/{2} caixinhas · {3}', current.length ? tr('Rodando: {0}', current.join(', ')) : tr('Começando'), done, r.steps.length, timeAgo(r.startedAt))}
                      onClick={() => app.openFlow(r.flowId)}
                    />
                  )
                })}
                {answering && (
                  <Row
                    icon={<AgentAvatar avatar={answeringBot?.avatar} size={24} mood={app.mood} />}
                    title={conv.title}
                    detail={`${answeringBot ? tr('{0} respondendo', answeringBot.name) : tr('Respondendo')} · ${
                      app.mood === 'talking' ? 'escrevendo' : 'pensando'
                    }`}
                    onClick={() => app.openConversation(conv.id)}
                  />
                )}
              </>
            )}
          </Section>

          <Section title={tr('Atividade recente')}>
            {items.length ? (
              items.map((i) => i.node)
            ) : (
              <p className="py-3 text-[14px] text-muted">{tr('Nada por aqui ainda. Comece uma conversa ou crie um fluxo.')}</p>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <UsageCard />
          <Section title={tr('Próximas execuções')}>
            {upcoming.length ? (
              upcoming.map(({ flow, at }) => (
                <Row
                  key={flow.id}
                  icon={at ? <DateBadge date={at} /> : <Workflow size={18} className="text-muted" />}
                  title={flow.name}
                  detail={`${at ? formatWhen(at) : tr('Aguardando a primeira execução')} · ${describeSchedule(
                    flow.nodes.find((n) => n.type === 'trigger')?.data.schedule
                  )}`}
                  onClick={() => app.openFlow(flow.id)}
                />
              ))
            ) : (
              <p className="py-3 text-[13px] text-muted">{tr('Nenhum fluxo ativo. Ligue um fluxo para ele rodar sozinho no horário.')}</p>
            )}
          </Section>

          {app.flows.some((f) => !f.enabled) && (
            <Section title={tr('Fluxos desligados')}>
              {app.flows
                .filter((f) => !f.enabled)
                .map((f) => (
                  <Row
                    key={f.id}
                    icon={<Workflow size={18} className="text-muted" />}
                    title={f.name}
                    detail={describeSchedule(f.nodes.find((n) => n.type === 'trigger')?.data.schedule)}
                    onClick={() => app.openFlow(f.id)}
                  />
                ))}
            </Section>
          )}
          <p className="flex items-center gap-1.5 px-1 text-[12px] text-muted">
            <Clock size={12} />{tr(' Fluxos agendados rodam enquanto o gBot estiver aberto (inclusive na barra de menu).')}</p>
        </div>
      </div>
    </div>
  )
}
