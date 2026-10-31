import type { Flow, FlowSchedule } from '@shared/types'
import { runFlow } from './runner'
import { listFlows, listRuns } from './store'

/**
 * Confere os gatilhos a cada 20 s enquanto o gBot está aberto (inclusive só na barra de menu).
 * Horários perdidos com o app fechado não são executados depois.
 */
const TICK_MS = 20_000
const firedAt = new Map<string, string>()
/** Para gatilhos "a cada N minutos": quando começou a contar (sem execução anterior). */
const intervalBase = new Map<string, number>()

const pad = (n: number) => String(n).padStart(2, '0')

function isDue(flow: Flow, schedule: FlowSchedule, now: Date): boolean {
  if (schedule.mode === 'times') {
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    if (!schedule.days.includes(now.getDay()) || !schedule.times.includes(hhmm)) return false
    const key = `${now.toDateString()} ${hhmm}`
    if (firedAt.get(flow.id) === key) return false
    firedAt.set(flow.id, key)
    return true
  }
  const every = Math.max(1, schedule.everyMinutes) * 60_000
  const last = listRuns(flow.id)[0]?.startedAt ?? intervalBase.get(flow.id)
  if (last === undefined) {
    intervalBase.set(flow.id, now.getTime())
    return false
  }
  return now.getTime() - last >= every
}

function tick() {
  const now = new Date()
  for (const flow of listFlows()) {
    if (!flow.enabled) continue
    const schedule = flow.nodes.find((n) => n.type === 'trigger')?.data.schedule
    if (!schedule || !isDue(flow, schedule, now)) continue
    runFlow(flow, 'schedule').catch(() => undefined)
  }
}

export function startScheduler() {
  setInterval(tick, TICK_MS)
  tick()
}

export function activeFlowCount(): number {
  return listFlows().filter((f) => f.enabled).length
}
