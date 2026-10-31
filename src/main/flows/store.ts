import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Flow, FlowRun } from '@shared/types'
import { removeMemory } from '../memory'

/** Fluxos em data/flows.json; execuções em data/flow-runs/<fluxo>.json (as 50 mais recentes). */
const MAX_RUNS = 50

function dir(...parts: string[]) {
  const d = join(app.getPath('userData'), 'data', ...parts)
  mkdirSync(d, { recursive: true })
  return d
}

function read<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function write(file: string, value: unknown) {
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2))
  renameSync(`${file}.tmp`, file)
}

const flowsFile = () => join(dir(), 'flows.json')
const runsFile = (flowId: string) => join(dir('flow-runs'), `${flowId.replace(/[^a-zA-Z0-9-]/g, '')}.json`)

export function listFlows(): Flow[] {
  return read<Flow[]>(flowsFile(), []).sort((a, b) => a.createdAt - b.createdAt)
}

export function getFlow(id: string): Flow | undefined {
  return listFlows().find((f) => f.id === id)
}

export function saveFlow(flow: Flow) {
  write(flowsFile(), [...listFlows().filter((f) => f.id !== flow.id), flow])
}

export function removeFlow(id: string) {
  write(
    flowsFile(),
    listFlows().filter((f) => f.id !== id)
  )
  rmSync(runsFile(id), { force: true })
  removeMemory({ kind: 'flow', id })
}

/** Solta os fluxos de um projeto que foi excluído. */
export function detachFlows(projectId: string) {
  write(
    flowsFile(),
    listFlows().map(({ projectId: p, ...f }) => (p === projectId ? f : { ...f, projectId: p }))
  )
}

export function listRuns(flowId: string): FlowRun[] {
  return read<FlowRun[]>(runsFile(flowId), [])
}

/** Grava (ou atualiza) uma execução, mantendo as mais recentes primeiro. */
export function saveRun(run: FlowRun) {
  const runs = [run, ...listRuns(run.flowId).filter((r) => r.id !== run.id)].slice(0, MAX_RUNS)
  write(runsFile(run.flowId), runs)
}
