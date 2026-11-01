import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import type { ChatEvent, Flow, FlowEdge, FlowNode, FlowRun, FlowRunStep, SendMessageRequest } from '@shared/types'
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
  if (node.type === 'decision') return 'Decisão'
  return 'Gatilho'
}

/** Caixinhas alcançáveis a partir do gatilho, em ordem; erro se houver ciclo. */
function plan(flow: Flow): { order: FlowNode[]; incoming: Map<string, FlowEdge[]> } {
  const parents = new Map<string, string[]>()
  const incoming = new Map<string, FlowEdge[]>()
  const children = new Map<string, string[]>()
  for (const e of flow.edges) {
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e])
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
  return { order, incoming }
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
  onNotice: (text: string) => void,
  textOverride?: string
): Promise<string> {
  const text = textOverride ?? compose(flow, node, inputs)
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
    // Caixinha de prompt (e de decisão) aprende na memória do próprio fluxo; caixinha de bot, na memória do bot.
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

/** Junta os resultados que chegam numa caixinha. */
const joinInputs = (inputs: string[]) =>
  inputs.length === 1 ? inputs[0] : inputs.map((t, i) => `Resultado ${i + 1}:\n${t}`).join('\n\n')

/**
 * Caixinha de decisão: um modelo lê o resultado anterior e escolhe uma das opções (responde só o número).
 * O resultado anterior passa adiante sem mudar, para o ramo escolhido continuar dali.
 */
async function decide(
  runId: string,
  flow: Flow,
  node: FlowNode,
  inputs: string[],
  onNotice: (text: string) => void
): Promise<{ optionId: string; label: string }> {
  const options = (node.data.options ?? []).filter((o) => o.label.trim())
  if (options.length < 2) throw new Error('A decisão precisa de pelo menos duas opções.')
  const prompt = [
    `[Decisão no fluxo automático "${flow.name}" do gBot. Ninguém está acompanhando em tempo real.]`,
    'Leia o resultado anterior e escolha a opção que melhor descreve a situação. Não use ferramentas.',
    inputs.length ? `<resultado_anterior>\n${joinInputs(inputs)}\n</resultado_anterior>` : '(sem resultado anterior)',
    node.data.message?.trim() ? `Critério: ${node.data.message.trim()}` : '',
    'Opções:',
    ...options.map((o, i) => `${i + 1}. ${o.label.trim()}`),
    'Responda apenas com o número da opção escolhida.'
  ]
    .filter(Boolean)
    .join('\n')
  const answer = await execute(runId, flow, node, inputs, onNotice, prompt)
  const n = Number(answer.match(/\d+/)?.[0])
  const chosen = options[n - 1]
  if (!chosen) throw new Error(`Não consegui entender a escolha ("${answer.slice(0, 60)}").`)
  return { optionId: chosen.id, label: chosen.label.trim() }
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
  let incoming: Map<string, FlowEdge[]>
  try {
    ;({ order, incoming } = plan(flow))
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
  const byId = (id: string) => flow.nodes.find((n) => n.id === id)!

  // Resultado de cada caixinha: ok (com saída e, na decisão, a opção escolhida), pulada ou falhou.
  type Result = { kind: 'ok'; output: string; chosen?: string } | { kind: 'skip' } | { kind: 'fail' }
  const results = new Map<string, Promise<Result>>()

  const exec = (node: FlowNode): Promise<Result> => {
    if (!results.has(node.id)) {
      results.set(
        node.id,
        (async (): Promise<Result> => {
          // Cada ligação que chega: do gatilho (sem saída), de uma caixinha ok, pulada ou que falhou.
          // Ligação de decisão só conta se for a da opção escolhida.
          const arriving = await Promise.all(
            (incoming.get(node.id) ?? []).map(async (e): Promise<Result> => {
              const parent = byId(e.source)
              if (!parent) return { kind: 'skip' }
              if (parent.type === 'trigger') return { kind: 'ok', output: '' }
              if (!order.includes(parent)) return { kind: 'skip' }
              const r = await exec(parent)
              if (r.kind === 'ok' && parent.type === 'decision' && e.sourceHandle !== r.chosen) return { kind: 'skip' }
              return r
            })
          )
          const s = step(node.id)
          if (arriving.some((r) => r.kind === 'fail')) {
            Object.assign(s, { status: 'skipped', error: 'Uma caixinha anterior falhou.' })
            publish(run)
            return { kind: 'fail' }
          }
          const ok = arriving.filter((r): r is Extract<Result, { kind: 'ok' }> => r.kind === 'ok')
          if (!ok.length) {
            Object.assign(s, { status: 'skipped', error: 'Caminho não escolhido pela decisão.' })
            publish(run)
            return { kind: 'skip' }
          }
          const inputs = ok.map((r) => r.output).filter(Boolean)

          Object.assign(s, { status: 'running', startedAt: Date.now() })
          publish(run)
          const onNotice = (text: string) => {
            s.notices = [...(s.notices ?? []), text]
            publish(run)
          }
          try {
            if (node.type === 'decision') {
              const { optionId, label } = await decide(run.id, flow, node, inputs, onNotice)
              Object.assign(s, { status: 'done', chosen: label, finishedAt: Date.now() })
              publish(run)
              return { kind: 'ok', output: joinInputs(inputs), chosen: optionId }
            }
            const output = await execute(run.id, flow, node, inputs, onNotice)
            Object.assign(s, { status: 'done', output, finishedAt: Date.now() })
            publish(run)
            return { kind: 'ok', output }
          } catch (e) {
            Object.assign(s, { status: 'error', error: (e as Error).message, finishedAt: Date.now() })
            publish(run)
            return { kind: 'fail' }
          }
        })()
      )
    }
    return results.get(node.id)!
  }

  void Promise.all(order.map(exec)).finally(() => {
    running.delete(flow.id)
    // Caixinha pulada porque a decisão escolheu outro caminho não é erro.
    run.status = run.steps.some((s) => s.status === 'error') ? 'error' : 'done'
    run.finishedAt = Date.now()
    publish(run)
  })
  return run.id
}
