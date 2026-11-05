import { t as tr, locale, useLanguage } from '@/i18n'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AvatarMood, FlowRun } from '@shared/types'
import { useBotTasks } from '@/components/BotTasks'
import { TeamPanel } from '@/components/TeamPanel'
import { Card } from '@/components/ui'
import { cn } from '@/lib/cn'
import { shortTime } from '@/lib/format'
import type { BotActivity } from '@/lib/useTeamActivity'
import { useApp } from '@/state/app'
import { computePlans, type Plan, type PlanKind } from './behavior'
import { buildLayout, type RoomSpec } from './layout'
import { OfficeScene, type Display } from './scene'

/** Rotina agendada que aparece no quadro e acorda o bot alguns minutos antes. */
export interface UpcomingRoutine {
  botId: string
  at?: number
  label: string
}

const VIEW_KEY = 'gbot.home.teamView'
const NO_PROJECT = '__no-project'

const MOODS: Record<PlanKind, AvatarMood> = {
  work: 'thinking',
  host: 'talking',
  visit: 'talking',
  wait: 'attention',
  done: 'happy',
  coffee: 'happy',
  error: 'attention',
  soon: 'idle',
  sleep: 'sleeping'
}

type Group = 'working' | 'talking' | 'waiting' | 'resting'
const GROUP: Record<PlanKind, Group> = {
  work: 'working',
  host: 'working',
  done: 'working',
  error: 'working',
  visit: 'talking',
  wait: 'waiting',
  coffee: 'resting',
  soon: 'resting',
  sleep: 'resting'
}
const GROUP_COLOR: Record<Group, string> = {
  working: 'var(--success)',
  talking: '#5b8def',
  waiting: 'var(--warning)',
  resting: 'var(--muted)'
}
const GROUP_LABEL: Record<Group, string> = {
  working: '{0} trabalhando',
  talking: '{0} conversando',
  waiting: '{0} esperando você',
  resting: '{0} descansando'
}

/** Relógio da página: reavalia quem acabou de terminar, quem vai à copa e quem acorda para a rotina. */
function useNow(ms: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** Hora curta; se não for hoje, com o dia da semana na frente. */
function when(at: number) {
  const d = new Date(at)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return shortTime(at)
  return `${new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(d).replace('.', '')} ${shortTime(at)}`
}

function ViewToggle({ value, onChange }: { value: 'office' | 'list'; onChange: (v: 'office' | 'list') => void }) {
  useLanguage()
  return (
    <div className="inline-flex rounded-full border border-line p-0.5 text-[12px]" role="group" aria-label={tr('Visão da equipe')}>
      {(['office', 'list'] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn('rounded-full px-3 py-1', value === v ? 'bg-tile text-fg' : 'text-muted hover:text-fg')}
        >
          {v === 'office' ? tr('Escritório') : tr('Lista')}
        </button>
      ))}
    </div>
  )
}

/** Equipe na página inicial: o escritório isométrico ou a lista de sempre (a escolha fica salva). */
export function TeamSection(props: { activity: Map<string, BotActivity>; runs: Record<string, FlowRun[]>; upcoming: UpcomingRoutine[] }) {
  useLanguage()
  const app = useApp()
  const [view, setView] = useState<'office' | 'list'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'office'
    } catch {
      return 'office'
    }
  })
  const change = (v: 'office' | 'list') => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // Sem armazenamento: a escolha vale só até fechar.
    }
  }
  const toggle = <ViewToggle value={view} onChange={change} />
  if (view === 'list' || !app.bots.length) return <TeamPanel activity={props.activity} aside={app.bots.length ? toggle : undefined} />
  return <TeamOffice {...props} aside={toggle} />
}

function TeamOffice({
  activity,
  runs,
  upcoming,
  aside
}: {
  activity: Map<string, BotActivity>
  runs: Record<string, FlowRun[]>
  upcoming: UpcomingRoutine[]
  aside: ReactNode
}) {
  useLanguage()
  const app = useApp()
  const tasks = useBotTasks()
  const now = useNow(2000)
  const svgRef = useRef<SVGSVGElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<OfficeScene | undefined>(undefined)

  const plans = computePlans({ bots: app.bots, activity, tasks, runs, flows: app.flows, upcoming, now })

  // Uma sala por projeto que tem bots, na ordem dos projetos; os bots sem projeto ficam numa sala geral no fim.
  const rooms: RoomSpec[] = useMemo(() => {
    const known = new Set(app.projects.map((p) => p.id))
    const list: RoomSpec[] = app.projects
      .map((p) => ({ id: p.id, name: p.name, color: p.color, botIds: app.bots.filter((b) => b.projectId === p.id).map((b) => b.id) }))
      .filter((r) => r.botIds.length)
    const loose = app.bots.filter((b) => !b.projectId || !known.has(b.projectId)).map((b) => b.id)
    if (loose.length) list.push({ id: NO_PROJECT, name: tr('Sem projeto'), color: '#8e9196', botIds: loose })
    return list
  }, [app.projects, app.bots, locale()])
  const roomsKey = JSON.stringify(rooms)
  const layout = useMemo(() => buildLayout(rooms), [roomsKey])

  const display = new Map<string, Display>()
  const counts: Record<Group, number> = { working: 0, talking: 0, waiting: 0, resting: 0 }
  for (const bot of app.bots) {
    const plan = plans.get(bot.id)
    if (!plan) continue
    counts[GROUP[plan.kind]]++
    const a = activity.get(bot.id)
    display.set(bot.id, {
      kind: plan.kind,
      partner: plan.partner,
      mood: MOODS[plan.kind],
      dot: plan.kind === 'error' ? 'var(--danger)' : GROUP_COLOR[GROUP[plan.kind]],
      bubble: bubbleFor(plan, a, bot.avatar.color, (id) => app.getBot(id)),
      hover: { title: bot.name, sub: [bot.description, a?.text].filter(Boolean).join(' · ') || undefined }
    })
  }

  const board = upcoming
    .filter((u) => u.at !== undefined)
    .slice(0, 3)
    .map((u) => clip(`${when(u.at!)} ${app.getBot(u.botId)?.name ?? ''} · ${u.label}`, 30))

  const roomLabels = Object.fromEntries(
    layout.rooms.map((r) => [r.id, `${r.name} · ${r.count} ${tr(r.count === 1 ? 'bot' : 'bots')}`.toLocaleUpperCase(locale())])
  )

  // O clique abre o que o bot está fazendo; esperando confirmação de rotina, abre direto a confirmação.
  const openRef = useRef<((botId: string) => void) | undefined>(undefined)
  openRef.current = (botId) => {
    const plan = plans.get(botId)
    if (!plan) return
    if (plan.kind === 'wait') {
      const flowIds = new Set(app.flows.filter((f) => f.botId === botId).map((f) => f.id))
      const confirmation = app.confirmations.find((c) => flowIds.has(c.flowId))
      if (confirmation) return app.openConfirmation(confirmation.id)
    }
    const target = plan.target
    if (target.kind === 'flow') app.openFlow(target.id)
    else if (target.kind === 'conversation') app.openConversation(target.id)
    else app.openBot(target.id)
  }

  useEffect(() => {
    if (!svgRef.current || !overlayRef.current) return
    const scene = new OfficeScene(svgRef.current, overlayRef.current, (id) => openRef.current?.(id))
    sceneRef.current = scene
    return () => {
      scene.destroy()
      sceneRef.current = undefined
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.update({
      layout,
      actors: app.bots.map((b, i) => ({ id: b.id, name: b.name, avatar: b.avatar, seed: i })),
      display,
      board: board.length ? board : [tr('Nada agendado')],
      labels: {
        rooms: roomLabels,
        lounge: tr('Descanso').toLocaleUpperCase(locale()),
        meeting: tr('Sala de reunião').toLocaleUpperCase(locale()),
        coffee: tr('Copa').toLocaleUpperCase(locale()),
        board: tr('Próximas rotinas').toLocaleUpperCase(locale())
      }
    })
  })

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <p className="text-[13px] font-medium text-muted">{tr('Equipe')}</p>
        <div className="flex flex-1 flex-wrap justify-center gap-1.5">
          {(Object.keys(counts) as Group[])
            .filter((g) => counts[g])
            .map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[12px] text-fg-2">
                <span className="size-1.5 rounded-full" style={{ background: GROUP_COLOR[g] }} />
                {tr(GROUP_LABEL[g], counts[g])}
              </span>
            ))}
        </div>
        {aside}
      </div>
      <div className="relative">
        <svg ref={svgRef} className="block h-auto max-h-[640px] w-full select-none" role="img" aria-label={tr('Escritório da equipe')} />
        <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      </div>
      <p className="border-t border-line px-5 py-2.5 text-[12px] text-muted">{tr('Clique num bot para ver o que ele está fazendo.')}</p>
    </Card>
  )
}

/** Texto do balão de cada situação (o que já está no app: nome da rotina, caixinhas, colega). */
function bubbleFor(
  plan: Plan,
  activity: BotActivity | undefined,
  color: string,
  getBot: (id?: string) => { name: string; avatar: { color: string } } | undefined
): Display['bubble'] {
  const routine = plan.run?.triggerLabel || tr('Rotina')
  switch (plan.kind) {
    case 'work': {
      const run = plan.run
      if (!run || !run.steps.length) return { tone: 'work', title: activity?.text ?? tr('Trabalhando'), typing: true }
      const done = run.steps.filter((s) => s.status === 'done').length
      const current = run.steps.find((s) => s.status === 'running')?.label
      return {
        tone: 'work',
        title: routine,
        sub: tr('{0}/{1} caixinhas', done, run.steps.length) + (current ? ` · ${current}` : ''),
        progress: done / run.steps.length,
        typing: true
      }
    }
    case 'host':
      return { tone: 'talk', title: tr('Respondendo {0}', plan.partnerName || tr('o assistente')), accent: getBot(plan.partner)?.avatar.color ?? color }
    case 'visit':
      return { tone: 'talk', title: tr('Perguntando a {0}', getBot(plan.partner)?.name ?? ''), accent: color }
    case 'wait':
      return { tone: 'wait', title: tr('Esperando você'), sub: activity?.text, action: tr('Revisar') }
    case 'done':
      return { tone: 'done', title: `✓ ${routine}`, sub: tr('Rotina concluída') }
    case 'coffee':
      return { tone: 'info', title: `☕ ${tr('Pausa para o café')}`, sub: tr('Terminou {0}', routine) }
    case 'error':
      return { tone: 'error', title: tr('Rotina com erro'), sub: routine }
    case 'soon':
      return { tone: 'info', title: `⏰ ${plan.at ? shortTime(plan.at) : ''}`, sub: plan.routine }
    default:
      return undefined
  }
}
