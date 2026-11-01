import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import type { ChatEvent, ChatFile, Flow, FlowEdge, FlowNode, FlowRun, FlowRunStep, SendMessageRequest, TokenUsage } from '@shared/types'
import { addUsage } from '@shared/usage'
import { askOnce } from '../providers/claude-code/oneShot'
import { killSessions, stableUuid } from '../providers/claude-code/sessions'
import { runAsBot, waitNotice } from '../botQueue'
import { requestConfirmation } from '../confirmations'
import { getProvider } from '../providers/registry'
import { getBot } from '../store'
import { listFlows, listRuns, saveRun } from './store'

/** Tempo máximo de uma caixinha. */
const STEP_TIMEOUT_MS = 15 * 60_000

/**
 * Fluxos em execução (um fluxo não roda duas vezes ao mesmo tempo), com o que é preciso para parar tudo na hora:
 * o sinal que cancela as caixinhas e as sessões do Claude Code abertas por elas.
 */
const running = new Map<string, { run: FlowRun; controller: AbortController; sessions: Set<string> }>()

export const isFlowRunning = (flowId: string) => running.has(flowId)

/** A stopped app cannot resume its old processes; don't leave those flows locked after restarting. */
export function recoverInterruptedFlows() {
  for (const flow of listFlows()) {
    if (isFlowRunning(flow.id)) continue
    for (const run of listRuns(flow.id)) {
      if (run.status !== 'running') continue
      run.status = 'stopped'
      run.finishedAt = Date.now()
      for (const step of run.steps) {
        if (step.status === 'running' || step.status === 'pending' || step.status === 'waiting') {
          Object.assign(step, { status: 'stopped', error: 'Execução interrompida ao encerrar o app.', finishedAt: run.finishedAt })
        }
      }
      saveRun(run)
    }
  }
}

/** O que uma caixinha precisa para poder ser parada: o sinal e onde registrar as sessões que abrir. */
interface StopContext {
  signal: AbortSignal
  track(sessionKey: string): void
}

const STOPPED = 'Parado por você.'

/**
 * Para o fluxo na hora: cancela o que estiver rodando (sessões, processos do Codex, decisões, filas de bots,
 * confirmações pendentes) e marca a execução como parada, sem esperar ninguém terminar.
 */
export function stopFlow(flowId: string) {
  const active = running.get(flowId)
  if (!active) return
  running.delete(flowId)
  active.controller.abort()
  for (const key of active.sessions) killSessions(key)
  const now = Date.now()
  for (const s of active.run.steps) {
    if (s.status === 'running' || s.status === 'waiting' || s.status === 'pending') Object.assign(s, { status: 'stopped', error: STOPPED, finishedAt: now })
  }
  active.run.status = 'stopped'
  active.run.finishedAt = now
  publish(active.run)
}

function publish(run: FlowRun) {
  saveRun(run)
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('flows:run-update', run)
}

export function nodeLabel(node: FlowNode): string {
  if (node.data.label?.trim()) return node.data.label.trim()
  if (node.type === 'bot') return getBot(node.data.botId ?? '')?.name ?? 'Bot'
  if (node.type === 'prompt') return 'Prompt'
  if (node.type === 'decision') return 'Decisão'
  if (node.type === 'confirm') return 'Confirmação'
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

/** Uma etapa já feita nesta execução, para as próximas caixinhas não perderem o fio. */
interface TrailStep {
  nodeId: string
  label: string
  /** O que foi pedido à caixinha. */
  ask?: string
  output?: string
  /** Na decisão: a opção escolhida. */
  chosen?: string
}

const clip = (text: string, max: number) => {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** Junta os caminhos que chegam numa caixinha, sem repetir etapas (ramos que se reencontram). */
function mergeTrails(trails: TrailStep[][]): TrailStep[] {
  const seen = new Set<string>()
  return trails.flat().filter((t) => !seen.has(t.nodeId) && seen.add(t.nodeId))
}

/**
 * Contexto da execução: o que cada etapa anterior do caminho recebeu de pedido e entregou, resumido. Assim uma
 * caixinha lá no fim ainda sabe o objetivo e os detalhes ditos no começo (para quem é, qual contato…).
 * Resultados que já chegam inteiros (das caixinhas imediatamente anteriores) não se repetem aqui.
 */
function runContext(trail: TrailStep[], parentIds: Set<string>): string {
  if (!trail.length) return ''
  // Em fluxos longos fica o começo (onde costuma estar o objetivo) e o fim (o mais recente).
  const steps = trail.length > 12 ? [...trail.slice(0, 3), ...trail.slice(-9)] : trail
  const lines = steps.map((t, i) => {
    if (t.chosen) return `${i + 1}. ${t.label}: escolheu "${clip(t.chosen, 200)}"`
    const ask = t.ask ? ` pediu "${clip(t.ask, 400)}"` : ''
    const out = parentIds.has(t.nodeId) ? ' → (resultado logo abaixo)' : t.output ? ` → ${clip(t.output, 600)}` : ''
    return `${i + 1}. ${t.label}:${ask}${out}`
  })
  return [
    '<contexto_da_execucao>',
    'O que já aconteceu nesta execução, em ordem. Use para manter o objetivo e os detalhes (para quem é, contatos, nomes, valores):',
    ...lines,
    '</contexto_da_execucao>'
  ].join('\n')
}

/** Monta o texto da caixinha: o contexto da execução + o que o usuário escreveu + o resultado das anteriores. */
function compose(flow: Flow, node: FlowNode, inputs: string[], context: string): string {
  const prev = inputs.length === 1 ? inputs[0] : inputs.map((t, i) => `Resultado ${i + 1}:\n${t}`).join('\n\n')
  let text = (node.data.message ?? '').trim()
  if (text.includes('{{anterior}}')) text = text.replaceAll('{{anterior}}', prev)
  else if (prev) text = `${text}\n\n<resultado_anterior>\n${prev}\n</resultado_anterior>`.trim()
  if (!text) throw new Error('A caixinha está sem mensagem.')
  return [
    `[Etapa do fluxo automático "${flow.name}" no gBot. Ninguém está acompanhando em tempo real: entregue o resultado direto, sem fazer perguntas.]`,
    ...(context ? [context] : []),
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
  onUsage: (usage: TokenUsage) => void,
  context: string,
  stop: StopContext,
  textOverride?: string
): Promise<{ text: string; files: ChatFile[] }> {
  const text = textOverride ?? compose(flow, node, inputs, context)
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
  stop.track(base.conversationId)
  let out = ''
  let files: ChatFile[] = []
  let error: string | undefined
  const collect = (ev: ChatEvent) => {
    if (stop.signal.aborted) return
    if (ev.type === 'delta') out += ev.text
    if (ev.type === 'files') files = ev.files
    if (ev.type === 'error') error = ev.message
    if (ev.type === 'notice') onNotice(ev.text)
    if (ev.type === 'usage') onUsage(ev.usage)
  }
  // O limite de tempo só começa quando a caixinha começa de fato (depois da fila do bot, se houver).
  const run = async (stop: AbortSignal) => {
    stop.throwIfAborted()
    const timeout = AbortSignal.timeout(STEP_TIMEOUT_MS)
    await provider.send(req, collect, AbortSignal.any([stop, timeout]))
    if (error) throw new Error(error)
    if (timeout.aborted) throw new Error('A caixinha demorou demais e foi interrompida.')
    if (stop.aborted) throw new Error(flowStop.aborted ? STOPPED : 'A tarefa foi cancelada na página do bot.')
  }
  const flowStop = stop.signal
  const bot = req.bot
  if (bot) {
    await runAsBot(
      bot.id,
      { label: `Fluxo "${flow.name}" · ${nodeLabel(node)}`, origin: 'flow', originId: flow.id },
      flowStop,
      run,
      (ahead) => onNotice(waitNotice(bot.name, ahead))
    )
  } else {
    await run(flowStop)
  }
  return { text: out.trim(), files }
}

/** Junta os resultados que chegam numa caixinha. */
const joinInputs = (inputs: string[]) =>
  inputs.length === 1 ? inputs[0] : inputs.map((t, i) => `Resultado ${i + 1}:\n${t}`).join('\n\n')

/**
 * Caixinha de decisão: um modelo lê o resultado anterior e escolhe uma das opções (responde só o número).
 * O resultado anterior passa adiante sem mudar, para o ramo escolhido continuar dali.
 * No Claude Code a escolha é uma pergunta avulsa, sem ferramentas e no Haiku (se outro modelo não for escolhido):
 * responder um número não precisa de uma sessão inteira.
 */
async function decide(
  runId: string,
  flow: Flow,
  node: FlowNode,
  inputs: string[],
  onNotice: (text: string) => void,
  onUsage: (usage: TokenUsage) => void,
  context: string,
  stop: StopContext
): Promise<{ optionId: string; label: string }> {
  const options = (node.data.options ?? []).filter((o) => o.label.trim())
  if (options.length < 2) throw new Error('A decisão precisa de pelo menos duas opções.')
  const prompt = [
    `[Decisão no fluxo automático "${flow.name}" do gBot. Ninguém está acompanhando em tempo real.]`,
    'Leia o resultado anterior e escolha a opção que melhor descreve a situação. Não use ferramentas.',
    context,
    inputs.length ? `<resultado_anterior>\n${joinInputs(inputs)}\n</resultado_anterior>` : '(sem resultado anterior)',
    node.data.message?.trim() ? `Critério: ${node.data.message.trim()}` : '',
    'Opções:',
    ...options.map((o, i) => `${i + 1}. ${o.label.trim()}`),
    'Responda apenas com o número da opção escolhida.'
  ]
    .filter(Boolean)
    .join('\n')
  const providerId = node.data.providerId ?? 'claude-code'
  let answer: string
  if (providerId === 'claude-code') {
    const res = await askOnce(prompt, node.data.model ?? 'haiku', { kind: 'flow', flowId: flow.id }, STEP_TIMEOUT_MS, undefined, stop.signal)
    onUsage(res.usage)
    answer = res.text
  } else {
    answer = (await execute(runId, flow, node, inputs, onNotice, onUsage, context, stop, prompt)).text
  }
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
  const controller = new AbortController()
  const sessions = new Set<string>()
  running.set(flow.id, { run, controller, sessions })
  const stop: StopContext = { signal: controller.signal, track: (key) => sessions.add(key) }
  const stopped = () => controller.signal.aborted
  // Depois de parar, nada mais muda a execução: o "parado" já foi gravado por stopFlow.
  const pub = () => {
    if (!stopped()) publish(run)
  }
  pub()

  const step = (id: string) => run.steps.find((s) => s.nodeId === id)!
  const byId = (id: string) => flow.nodes.find((n) => n.id === id)!

  // Resultado de cada caixinha: ok (com saída e, na decisão e na confirmação, a opção escolhida), pulada ou falhou.
  // `trail`: as etapas do caminho até aqui (inclusive esta), para o contexto das próximas.
  // `files`: arquivos criados no caminho, para a confirmação mostrar ao usuário.
  type Result =
    | { kind: 'ok'; output: string; chosen?: string; trail: TrailStep[]; files: ChatFile[] }
    | { kind: 'skip' }
    | { kind: 'fail' }
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
              if (parent.type === 'trigger') return { kind: 'ok', output: '', trail: [], files: [] }
              if (!order.includes(parent)) return { kind: 'skip' }
              const r = await exec(parent)
              const branches = parent.type === 'decision' || parent.type === 'confirm'
              if (r.kind === 'ok' && branches && e.sourceHandle !== r.chosen) return { kind: 'skip' }
              return r
            })
          )
          const s = step(node.id)
          if (stopped()) return { kind: 'fail' }
          if (arriving.some((r) => r.kind === 'fail')) {
            Object.assign(s, { status: 'skipped', error: 'Uma caixinha anterior falhou.' })
            pub()
            return { kind: 'fail' }
          }
          const ok = arriving.filter((r): r is Extract<Result, { kind: 'ok' }> => r.kind === 'ok')
          if (!ok.length) {
            Object.assign(s, { status: 'skipped', error: 'Caminho não escolhido pela decisão.' })
            pub()
            return { kind: 'skip' }
          }
          const inputs = ok.map((r) => r.output).filter(Boolean)
          const trail = mergeTrails(ok.map((r) => r.trail))
          const seenFiles = new Set<string>()
          const files = ok.flatMap((r) => r.files).filter((f) => !seenFiles.has(f.path) && seenFiles.add(f.path))
          const parentIds = new Set((incoming.get(node.id) ?? []).map((e) => e.source))
          const context = runContext(trail, parentIds)
          const label = nodeLabel(node)

          Object.assign(s, { status: 'running', startedAt: Date.now() })
          pub()
          const onNotice = (text: string) => {
            if (stopped()) return
            s.notices = [...(s.notices ?? []), text]
            pub()
          }
          const onUsage = (usage: TokenUsage) => {
            if (stopped()) return
            s.usage = addUsage(s.usage, usage)
          }
          try {
            if (node.type === 'decision') {
              const choice = await decide(run.id, flow, node, inputs, onNotice, onUsage, context, stop)
              if (stopped()) return { kind: 'fail' }
              Object.assign(s, { status: 'done', chosen: choice.label, finishedAt: Date.now() })
              pub()
              const own = { nodeId: node.id, label, chosen: choice.label }
              return { kind: 'ok', output: joinInputs(inputs), chosen: choice.optionId, trail: [...trail, own], files }
            }
            if (node.type === 'confirm') {
              // Pausa até o usuário escolher (pela notificação ou pelas pendências do app). O resultado anterior segue
              // adiante, com a escolha e o comentário dele para as próximas caixinhas.
              const options = (node.data.options ?? []).filter((o) => o.label.trim())
              if (!options.length) throw new Error('A confirmação precisa de pelo menos uma opção.')
              Object.assign(s, { status: 'waiting' })
              pub()
              const { option, note } = await requestConfirmation({
                flowId: flow.id,
                flowName: flow.name,
                runId: run.id,
                nodeId: node.id,
                title: label,
                message: node.data.message?.trim() ?? '',
                detail: joinInputs(inputs) || undefined,
                files,
                options
              }, controller.signal)
              if (stopped()) return { kind: 'fail' }
              Object.assign(s, { status: 'done', chosen: option.label.trim(), note, finishedAt: Date.now() })
              pub()
              const decided = `[Decisão do usuário: ${option.label.trim()}${note ? ` · Comentário: ${note}` : ''}]`
              const own = { nodeId: node.id, label, chosen: `${option.label.trim()}${note ? ` (comentário: ${note})` : ''}` }
              return {
                kind: 'ok',
                output: [joinInputs(inputs), decided].filter(Boolean).join('\n\n'),
                chosen: option.id,
                trail: [...trail, own],
                files
              }
            }
            const { text: output, files: made } = await execute(run.id, flow, node, inputs, onNotice, onUsage, context, stop)
            if (stopped()) return { kind: 'fail' }
            Object.assign(s, { status: 'done', output, ...(made.length ? { files: made } : {}), finishedAt: Date.now() })
            pub()
            const own = { nodeId: node.id, label, ask: node.data.message, output }
            return { kind: 'ok', output, trail: [...trail, own], files: [...files, ...made.filter((f) => !seenFiles.has(f.path))] }
          } catch (e) {
            if (stopped()) return { kind: 'fail' }
            Object.assign(s, { status: 'error', error: (e as Error).message, finishedAt: Date.now() })
            pub()
            return { kind: 'fail' }
          }
        })()
      )
    }
    return results.get(node.id)!
  }

  void Promise.all(order.map(exec)).finally(() => {
    if (stopped()) return
    running.delete(flow.id)
    // Caixinha pulada porque a decisão escolheu outro caminho não é erro.
    run.status = run.steps.some((s) => s.status === 'error') ? 'error' : 'done'
    run.finishedAt = Date.now()
    pub()
  })
  return run.id
}
