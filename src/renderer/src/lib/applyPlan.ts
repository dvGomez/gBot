import type { AutomationPlan, AvatarDef, Bot, Flow, FlowEdge, FlowNode, PlanRoutine, PlanStep, Project, Specialization } from '@shared/types'
import { reachableFrom, triggersOf } from '@shared/flows'
import { PROJECT_COLORS } from '@/components/ProjectBadge'
import { generateAvatar } from '@/avatars/parts'
import { AVATARS } from '@/avatars/sprites'
import type { AppState } from '@/state/app'
import { uid } from './format'

/** `count` avatares sorteados: os prontos que ainda ninguém usa, depois avatares gerados. */
export function freeAvatars(existing: Bot[], count: number): AvatarDef[] {
  const used = new Set(existing.map((b) => b.avatar?.id))
  const free = AVATARS.filter((a) => !used.has(a.id)).sort(() => Math.random() - 0.5)
  return Array.from({ length: count }, () => free.shift() ?? generateAvatar())
}

/** Avatar para cada bot novo do plano. */
export function avatarsForPlan(plan: AutomationPlan, existing: Bot[]): Record<string, AvatarDef> {
  const fresh = plan.bots.filter((b) => !b.existingId)
  const avatars = freeAvatars(existing, fresh.length)
  return Object.fromEntries(fresh.map((b, i) => [b.ref, avatars[i]]))
}

export interface AppliedPlan {
  projectId?: string
  /** Especializações do plano (novas e reaproveitadas), na ordem do plano. */
  specializationIds: string[]
  /** Bots do plano (novos e reaproveitados), na ordem do plano. */
  botIds: string[]
  /** Fluxos dos bots que ganharam rotinas criadas ou refeitas, na ordem do plano. */
  flowIds: string[]
}

const STEP_GAP = 320
/** Distância vertical entre as faixas (gatilho + etapas) de cada rotina no canvas. */
const LANE_GAP = 360

/** Caixinha da rotina para uma etapa do plano (a decisão usa o último modelo escolhido, senão um rápido). */
function stepNode(step: PlanStep, specializationId: (ref: string) => string | undefined, model: string | undefined, x: number, y: number): FlowNode {
  const base = { id: uid(), position: { x, y } }
  const label = step.label?.slice(0, 40) || undefined
  if (step.type === 'task') {
    const sp = step.specialization ? specializationId(step.specialization) : undefined
    return { ...base, type: 'task', data: { label, ...(sp ? { specializationId: sp } : {}), message: step.message } }
  }
  if (step.type === 'confirm') {
    return { ...base, type: 'confirm', data: { label, message: step.message, options: step.options.map((o) => ({ id: uid(), label: o })) } }
  }
  return {
    ...base,
    type: 'decision',
    data: {
      label,
      providerId: 'claude-code',
      model: model ?? 'haiku',
      message: step.message,
      options: step.options.map((o) => ({ id: uid(), label: o }))
    }
  }
}

/** Gatilho do jeito que o bot novo ganha: sem nome, desligado e com a agenda padrão (ou sem agenda). */
function isFreshTrigger(t: FlowNode): boolean {
  const s = t.data.schedule
  const defaultSchedule = !s || (s.mode === 'times' && s.days.join() === '1,2,3,4,5' && s.times.join() === '09:00')
  return !t.data.label?.trim() && !t.data.enabled && defaultSchedule
}

/**
 * Coloca uma rotina do plano no fluxo do bot, como uma faixa: o gatilho e as etapas ligadas em sequência, da esquerda
 * para a direita. Com `existingId` (um gatilho do fluxo), tira as caixinhas que só esse gatilho alcança e refaz a faixa
 * no mesmo lugar (mesmo gatilho, continua ligado ou desligado como estava). Senão, cria uma faixa nova abaixo de tudo,
 * desligada; o gatilho vazio de um bot recém-criado é aproveitado para a primeira rotina.
 */
function placeRoutine(flow: Flow, r: PlanRoutine, specializationId: (ref: string) => string | undefined, model: string | undefined): Flow {
  const triggers = triggersOf(flow)
  let trigger = r.existingId ? triggers.find((t) => t.id === r.existingId) : undefined
  let nodes = flow.nodes
  let edges = flow.edges
  if (trigger) {
    // Caixinhas que outros gatilhos também alcançam ficam (são de outras rotinas).
    const shared = new Set(triggers.filter((t) => t.id !== trigger!.id).flatMap((t) => [...reachableFrom(flow, t.id)]))
    const drop = new Set([...reachableFrom(flow, trigger.id)].filter((id) => !shared.has(id)))
    const triggerId = trigger.id
    nodes = nodes.filter((n) => !drop.has(n.id))
    edges = edges.filter((e) => e.source !== triggerId && !drop.has(e.source) && !drop.has(e.target))
  } else if (triggers.length === 1 && flow.nodes.length === 1 && !flow.edges.length && isFreshTrigger(triggers[0])) {
    trigger = triggers[0]
  } else {
    const y = flow.nodes.length ? Math.max(...flow.nodes.map((n) => n.position.y)) + LANE_GAP : 0
    const x = triggers.length ? Math.min(...triggers.map((t) => t.position.x)) : 0
    trigger = { id: uid(), type: 'trigger', position: { x, y }, data: { enabled: false } }
    nodes = [...nodes, trigger]
  }

  const lane: FlowNode = { ...trigger, data: { ...trigger.data, label: r.name.slice(0, 60) || trigger.data.label, schedule: r.schedule } }
  const { x, y } = lane.position
  const added: FlowNode[] = []
  const newEdges: FlowEdge[] = []
  let prev = lane
  r.steps.forEach((step, i) => {
    const node = stepNode(step, specializationId, model, x + (i + 1) * STEP_GAP, y)
    // Depois de uma decisão ou confirmação, segue pela primeira opção (as outras encerram a rotina).
    const handle = prev.type === 'decision' || prev.type === 'confirm' ? prev.data.options?.[0]?.id : undefined
    newEdges.push({ id: uid(), source: prev.id, target: node.id, ...(handle ? { sourceHandle: handle } : {}) })
    added.push(node)
    prev = node
  })
  return {
    ...flow,
    nodes: [...nodes.map((n) => (n.id === lane.id ? lane : n)), ...added],
    edges: [...edges, ...newEdges]
  }
}

/**
 * Aplica o plano: cria o que é novo (rotinas novas nascem desligadas, para o usuário revisar e ligar) e altera o que
 * já existe (projeto, especializações e bots com `edit`, rotinas com `existingId`, que são refeitas com as etapas do
 * plano). Os bots reaproveitados ganham as especializações do plano, sem perder as que já tinham. Cada rotina vira um
 * gatilho (com as etapas) no fluxo do bot.
 */
export async function applyPlan(plan: AutomationPlan, avatars: Record<string, AvatarDef>, app: AppState): Promise<AppliedPlan> {
  const now = Date.now()

  let projectId: string | undefined
  if (plan.project && 'existingId' in plan.project) {
    const p = plan.project
    projectId = p.existingId
    const current = app.getProject(p.existingId)
    if (p.edit && current) {
      await app.saveProject({
        ...current,
        name: p.name?.slice(0, 60) || current.name,
        description: p.description ?? current.description,
        instructions: p.instructions ?? current.instructions,
        updatedAt: now
      })
    }
  } else if (plan.project) {
    const project: Project = {
      id: uid(),
      name: plan.project.name.slice(0, 60),
      description: plan.project.description,
      instructions: plan.project.instructions,
      color: PROJECT_COLORS[app.projects.length % PROJECT_COLORS.length],
      createdAt: now,
      updatedAt: now
    }
    await app.saveProject(project)
    projectId = project.id
  }

  // Especializações: as novas entram no projeto; as existentes só mudam com `edit`.
  const specIds = new Map<string, string>()
  for (const s of plan.specializations) {
    if (s.existingId) {
      specIds.set(s.ref, s.existingId)
      const current = app.getSpecialization(s.existingId)
      if (s.edit && current) {
        await app.saveSpecialization({
          ...current,
          name: s.name.slice(0, 60) || current.name,
          description: s.description || current.description,
          instructions: s.instructions.trim() || current.instructions,
          updatedAt: now
        })
      }
      continue
    }
    const sp: Specialization = {
      id: uid(),
      name: s.name.slice(0, 60),
      description: s.description,
      instructions: s.instructions.trim() || s.description,
      projectId,
      createdAt: now,
      updatedAt: now
    }
    await app.saveSpecialization(sp)
    specIds.set(s.ref, sp.id)
  }
  const specsOf = (refs: string[]) => refs.map((r) => specIds.get(r)).filter((id): id is string => !!id)

  const model = app.preferredModel('claude-code')
  const botIds: string[] = []
  const flowIds: string[] = []
  for (const b of plan.bots) {
    let botId: string
    const current = b.existingId ? app.getBot(b.existingId) : undefined
    if (b.existingId) {
      botId = b.existingId
      if (current) {
        // Soma as especializações do plano às que o bot já usa (sem repetir).
        const specializationIds = [...new Set([...current.specializationIds, ...specsOf(b.specializations)])]
        const edited = b.edit
          ? {
              name: b.name || current.name,
              description: b.description || current.description,
              instructions: b.instructions.trim() || current.instructions,
              model: b.model ?? current.model
            }
          : {}
        const changed = b.edit || specializationIds.length !== current.specializationIds.length
        if (changed) await app.saveBot({ ...current, ...edited, specializationIds, updatedAt: now })
      }
    } else {
      const bot: Bot = {
        id: uid(),
        name: b.name,
        avatar: avatars[b.ref] ?? generateAvatar(),
        description: b.description,
        instructions: b.instructions.trim(),
        specializationIds: [...new Set(specsOf(b.specializations))],
        model: b.model,
        projectId,
        createdAt: now,
        updatedAt: now
      }
      await app.saveBot(bot)
      botId = bot.id
    }
    botIds.push(botId)

    // Rotinas do bot: cada uma vira uma faixa (gatilho + etapas) no fluxo dele.
    if (!b.routines.length) continue
    // Bot novo ganha o fluxo no processo principal; o `app` daqui é de antes de salvar, então busca de novo.
    let flow: Flow =
      (current ? app.botFlow(botId) : (await window.gbot.flows.list()).find((f) => f.botId === botId)) ??
      { id: uid(), botId, nodes: [], edges: [], createdAt: now, updatedAt: now }
    for (const r of b.routines) flow = placeRoutine(flow, r, (ref) => specIds.get(ref), model)
    await app.saveFlow({ ...flow, updatedAt: now })
    if (!flowIds.includes(flow.id)) flowIds.push(flow.id)
  }

  return { projectId, specializationIds: plan.specializations.map((s) => specIds.get(s.ref)!).filter(Boolean), botIds, flowIds }
}
