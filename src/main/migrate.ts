import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Bot, Conversation, Flow, FlowEdge, FlowNode, FlowRun, Lesson, Specialization } from '@shared/types'

/**
 * Migrações dos dados locais (data/schema.json guarda a versão). Rodam uma vez, ao abrir o app, antes de qualquer
 * leitura. Antes de mudar algo, os arquivos afetados são copiados para data/backup-v<versão>/.
 *
 * v2 — o bot antigo vira especialização e cada fluxo vira um bot (com o fluxo como a primeira rotina dele):
 *   bots.json            → specializations.json (instruções, projeto) e bot-files/ → specialization-files/
 *   flows.json           → um bot novo por fluxo em team.json; o fluxo ganha `botId` e as caixinhas de bot e de prompt
 *                          viram tarefas (com a especialização correspondente)
 *   memory/bot-<id>      → memory/specialization-<id> (o "como fazer X")
 *   memory/flow-<id>     → memory/bot-<novo bot> (como a rotina funciona)
 *   conversas com bot    → apagadas (não havia como manter a persona antiga)
 *   usage/files.jsonl    → registros de fluxo passam a apontar para o bot novo
 *
 * v3 — cada bot tem um fluxo só, com um gatilho por rotina: as rotinas de um bot viram faixas do mesmo canvas (o nome e
 * o liga/desliga de cada uma passam para o gatilho dela), as execuções e os registros vão para o fluxo que ficou, e bot
 * sem rotina ganha um fluxo com um gatilho desligado.
 */
const VERSION = 3

const dataDir = () => join(app.getPath('userData'), 'data')

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

/** Bot e nós como eram na v1. */
interface V1Bot {
  id: string
  name: string
  description: string
  instructions: string
  providerId?: string
  model?: string
  projectId?: string
  createdAt: number
  updatedAt: number
}
/** Fluxo como era na v1 (solto) e na v2 (uma rotina de um bot, com nome e liga/desliga próprios). */
type V2Flow = Flow & { name: string; enabled: boolean }
type V1Flow = Omit<V2Flow, 'botId' | 'nodes'> & {
  projectId?: string
  nodes: (Omit<FlowNode, 'type'> & { type: string; data: FlowNode['data'] & { botId?: string } })[]
}

export function migrateData() {
  const dir = dataDir()
  mkdirSync(dir, { recursive: true })
  const schemaFile = join(dir, 'schema.json')
  const version = read<{ version: number }>(schemaFile, { version: 1 }).version
  if (version >= VERSION) return
  if (version < 2) migrateToV2(dir)
  if (version < 3) migrateToV3(dir)
  write(schemaFile, { version: VERSION })
}

function backup(dir: string, names: string[], from: number) {
  const target = join(dir, `backup-v${from}-${Date.now()}`)
  mkdirSync(target, { recursive: true })
  for (const name of names) {
    const from = join(dir, name)
    if (existsSync(from)) cpSync(from, join(target, name), { recursive: true })
  }
}

function migrateToV2(dir: string) {
  const oldBotsFile = join(dir, 'bots.json')
  const flowsFile = join(dir, 'flows.json')
  const oldBots = read<V1Bot[]>(oldBotsFile, [])
  const oldFlows = read<V1Flow[]>(flowsFile, [])
  // Instalação nova: nada a migrar.
  if (!existsSync(oldBotsFile) && !existsSync(flowsFile)) return
  backup(dir, ['bots.json', 'flows.json', 'memory', 'usage.jsonl', 'files.jsonl'], 1)

  // Bots antigos → especializações (mesmo id: memória, arquivos e referências continuam batendo).
  const specializations: Specialization[] = oldBots.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    instructions: b.instructions,
    ...(b.projectId ? { projectId: b.projectId } : {}),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt
  }))
  write(join(dir, 'specializations.json'), specializations)
  const oldFiles = join(dir, 'bot-files')
  if (existsSync(oldFiles) && !existsSync(join(dir, 'specialization-files'))) renameSync(oldFiles, join(dir, 'specialization-files'))

  // Cada fluxo → um bot novo, com o fluxo como rotina. O avatar é sorteado pela interface na primeira abertura.
  const oldById = new Map(oldBots.map((b) => [b.id, b]))
  const botOfFlow = new Map<string, string>()
  const team: Omit<Bot, 'avatar'>[] = []
  const flows: V2Flow[] = []
  for (const f of oldFlows) {
    const used = [...new Set(f.nodes.filter((n) => n.type === 'bot' && n.data.botId && oldById.has(n.data.botId)).map((n) => n.data.botId!))]
    const usedBots = used.map((id) => oldById.get(id)!)
    // Um modelo só para o bot quando todos os bots antigos do fluxo usavam o mesmo.
    const same = usedBots.length > 0 && usedBots.every((b) => b.providerId === usedBots[0].providerId && b.model === usedBots[0].model)
    const shared = same ? usedBots[0] : undefined
    const now = Date.now()
    const bot: Omit<Bot, 'avatar'> = {
      id: randomUUID(),
      name: f.name.slice(0, 40),
      description: usedBots.length ? `Cuida da rotina "${f.name}" com ${usedBots.map((b) => b.name).join(', ')}` : `Cuida da rotina "${f.name}"`,
      instructions: '',
      specializationIds: used,
      ...(shared?.providerId ? { providerId: shared.providerId } : {}),
      ...(shared?.model ? { model: shared.model } : {}),
      ...(f.projectId ? { projectId: f.projectId } : {}),
      createdAt: now,
      updatedAt: now
    }
    team.push(bot)
    botOfFlow.set(f.id, bot.id)
    const { projectId: _projectId, ...rest } = f
    flows.push({
      ...rest,
      botId: bot.id,
      nodes: f.nodes.map((n): FlowNode => {
        const { botId, ...data } = n.data
        if (n.type === 'bot') {
          const old = botId ? oldById.get(botId) : undefined
          // Bot antigo com modelo diferente do bot novo: a caixinha guarda o modelo dele, para nada mudar.
          const own = old && !same && (old.providerId || old.model) ? { providerId: old.providerId, model: old.model } : {}
          return { ...n, type: 'task', data: { ...data, ...own, ...(old ? { specializationId: old.id } : {}) } }
        }
        if (n.type === 'prompt') return { ...n, type: 'task', data }
        return { ...n, type: n.type as FlowNode['type'], data }
      })
    })
  }
  write(join(dir, 'team.json'), team)
  write(flowsFile, flows)

  // Memória: bot antigo → especialização; fluxo → bot novo.
  const memDir = join(dir, 'memory')
  if (existsSync(memDir)) {
    for (const name of readdirSync(memDir)) {
      const m = name.match(/^(bot|flow)-(.+)\.json$/)
      if (!m) continue
      const file = join(memDir, name)
      const lessons = read<Lesson[]>(file, [])
      const owner: Lesson['owner'] | undefined =
        m[1] === 'bot' ? { kind: 'specialization', id: m[2] } : botOfFlow.has(m[2]) ? { kind: 'bot', id: botOfFlow.get(m[2])! } : undefined
      rmSync(file, { force: true })
      if (!owner || !lessons.length) continue
      write(join(memDir, `${owner.kind}-${owner.id}.json`), lessons.map((l) => ({ ...l, owner })))
    }
  }

  // Conversas com os bots antigos não fazem sentido com o bot novo: saem.
  const convDir = join(dir, 'conversations')
  if (existsSync(convDir)) {
    for (const name of readdirSync(convDir)) {
      if (!name.endsWith('.json')) continue
      const conv = read<Conversation | undefined>(join(convDir, name), undefined)
      if (!conv?.botId) continue
      rmSync(join(convDir, name), { force: true })
      rmSync(join(dir, 'attachments', conv.id), { recursive: true, force: true })
    }
  }

  // Registros de consumo e de arquivos: o que veio de um fluxo passa a ser do bot novo; os de bots antigos ficam sem bot.
  for (const name of ['usage.jsonl', 'files.jsonl']) {
    const file = join(dir, name)
    if (!existsSync(file)) continue
    const lines = readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        try {
          const { botId: _botId, ...rec } = JSON.parse(line) as { botId?: string; flowId?: string }
          const botId = rec.flowId ? botOfFlow.get(rec.flowId) : undefined
          return JSON.stringify(botId ? { ...rec, botId } : rec)
        } catch {
          return undefined
        }
      })
      .filter(Boolean)
    writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''))
  }

  rmSync(oldBotsFile, { force: true })
}

/** Gatilho novo, desligado (para bot que ainda não tinha rotina). */
const idleTrigger = (): FlowNode => ({
  id: randomUUID(),
  type: 'trigger',
  position: { x: 0, y: 0 },
  data: { enabled: false, schedule: { mode: 'times', days: [1, 2, 3, 4, 5], times: ['09:00'] } }
})

/** Espaço vertical entre as faixas (uma por rotina antiga) no canvas juntado. */
const LANE_GAP = 360

function migrateToV3(dir: string) {
  const flowsFile = join(dir, 'flows.json')
  const teamFile = join(dir, 'team.json')
  if (!existsSync(flowsFile) && !existsSync(teamFile)) return
  backup(dir, ['flows.json', 'flow-runs', 'usage.jsonl', 'files.jsonl'], 2)
  const old = read<V2Flow[]>(flowsFile, [])
  const team = read<{ id: string }[]>(teamFile, [])
  const kept = new Map<string, string>()
  const flows: Flow[] = []

  for (const bot of team) {
    const own = old.filter((f) => f.botId === bot.id).sort((a, b) => a.createdAt - b.createdAt)
    if (!own.length) {
      const now = Date.now()
      flows.push({ id: randomUUID(), botId: bot.id, nodes: [idleTrigger()], edges: [], createdAt: now, updatedAt: now })
      continue
    }
    // As rotinas do bot viram faixas empilhadas do mesmo canvas; o fluxo mais antigo fica com o id.
    const nodes: FlowNode[] = []
    const edges: FlowEdge[] = []
    let top = 0
    for (const f of own) {
      const ys = f.nodes.map((n) => n.position.y)
      const offset = top - Math.min(0, ...ys)
      for (const n of f.nodes) {
        nodes.push(
          n.type === 'trigger'
            ? { ...n, position: { x: n.position.x, y: n.position.y + offset }, data: { ...n.data, label: n.data.label?.trim() || f.name, enabled: f.enabled } }
            : { ...n, position: { x: n.position.x, y: n.position.y + offset } }
        )
      }
      edges.push(...f.edges)
      top = Math.max(top, ...ys.map((y) => y + offset)) + LANE_GAP
      kept.set(f.id, own[0].id)
    }
    flows.push({ id: own[0].id, botId: bot.id, nodes, edges, createdAt: own[0].createdAt, updatedAt: Date.now() })
  }
  write(flowsFile, flows)

  // Execuções: as das rotinas juntadas vão para o arquivo do fluxo que ficou, marcadas com o gatilho de cada uma.
  const runsDir = join(dir, 'flow-runs')
  if (existsSync(runsDir)) {
    const merged = new Map<string, FlowRun[]>()
    for (const f of old) {
      const file = join(runsDir, `${f.id.replace(/[^a-zA-Z0-9-]/g, '')}.json`)
      const runs = read<Omit<FlowRun, 'triggerId' | 'triggerLabel'>[]>(file, [])
      rmSync(file, { force: true })
      const target = kept.get(f.id)
      if (!target) continue
      const trigger = f.nodes.find((n) => n.type === 'trigger')
      merged.set(target, [
        ...(merged.get(target) ?? []),
        ...runs.map((r) => ({ ...r, flowId: target, triggerId: trigger?.id ?? '', triggerLabel: trigger?.data.label?.trim() || f.name }))
      ])
    }
    for (const [id, runs] of merged) {
      write(join(runsDir, `${id.replace(/[^a-zA-Z0-9-]/g, '')}.json`), runs.sort((a, b) => b.startedAt - a.startedAt).slice(0, 50))
    }
  }

  // Registros de consumo e de arquivos apontam para o fluxo que ficou.
  for (const name of ['usage.jsonl', 'files.jsonl']) {
    const file = join(dir, name)
    if (!existsSync(file)) continue
    const lines = readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        try {
          const rec = JSON.parse(line) as { flowId?: string }
          return JSON.stringify(rec.flowId && kept.has(rec.flowId) ? { ...rec, flowId: kept.get(rec.flowId) } : rec)
        } catch {
          return undefined
        }
      })
      .filter(Boolean)
    writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''))
  }
}
