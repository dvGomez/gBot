import { useEffect, useState } from 'react'
import type { Flow, FlowRun } from '@shared/types'

/** Execução marcada como "rodando" há mais de 1 h sobrou de um app fechado no meio; não conta como ao vivo. */
const STALE_MS = 60 * 60 * 1000
export const isLive = (run: FlowRun) => run.status === 'running' && Date.now() - run.startedAt < STALE_MS

/** Execuções recentes de cada rotina (as mais novas primeiro), atualizadas ao vivo. */
export function useFlowRuns(flows: Flow[], perFlow = 10): Record<string, FlowRun[]> {
  const [runs, setRuns] = useState<Record<string, FlowRun[]>>({})
  const ids = flows.map((f) => f.id).join()

  useEffect(() => {
    let alive = true
    for (const id of ids ? ids.split(',') : []) {
      void window.gbot.flows.runs(id).then((list) => {
        if (alive) setRuns((r) => ({ ...r, [id]: list.slice(0, perFlow) }))
      })
    }
    const off = window.gbot.flows.onRunUpdate((run) =>
      setRuns((r) => ({ ...r, [run.flowId]: [run, ...(r[run.flowId] ?? []).filter((x) => x.id !== run.id)].slice(0, perFlow) }))
    )
    return () => {
      alive = false
      off()
    }
  }, [ids, perFlow])

  return runs
}
