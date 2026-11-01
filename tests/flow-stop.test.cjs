const { test } = require('node:test')
const assert = require('node:assert/strict')
const { resolve } = require('node:path')
const { createJiti } = require('jiti')
const mock = resolve(__dirname, 'helpers/flow-runtime.cjs')
const jiti = createJiti(__filename, {
  moduleCache: true,
  alias: {
    electron: mock,
    '../providers/registry': mock,
    '../providers/claude-code/sessions': mock,
    '../providers/claude-code/oneShot': mock,
    '../store': mock,
    './store': mock,
    '@shared': resolve(__dirname, '../src/shared')
  }
})
const { state } = require(mock)
const { runFlow, stopFlow, isFlowRunning, recoverInterruptedFlows } = jiti('../src/main/flows/runner.ts')
const { listConfirmations, requestConfirmation } = jiti('../src/main/confirmations.ts')
const { runAsBot, listBotTasks } = jiti('../src/main/botQueue.ts')
const tick = () => new Promise((r) => setImmediate(r))
const deferred = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}
const node = (id, type = 'prompt', data = {}) => ({ id, type, position: { x: 0, y: 0 }, data: { message: 'Teste', ...data } })
const flow = (id, nodes, edges) => ({ id, name: id, enabled: false, createdAt: 1, updatedAt: 1,
  nodes: [node('trigger', 'trigger'), ...nodes],
  edges: edges.map(([source, target]) => ({ id: `${source}-${target}`, source, target })) })
const blocking = (signal) => new Promise((_, reject) => {
  signal.throwIfAborted()
  signal.addEventListener('abort', () => reject(new Error('cancelado')), { once: true })
})

test('parar fluxos cancela trabalho e impede novas etapas', async (t) => {
  await t.test('cancela ramos paralelos e preserva as etapas concluídas', async () => {
    const signals = []
    state.send = async (req, emit, signal) => {
      if (req.conversationId.endsWith(':first')) { emit({ type: 'delta', text: 'feito' }); return }
      signals.push(signal)
      await blocking(signal)
    }
    const f = flow('parallel', [node('first', 'prompt', { message: 'primeira' }), node('a'), node('b'), node('last')],
      [['trigger', 'first'], ['first', 'a'], ['first', 'b'], ['a', 'last'], ['b', 'last']])
    const id = await runFlow(f, 'manual')
    await tick()
    assert.equal(signals.length, 2)
    stopFlow(f.id)
    assert(signals.every((s) => s.aborted))
    assert.equal(isFlowRunning(f.id), false)
    await tick()
    const run = state.runs.get(id)
    assert.equal(run.status, 'stopped')
    assert.equal(run.steps.find((s) => s.nodeId === 'first').status, 'done')
    assert(run.steps.filter((s) => s.nodeId !== 'first').every((s) => s.status === 'stopped'))
  })

  await t.test('resposta atrasada não sobrescreve stop nem remove execução nova', async () => {
    const old = deferred()
    state.send = () => old.promise
    const f = flow('late', [node('a')], [['trigger', 'a']])
    const id = await runFlow(f, 'manual')
    await tick()
    stopFlow(f.id)
    state.send = (_req, _emit, signal) => blocking(signal)
    const next = await runFlow(f, 'manual')
    old.resolve()
    await tick()
    assert.equal(state.runs.get(id).status, 'stopped')
    assert.equal(state.runs.get(next).status, 'running')
    assert(isFlowRunning(f.id))
    stopFlow(f.id)
    await tick()
  })

  await t.test('remove confirmação pendente e não executa a próxima etapa', async () => {
    let calls = 0
    state.send = async () => { calls++ }
    const f = flow('confirm', [node('c', 'confirm', { options: [{ id: 'ok', label: 'Aprovar' }] }), node('last')],
      [['trigger', 'c'], ['c', 'last']])
    const id = await runFlow(f, 'manual')
    await tick()
    assert.equal(listConfirmations().length, 1)
    stopFlow(f.id)
    assert.equal(listConfirmations().length, 0)
    await tick()
    assert.equal(calls, 0)
    assert.equal(state.runs.get(id).status, 'stopped')
    await assert.rejects(requestConfirmation({ files: [] }, AbortSignal.abort()))
  })

  await t.test('cancela análise de decisão pelo mesmo sinal', async () => {
    let signal
    state.decision = (...args) => { signal = args[5]; return blocking(signal) }
    const f = flow('decision', [node('d', 'decision', { options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] })], [['trigger', 'd']])
    const id = await runFlow(f, 'manual')
    await tick()
    stopFlow(f.id)
    assert(signal.aborted)
    await tick()
    assert.equal(state.runs.get(id).status, 'stopped')
  })

  await t.test('tira tarefa da fila sem cancelar outro trabalho do bot', async () => {
    const busy = deferred()
    const owner = runAsBot('bot', { label: 'Outra conversa', origin: 'chat' }, new AbortController().signal, () => busy.promise)
    await tick()
    let calls = 0
    state.send = async () => { calls++ }
    const f = flow('queued', [node('b', 'bot', { botId: 'bot' })], [['trigger', 'b']])
    await runFlow(f, 'manual')
    await tick()
    assert.equal(listBotTasks().length, 2)
    stopFlow(f.id)
    await tick()
    assert.equal(listBotTasks().length, 1)
    assert.equal(calls, 0)
    busy.resolve()
    await owner
  })

  await t.test('execuções órfãs não deixam o editor bloqueado depois de reiniciar', () => {
    state.runs.set('orphan', { id: 'orphan', flowId: 'closed-app', status: 'running', steps: [
      { status: 'done' }, { status: 'running' }, { status: 'waiting' }, { status: 'pending' }
    ] })
    recoverInterruptedFlows()
    const recovered = state.runs.get('orphan')
    assert.equal(recovered.status, 'stopped')
    assert.equal(recovered.steps[0].status, 'done')
    assert(recovered.steps.slice(1).every((s) => s.status === 'stopped'))
  })
})
