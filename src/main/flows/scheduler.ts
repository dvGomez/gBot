import type { Flow, FlowNode, FlowSchedule } from '@shared/types'
import { activeTriggers } from '@shared/flows'
import { isTriggerRunning, runFlow } from './runner'
import { listFlows, listRuns } from './store'

/**
 * Confere os gatilhos a cada 20 s enquanto o gBot está aberto (inclusive só na barra de menu). Cada gatilho ligado de
 * cada fluxo tem a sua agenda. Horários perdidos com o app fechado não são executados depois.
 */
const TICK_MS = 20_000
const firedAt = new Map<string, string>()
/** Para gatilhos "a cada N minutos": quando começou a contar (sem execução anterior). */
const intervalBase = new Map<string, number>()

const pad = (n: number) => String(n).padStart(2, '0')

function isDue(flow: Flow, trigger: FlowNode, schedule: FlowSchedule, now: Date): boolean {
  const key = `${flow.id}:${trigger.id}`
  if (schedule.mode === 'times') {
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    if (!schedule.days.includes(now.getDay()) || !schedule.times.includes(hhmm)) return false
    const at = `${now.toDateString()} ${hhmm}`
    if (firedAt.get(key) === at) return false
    firedAt.set(key, at)
    return true
  }
  const every = Math.max(1, schedule.everyMinutes) * 60_000
  const last = listRuns(flow.id).find((r) => r.triggerId === trigger.id)?.startedAt ?? intervalBase.get(key)
  if (last === undefined) {
    intervalBase.set(key, now.getTime())
    return false
  }
  return now.getTime() - last >= every
}

function tick() {
  const now = new Date()
  for (const flow of listFlows()) {
    for (const trigger of activeTriggers(flow)) {
      if (isTriggerRunning(flow.id, trigger.id) || !isDue(flow, trigger, trigger.data.schedule!, now)) continue
      runFlow(flow, trigger.id, 'schedule').catch(() => undefined)
    }
  }
}

export function startScheduler() {
  setInterval(tick, TICK_MS)
  tick()
}

/** Quantas rotinas (gatilhos ligados com agenda) existem, para a barra de menu. */
export function activeFlowCount(): number {
  return listFlows().reduce((n, f) => n + activeTriggers(f).length, 0)
}
