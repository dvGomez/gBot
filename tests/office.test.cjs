const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createJiti } = require('jiti')
const jiti = createJiti(__filename)
const { buildLayout, route, visitSpot, pointAlong, reroute } = jiti('../src/renderer/src/components/office/layout.ts')
const { computePlans, COFFEE_MS, CELEBRATE_MS } = jiti('../src/renderer/src/components/office/behavior.ts')

const rooms = [
  { id: 'mkt', name: 'Marketing', color: '#f08a4b', botIds: ['a', 'b'] },
  { id: 'sales', name: 'Vendas', color: '#5b8def', botIds: ['c', 'd', 'e', 'f', 'g'] },
  { id: 'none', name: 'Sem projeto', color: '#8e9196', botIds: ['h'] }
]

/** Algum ponto do trecho cai dentro de um móvel? */
function crosses(a, b, obstacles) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05)
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps
    const y = a.y + ((b.y - a.y) * i) / steps
    const hit = obstacles.find((r) => x > r.x + 0.02 && x < r.x + r.w - 0.02 && y > r.y + 0.02 && y < r.y + r.d - 0.02)
    if (hit) return hit
  }
}

test('office layout gives every bot its own desk and walkable paths between all places', () => {
  const layout = buildLayout(rooms)
  const ids = rooms.flatMap((r) => r.botIds)
  assert.deepEqual(Object.keys(layout.seats).sort(), [...ids].sort())
  const keys = new Set(Object.values(layout.seats).map((s) => `${s.x},${s.y}`))
  assert.equal(keys.size, ids.length, 'seats must not overlap')

  const spots = [
    ...Object.values(layout.seats),
    ...Object.values(layout.seats).flatMap((s) => [0, 1, 2].map((k) => visitSpot(s, layout.corridorY, k))),
    ...layout.lounge,
    ...layout.meeting,
    ...layout.coffee
  ]
  for (const s of spots) assert.equal(crosses(s, s, layout.obstacles), undefined, `${s.key} stands inside furniture`)
  for (const from of spots) {
    for (const to of spots) {
      const path = route(from, to)
      for (let i = 1; i < path.length; i++) {
        const hit = crosses(path[i - 1], path[i], layout.obstacles)
        assert.equal(hit, undefined, `${from.key} → ${to.key} crosses furniture at ${JSON.stringify(hit)}`)
      }
    }
  }
})

test('changing destination mid-walk never cuts through furniture', () => {
  const layout = buildLayout(rooms)
  const spots = [...Object.values(layout.seats), ...layout.lounge, ...layout.meeting.slice(0, 5), ...layout.coffee.slice(0, 3)]
  for (const from of spots) {
    for (const to of spots) {
      const path = route(from, to)
      if (path.length < 2) continue
      for (const f of [0.1, 0.35, 0.6, 0.9]) {
        const p = pointAlong(path, f)
        for (const next of [spots[0], layout.lounge[0], layout.coffee[1], from]) {
          const detour = reroute(path, p.seg, p, next, layout.corridorY)
          assert(detour, `no detour from ${from.key} → ${to.key} at ${f}`)
          for (let i = 1; i < detour.length; i++) {
            const hit = crosses(detour[i - 1], detour[i], layout.obstacles)
            assert.equal(hit, undefined, `${from.key} → ${to.key} (${f}) → ${next.key} crosses ${JSON.stringify(hit)}`)
          }
        }
      }
    }
  }
})

test('office layout grows with the team and keeps a minimum size', () => {
  const small = buildLayout([{ id: 'x', name: 'X', color: '#fff', botIds: ['a'] }])
  assert.equal(small.W, 14)
  const big = buildLayout([{ id: 'x', name: 'X', color: '#fff', botIds: Array.from({ length: 9 }, (_, i) => `b${i}`) }])
  assert(big.roomsDepth > small.roomsDepth, 'more rows of desks make the rooms deeper')
  assert.equal(route(small.lounge[0], small.lounge[0]).length, 0)
})

const bots = [
  { id: 'ana', name: 'Ana' },
  { id: 'bia', name: 'Bia' },
  { id: 'caio', name: 'Caio' },
  { id: 'duda', name: 'Duda' },
  { id: 'eva', name: 'Eva' },
  { id: 'fred', name: 'Fred' }
]
const working = (botId) => ({ botId, state: 'working', mood: 'thinking', text: 'x', target: { kind: 'bot', id: botId } })
const waiting = (botId) => ({ botId, state: 'waiting', mood: 'attention', text: 'x', target: { kind: 'bot', id: botId } })
const now = 1_000_000

test('office plans come only from app state, with waiting and consultations first', () => {
  const plans = computePlans({
    bots,
    now,
    activity: new Map([
      ['ana', working('ana')],
      ['bia', working('bia')],
      ['caio', waiting('caio')]
    ]),
    tasks: [{ id: 't1', botId: 'bia', label: 'Consulta de Ana', origin: 'consult', originId: 'conv-1', status: 'running', queuedAt: 0 }],
    flows: [
      { id: 'f-duda', botId: 'duda' },
      { id: 'f-eva', botId: 'eva' }
    ],
    runs: {
      'f-duda': [{ id: 'r1', flowId: 'f-duda', status: 'done', startedAt: now - 60_000, finishedAt: now - CELEBRATE_MS - 1000, steps: [] }],
      'f-eva': [{ id: 'r2', flowId: 'f-eva', status: 'error', startedAt: now - 60_000, finishedAt: now - 5000, steps: [] }]
    },
    upcoming: [{ botId: 'fred', at: now + 120_000, label: 'Relatório' }]
  })
  assert.equal(plans.get('caio').kind, 'wait')
  assert.equal(plans.get('bia').kind, 'host')
  assert.equal(plans.get('bia').partner, 'ana')
  assert.deepEqual(plans.get('bia').target, { kind: 'conversation', id: 'conv-1' })
  assert.equal(plans.get('ana').kind, 'visit')
  assert.equal(plans.get('ana').partner, 'bia')
  assert.equal(plans.get('duda').kind, 'coffee')
  assert.deepEqual(plans.get('duda').target, { kind: 'flow', id: 'f-duda' })
  assert.equal(plans.get('eva').kind, 'error')
  assert.equal(plans.get('fred').kind, 'soon')
})

test('office plans let finished bots celebrate, then rest', () => {
  const base = { bots: [bots[0]], activity: new Map(), tasks: [], flows: [{ id: 'f', botId: 'ana' }], upcoming: [] }
  const run = (finishedAt) => ({ f: [{ id: 'r', flowId: 'f', status: 'done', startedAt: 0, finishedAt, steps: [] }] })
  assert.equal(computePlans({ ...base, now, runs: run(now - 1000) }).get('ana').kind, 'done')
  assert.equal(computePlans({ ...base, now, runs: run(now - COFFEE_MS - 1) }).get('ana').kind, 'sleep')
  // Rotina ainda rodando, entre uma caixinha e outra: continua na mesa
  const between = computePlans({ ...base, now, runs: { f: [{ id: 'r', flowId: 'f', status: 'running', startedAt: now - 5000, steps: [] }] } })
  assert.equal(between.get('ana').kind, 'work')
  assert.deepEqual(between.get('ana').target, { kind: 'flow', id: 'f' })
  // Consultado por alguém que não é um bot (o assistente da conversa): responde sem visita
  const plans = computePlans({
    ...base,
    now,
    runs: {},
    tasks: [{ id: 't', botId: 'ana', label: 'Consulta de o assistente da conversa', origin: 'consult', status: 'running', queuedAt: 0 }]
  })
  assert.equal(plans.get('ana').kind, 'host')
  assert.equal(plans.get('ana').partner, undefined)
  assert.equal(plans.get('ana').partnerName, 'o assistente da conversa')
})
