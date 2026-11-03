const { test } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { createJiti } = require('jiti')

// Dados de uma instalação v1 numa pasta temporária: os bots antigos viram especializações e cada fluxo vira um bot.
test('migração v2 transforma bots em especializações e fluxos em bots com rotinas', () => {
  const userData = mkdtempSync(join(tmpdir(), 'gbot-migrate-'))
  const data = join(userData, 'data')
  mkdirSync(join(data, 'memory'), { recursive: true })
  mkdirSync(join(data, 'conversations'), { recursive: true })
  mkdirSync(join(data, 'bot-files', 'old-a'), { recursive: true })
  const write = (path, value) => writeFileSync(join(data, path), JSON.stringify(value))
  const read = (path) => JSON.parse(readFileSync(join(data, path), 'utf8'))
  write('bots.json', [
    { id: 'old-a', name: 'Revisor', description: 'Revisa PRs', instructions: 'Revise.', model: 'sonnet', providerId: 'claude-code', projectId: 'p1', createdAt: 1, updatedAt: 1 },
    { id: 'old-b', name: 'Escritor', description: '', instructions: 'Escreva.', model: 'opus', createdAt: 1, updatedAt: 1 }
  ])
  write('flows.json', [{
    id: 'f1', name: 'Resumo diário', enabled: true, projectId: 'p1', createdAt: 1, updatedAt: 1,
    nodes: [
      { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
      { id: 'a', type: 'bot', position: { x: 1, y: 0 }, data: { botId: 'old-a', message: 'Revise' } },
      { id: 'b', type: 'bot', position: { x: 2, y: 0 }, data: { botId: 'old-b', message: 'Escreva' } },
      { id: 'p', type: 'prompt', position: { x: 3, y: 0 }, data: { providerId: 'claude-code', model: 'haiku', message: 'Formate' } }
    ],
    edges: []
  }])
  write('memory/bot-old-a.json', [{ id: 'l1', owner: { kind: 'bot', id: 'old-a' }, title: 'PR', when: '', steps: '', why: '', source: { kind: 'manual' }, enabled: true, createdAt: 1, updatedAt: 1 }])
  write('memory/flow-f1.json', [{ id: 'l2', owner: { kind: 'flow', id: 'f1' }, title: 'Rotina', when: '', steps: '', why: '', source: { kind: 'flow', id: 'f1' }, enabled: true, createdAt: 1, updatedAt: 1 }])
  write('conversations/c1.json', { id: 'c1', title: 'Com bot', botId: 'old-a', messages: [] })
  write('conversations/c2.json', { id: 'c2', title: 'Normal', messages: [] })
  writeFileSync(join(data, 'usage.jsonl'), `${JSON.stringify({ at: 1, kind: 'flow', flowId: 'f1', botId: 'old-a' })}\n${JSON.stringify({ at: 2, kind: 'conversation', botId: 'old-b' })}\n`)

  const jiti = createJiti(__filename, { alias: { electron: resolve(__dirname, 'helpers/electron-userdata.cjs'), '@shared': resolve(__dirname, '../src/shared') } })
  require('./helpers/electron-userdata.cjs').setUserData(userData)
  const { migrateData } = jiti('../src/main/migrate.ts')
  migrateData()

  const specs = read('specializations.json')
  assert.deepEqual(specs.map((s) => [s.id, s.name, s.projectId]), [['old-a', 'Revisor', 'p1'], ['old-b', 'Escritor', undefined]])
  assert(existsSync(join(data, 'specialization-files', 'old-a')))
  assert(!existsSync(join(data, 'bots.json')))

  const [bot] = read('team.json')
  assert.equal(bot.name, 'Resumo diário')
  assert.equal(bot.projectId, 'p1')
  assert.deepEqual(bot.specializationIds, ['old-a', 'old-b'])
  // Bots antigos com modelos diferentes: o bot novo fica no padrão e cada caixinha guarda o modelo do bot antigo.
  assert.equal(bot.model, undefined)
  const [flow] = read('flows.json')
  assert.equal(flow.botId, bot.id)
  assert.equal(flow.projectId, undefined)
  // v3: o nome e o liga/desliga da rotina passam para o gatilho.
  assert.equal(flow.name, undefined)
  assert.equal(flow.enabled, undefined)
  assert.deepEqual([flow.nodes[0].data.label, flow.nodes[0].data.enabled], ['Resumo diário', true])
  assert.deepEqual(flow.nodes.map((n) => [n.type, n.data.specializationId, n.data.model, n.data.botId]), [
    ['trigger', undefined, undefined, undefined],
    ['task', 'old-a', 'sonnet', undefined],
    ['task', 'old-b', 'opus', undefined],
    ['task', undefined, 'haiku', undefined]
  ])

  assert.equal(read('memory/specialization-old-a.json')[0].owner.kind, 'specialization')
  assert.deepEqual(read(`memory/bot-${bot.id}.json`)[0].owner, { kind: 'bot', id: bot.id })
  assert(!existsSync(join(data, 'memory', 'flow-f1.json')))
  assert.deepEqual(readdirSync(join(data, 'conversations')), ['c2.json'])
  const usage = readFileSync(join(data, 'usage.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(usage, [{ at: 1, kind: 'flow', flowId: 'f1', botId: bot.id }, { at: 2, kind: 'conversation' }])
  assert(readdirSync(data).some((d) => d.startsWith('backup-v1-')))
  assert(readdirSync(data).some((d) => d.startsWith('backup-v2-')))
  assert.equal(read('schema.json').version, 3)

  // Rodar de novo não muda nada.
  migrateData()
  assert.deepEqual(read('team.json'), [bot])
})

// v2 → v3: as rotinas de um bot viram faixas do mesmo fluxo, e as execuções vão junto.
test('migração v3 junta as rotinas de um bot num fluxo com um gatilho por rotina', () => {
  const userData = mkdtempSync(join(tmpdir(), 'gbot-migrate-v3-'))
  const data = join(userData, 'data')
  mkdirSync(join(data, 'flow-runs'), { recursive: true })
  const write = (path, value) => writeFileSync(join(data, path), JSON.stringify(value))
  const read = (path) => JSON.parse(readFileSync(join(data, path), 'utf8'))
  write('schema.json', { version: 2 })
  write('team.json', [{ id: 'b1', name: 'Lia' }, { id: 'b2', name: 'Sem rotina' }])
  const lane = (id, name, enabled, createdAt) => ({ id, botId: 'b1', name, enabled, createdAt, updatedAt: createdAt,
    nodes: [{ id: `${id}-t`, type: 'trigger', position: { x: 0, y: 0 }, data: { schedule: { mode: 'interval', everyMinutes: 60 } } },
      { id: `${id}-a`, type: 'task', position: { x: 320, y: 0 }, data: { message: name } }],
    edges: [{ id: `${id}-e`, source: `${id}-t`, target: `${id}-a` }] })
  write('flows.json', [lane('f1', 'Manhã', true, 1), lane('f2', 'Tarde', false, 2)])
  write('flow-runs/f2.json', [{ id: 'r2', flowId: 'f2', trigger: 'manual', status: 'done', startedAt: 20, steps: [] }])
  writeFileSync(join(data, 'usage.jsonl'), `${JSON.stringify({ at: 1, kind: 'flow', flowId: 'f2', botId: 'b1' })}\n`)

  const jiti = createJiti(__filename, { alias: { electron: resolve(__dirname, 'helpers/electron-userdata.cjs'), '@shared': resolve(__dirname, '../src/shared') } })
  require('./helpers/electron-userdata.cjs').setUserData(userData)
  jiti('../src/main/migrate.ts').migrateData()

  const flows = read('flows.json')
  assert.equal(flows.length, 2)
  const lia = flows.find((f) => f.botId === 'b1')
  assert.equal(lia.id, 'f1')
  const triggers = lia.nodes.filter((n) => n.type === 'trigger')
  assert.deepEqual(triggers.map((t) => [t.data.label, t.data.enabled]), [['Manhã', true], ['Tarde', false]])
  // A segunda faixa fica abaixo da primeira.
  assert(triggers[1].position.y > triggers[0].position.y)
  assert.equal(lia.edges.length, 2)
  const empty = flows.find((f) => f.botId === 'b2')
  assert.deepEqual(empty.nodes.map((n) => [n.type, n.data.enabled]), [['trigger', false]])
  assert(!existsSync(join(data, 'flow-runs', 'f2.json')))
  assert.deepEqual(read('flow-runs/f1.json').map((r) => [r.id, r.flowId, r.triggerId, r.triggerLabel]), [['r2', 'f1', 'f2-t', 'Tarde']])
  assert.equal(JSON.parse(readFileSync(join(data, 'usage.jsonl'), 'utf8')).flowId, 'f1')
  assert.equal(read('schema.json').version, 3)
})
