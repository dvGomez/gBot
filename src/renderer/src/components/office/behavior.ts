/**
 * O que cada bot faz no escritório, decidido só a partir do que o app já sabe (sem modelo, sem tokens): atividade da
 * equipe, fila de tarefas dos bots (consultas entre eles), execuções das rotinas e a agenda.
 */
import type { BotTask, FlowRun } from '@shared/types'
import type { BotActivity } from '@/lib/useTeamActivity'

/**
 * - `work`: na mesa, trabalhando · `host`: na mesa, respondendo a um colega que veio perguntar ·
 * - `visit`: em pé na mesa do colega, perguntando · `wait`: na sala de reunião, esperando você ·
 * - `done`: comemora na mesa logo que termina · `coffee`: depois vai à copa · `error`: na mesa, com a rotina com erro ·
 * - `soon`: a rotina dele começa em minutos, já está na mesa · `sleep`: descansando.
 */
export type PlanKind = 'work' | 'host' | 'visit' | 'wait' | 'done' | 'coffee' | 'error' | 'soon' | 'sleep'

export interface Plan {
  kind: PlanKind
  /** `host`: quem veio perguntar (se for um bot) · `visit`: com quem está falando. */
  partner?: string
  /** `host`: nome de quem perguntou, mesmo quando não é um bot (o assistente da conversa). */
  partnerName?: string
  /** Execução de rotina ligada ao que está fazendo (ao vivo, ou a que acabou de terminar). */
  run?: FlowRun
  /** `soon`: quando a rotina começa e o nome dela. */
  at?: number
  routine?: string
  /** O que abrir ao clicar no bot. */
  target: BotActivity['target']
}

export interface PlanInput {
  bots: { id: string; name: string }[]
  activity: Map<string, BotActivity>
  tasks: BotTask[]
  runs: Record<string, FlowRun[]>
  flows: { id: string; botId?: string }[]
  upcoming: { botId: string; at?: number; label: string }[]
  now: number
}

/** Quanto tempo o bot comemora na mesa, fica na copa e mostra a rotina com erro depois que ela termina. */
export const CELEBRATE_MS = 3_000
export const COFFEE_MS = 45_000
export const ERROR_MS = 60_000
/** Com quanta antecedência o bot vai para a mesa antes de uma rotina agendada. */
export const SOON_MS = 5 * 60_000
/** Execução "rodando" mais velha que isso sobrou de um app fechado no meio (igual a `isLive`). */
const LIVE_MS = 60 * 60_000

/** Rótulo das consultas na fila do bot consultado (ver `bots.ts` no processo principal). */
const CONSULT = /^Consulta de (.+)$/

export function computePlans(input: PlanInput): Map<string, Plan> {
  const { bots, activity, tasks, runs, flows, upcoming, now } = input
  const plans = new Map<string, Plan>()
  const byName = (name: string) => bots.find((b) => b.name.toLowerCase() === name.trim().toLowerCase())
  const flowsOf = (botId: string) => flows.filter((f) => f.botId === botId).map((f) => f.id)
  const runsOf = (botId: string) => flowsOf(botId).flatMap((id) => runs[id] ?? [])

  // Consultas acontecendo agora: quem foi consultado e quem perguntou
  const hosts = new Map<string, { asker?: string; askerName: string; conversationId?: string }>()
  for (const t of tasks) {
    if (t.origin !== 'consult' || t.status !== 'running' || hosts.has(t.botId)) continue
    const name = CONSULT.exec(t.label)?.[1] ?? ''
    hosts.set(t.botId, { asker: byName(name)?.id, askerName: name, conversationId: t.originId })
  }

  for (const bot of bots) {
    const a = activity.get(bot.id)
    const target = a?.target ?? { kind: 'bot' as const, id: bot.id }
    if (a?.state === 'waiting') {
      plans.set(bot.id, { kind: 'wait', target })
      continue
    }
    const host = hosts.get(bot.id)
    if (host) {
      plans.set(bot.id, {
        kind: 'host',
        partner: host.asker,
        partnerName: host.askerName,
        target: host.conversationId ? { kind: 'conversation', id: host.conversationId } : target
      })
      continue
    }
    // Rotina rodando conta como trabalho mesmo entre uma caixinha e outra (senão ele levantaria da mesa)
    const live = runsOf(bot.id)
      .filter((r) => r.status === 'running' && now - r.startedAt < LIVE_MS)
      .sort((x, y) => y.startedAt - x.startedAt)[0]
    if (a?.state === 'working' || live) {
      plans.set(bot.id, { kind: 'work', run: live, target: a?.state === 'working' ? target : { kind: 'flow', id: live!.flowId } })
      continue
    }
    const finished = runsOf(bot.id)
      .filter((r) => r.finishedAt && r.status !== 'running')
      .sort((x, y) => (y.finishedAt ?? 0) - (x.finishedAt ?? 0))[0]
    const age = finished?.finishedAt ? now - finished.finishedAt : Infinity
    if (finished && finished.status === 'done' && age < COFFEE_MS) {
      plans.set(bot.id, { kind: age < CELEBRATE_MS ? 'done' : 'coffee', run: finished, target: { kind: 'flow', id: finished.flowId } })
      continue
    }
    if (finished && finished.status === 'error' && age < ERROR_MS) {
      plans.set(bot.id, { kind: 'error', run: finished, target: { kind: 'flow', id: finished.flowId } })
      continue
    }
    const next = upcoming
      .filter((u) => u.botId === bot.id && u.at !== undefined && u.at > now && u.at - now <= SOON_MS)
      .sort((x, y) => (x.at ?? 0) - (y.at ?? 0))[0]
    if (next) {
      plans.set(bot.id, { kind: 'soon', at: next.at, routine: next.label, target })
      continue
    }
    plans.set(bot.id, { kind: 'sleep', target })
  }

  // Quem perguntou vai até a mesa do colega (a não ser que esteja esperando você ou respondendo outra consulta)
  for (const [hostId, h] of hosts) {
    if (!h.asker || h.asker === hostId) continue
    const p = plans.get(h.asker)
    if (!p || p.kind === 'wait' || p.kind === 'host' || p.kind === 'visit') continue
    plans.set(h.asker, { kind: 'visit', partner: hostId, target: p.target })
  }
  return plans
}
