import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import type { ChatEvent, Flow, FlowNode, FlowRun, FlowRunStep, SendMessageRequest } from '@shared/types'
import { stableUuid } from '../providers/claude-code/sessions'
import { getProvider } from '../providers/registry'
import { getBot } from '../store'
import { saveRun } from './store'

/** Tempo máximo de uma caixinha. */
const STEP_TIMEOUT_MS = 15 * 60_000

/** Fluxos em execução (um fluxo não roda duas vezes ao mesmo tempo). */
const running = new Set<string>()

export const isFlowRunning = (flowId: string) => running.has(flowId)

function publish(run: FlowRun) {
  saveRun(run)
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('flows:run-update', run)
}

export function nodeLabel(node: FlowNode): string {
  if (node.data.label?.trim()) return node.data.label.trim()
  if (node.type === 'bot') return getBot(node.data.botId ?? '')?.name ?? 'Bot'
  if (node.type === 'prompt') return 'Prompt'
  return 'Gatilho'
}

/** Caixinhas alcançáveis a partir do gatilho, em ordem; erro se houver ciclo. */
function plan(flow: Flow): { order: FlowNode[]; parents: Map<string, string[]> } {
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  for (const e of flow.edges) {
    parents.set(e.target, [...(parents.get(e.target) ?? []), e.source])
    children.set(e.source, [...(children.get(e.source) ?? []), e.target])
  }
  const trigger = flow.nodes.find((n) => n.type === 'trigger')
  if (!trigger) throw new Error('O fluxo não tem gatilho.')

  const reachable = new Set<string>()
  const stack = [trigger.id]
  while (stack.length) {
    const id = stack.pop()!
    for (const c of children.get(id) ?? []) if (!reachable.has(c)) reachable.add(c), stack.push(c)
  }
  if (reachable.has(trigger.id)) throw new Error('O fluxo tem um ciclo (uma caixinha volta para o gatilho).')

  // Ordem topológica entre as alcançáveis (Kahn); sobra = ciclo.
  const indeg = new Map<string, number>()
  for (const id of reachable) indeg.set(id, (parents.get(id) ?? []).filter((p) => reachable.has(p)).length)
  const queue = [...reachable].filter((id) => indeg.get(id) === 0)
  const order: FlowNode[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(flow.nodes.find((n) => n.id === id)!)
    for (const c of children.get(id) ?? []) {
      if (!reachable.has(c)) continue
      indeg.set(c, indeg.get(c)! - 1)
      if (indeg.get(c) === 0) queue.push(c)
    }
  }
  if (order.length !== reachable.size) throw new Error('O fluxo tem um ciclo entre caixinhas.')
  return { order, parents }
}

/** Monta o texto da caixinha: o que o usuário escreveu + o resultado das anteriores. */
function compose(flow: Flow, node: FlowNode, inputs: string[]): string {
  const prev = inputs.length === 1 ? inputs[0] : inputs.map((t, i) => `Resultado ${i + 1}:\n${t}`).join('\n\n')
  let text = (node.data.message ?? '').trim()
  if (text.includes('{{anterior}}')) text = text.replaceAll('{{anterior}}', prev)
  else if (prev) text = `${text}\n\n<resultado_anterior>\n${prev}\n</resultado_anterior>`.trim()
  if (!text) throw new Error('A caixinha está sem mensagem.')
  return [
    `[Etapa do fluxo automático "${flow.name}" no gBot. Ninguém está acompanhando em tempo real: entregue o resultado direto, sem fazer perguntas.]`,
    '',
    text
  ].join('\n')
}

async function execute(
  runId: string,
  flow: Flow,
  node: FlowNode,
  inputs: string[],
  onNotice: (text: string) => void
): Promise<string> {
  const text = compose(flow, node, inputs)
  const base = {
    requestId: randomUUID(),
    conversationId: stableUuid(`flow:${runId}:${node.id}`),
    text,
    history: [],
    origin: { kind: 'flow' as const, id: flow.id }
  }
  let req: SendMessageRequest
  if (node.type === 'bot') {
    const bot = getBot(node.data.botId ?? '')
    if (!bot) throw new Error('O bot desta caixinha não existe mais.')
    req = {
      ...base,
      providerId: 'claude-code',
      model: bot.model,
      projectId: bot.projectId ?? flow.projectId,
      bot: { id: bot.id, name: bot.name, description: bot.description, instructions: bot.instructions }
    }
  } else {
    // Caixinha de prompt aprende na memória do próprio fluxo; caixinha de bot, na memória do bot.
    req = {
      ...base,
      providerId: node.data.providerId ?? 'claude-code',
      model: node.data.model,
      projectId: flow.projectId,
      memory: { kind: 'flow', id: flow.id }
    }
  }

  const provider = getProvider(req.providerId)
  if (!provider) throw new Error(`Provedor desconhecido: ${req.providerId}`)
  let out = ''
  let error: string | undefined
  const collect = (ev: ChatEvent) => {
    if (ev.type === 'delta') out += ev.text
    if (ev.type === 'error') error = ev.message
    if (ev.type === 'notice') onNotice(ev.text)
  }
  const signal = AbortSignal.timeout(STEP_TIMEOUT_MS)
  await provider.send(req, collect, signal)
  if (error) throw new Error(error)
  if (signal.aborted) throw new Error('A caixinha demorou demais e foi interrompida.')
  return out.trim()
}

/** Roda o fluxo: caixinhas em ordem, ramos em paralelo; cada uma espera todas as anteriores. */
export async function runFlow(flow: Flow, trigger: FlowRun['trigger']): Promise<string> {
  if (running.has(flow.id)) throw new Error('Este fluxo já está rodando.')
  const run: FlowRun = {
    id: randomUUID(),
    flowId: flow.id,
    trigger,
    status: 'running',
    startedAt: Date.now(),
    steps: []
  }

  let order: FlowNode[]
  let parents: Map<string, string[]>
  try {
    ;({ order, parents } = plan(flow))
  } catch (e) {
    publish({ ...run, status: 'error', finishedAt: Date.now(), steps: [{ nodeId: '', label: 'Fluxo', status: 'error', error: (e as Error).message }] })
    return run.id
  }
  if (!order.length) {
    publish({ ...run, status: 'error', finishedAt: Date.now(), steps: [{ nodeId: '', label: 'Fluxo', status: 'error', error: 'Ligue o gatilho a pelo menos uma caixinha.' }] })
    return run.id
  }

  run.steps = order.map((n): FlowRunStep => ({ nodeId: n.id, label: nodeLabel(n), status: 'pending' }))
  running.add(flow.id)
  publish(run)

  const step = (id: string) => run.steps.find((s) => s.nodeId === id)!
  const results = new Map<string, Promise<string | undefined>>()
  const exec = (node: FlowNode): Promise<string | undefined> => {
    if (!results.has(node.id)) {
      results.set(
        node.id,
        (async () => {
          const ps = (parents.get(node.id) ?? []).map((id) => flow.nodes.find((n) => n.id === id)!).filter((n) => n.type !== 'trigger')
          const inputs = await Promise.all(ps.filter((p) => order.includes(p)).map(exec))
          const s = step(node.id)
          if (inputs.some((i) => i === undefined)) {
            Object.assign(s, { status: 'skipped', error: 'Uma caixinha anterior falhou.' })
            publish(run)
            return undefined
          }
          Object.assign(s, { status: 'running', startedAt: Date.now() })
          publish(run)
          try {
            const output = await execute(run.id, flow, node, inputs as string[], (text) => {
              s.notices = [...(s.notices ?? []), text]
              publish(run)
            })
            Object.assign(s, { status: 'done', output, finishedAt: Date.now() })
            publish(run)
            return output
          } catch (e) {
            Object.assign(s, { status: 'error', error: (e as Error).message, finishedAt: Date.now() })
            publish(run)
            return undefined
          }
        })()
      )
    }
    return results.get(node.id)!
  }

  void Promise.all(order.map(exec)).finally(() => {
    running.delete(flow.id)
    run.status = run.steps.some((s) => s.status === 'error' || s.status === 'skipped') ? 'error' : 'done'
    run.finishedAt = Date.now()
    publish(run)
  })
  return run.id
}
