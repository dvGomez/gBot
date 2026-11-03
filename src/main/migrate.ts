import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Bot, Conversation, Flow, FlowNode, Lesson, Specialization } from '@shared/types'

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
 */
const VERSION = 2

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
type V1Flow = Omit<Flow, 'botId' | 'nodes'> & {
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
  write(schemaFile, { version: VERSION })
}

function backup(dir: string, names: string[]) {
  const target = join(dir, `backup-v1-${Date.now()}`)
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
  backup(dir, ['bots.json', 'flows.json', 'memory', 'usage.jsonl', 'files.jsonl'])

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
  const flows: Flow[] = []
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
