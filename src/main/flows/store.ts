import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Flow, FlowNode, FlowRun } from '@shared/types'

/** Fluxos dos bots (um por bot) em data/flows.json; execuções em data/flow-runs/<fluxo>.json (as 50 mais recentes). */
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
}

/** Fluxo do bot (cada bot tem um). */
export const botFlow = (botId: string): Flow | undefined => listFlows().find((f) => f.botId === botId)

/** Gatilho novo, desligado: segunda a sexta às 9h. */
export function newTrigger(position = { x: 0, y: 0 }): FlowNode {
  return { id: randomUUID(), type: 'trigger', position, data: { enabled: false, schedule: { mode: 'times', days: [1, 2, 3, 4, 5], times: ['09:00'] } } }
}

/** Cria o fluxo do bot se ele ainda não tem um. */
export function ensureBotFlow(botId: string): Flow {
  const existing = botFlow(botId)
  if (existing) return existing
  const now = Date.now()
  const flow: Flow = { id: randomUUID(), botId, nodes: [newTrigger()], edges: [], createdAt: now, updatedAt: now }
  saveFlow(flow)
  return flow
}

/** Liga ou desliga a agenda de um gatilho direto no arquivo (a execução em andamento usa a cópia dela). */
export function setTriggerEnabled(flowId: string, triggerId: string, enabled: boolean) {
  const flow = getFlow(flowId)
  if (!flow) throw new Error('Rotina não encontrada.')
  saveFlow({
    ...flow,
    nodes: flow.nodes.map((n) => (n.id === triggerId && n.type === 'trigger' ? { ...n, data: { ...n.data, enabled } } : n)),
    updatedAt: Date.now()
  })
}

/** Remove o fluxo de um bot que foi excluído. */
export function removeBotFlows(botId: string) {
  for (const flow of listFlows()) if (flow.botId === botId) removeFlow(flow.id)
}

/** Tira uma especialização excluída das caixinhas que a usavam (o bot passa a fazer a tarefa sem ela). */
export function forgetSpecialization(id: string) {
  write(
    flowsFile(),
    listFlows().map((f) =>
      f.nodes.some((n) => n.data.specializationId === id)
        ? { ...f, nodes: f.nodes.map((n) => (n.data.specializationId === id ? { ...n, data: { ...n.data, specializationId: undefined } } : n)) }
        : f
    )
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
