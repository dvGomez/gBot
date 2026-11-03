import type { AutomationPlan, AvatarDef, Bot, Flow, FlowEdge, FlowNode, PlanStep, Project, Specialization } from '@shared/types'
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
  /** Rotinas criadas ou refeitas, na ordem do plano. */
  flowIds: string[]
}

const STEP_GAP = 320

/** Caixinha da rotina para uma etapa do plano (a decisão usa o último modelo escolhido, senão um rápido). */
function stepNode(step: PlanStep, specializationId: (ref: string) => string | undefined, model: string | undefined, x: number): FlowNode {
  const base = { id: uid(), position: { x, y: 0 } }
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

/**
 * Aplica o plano: cria o que é novo (rotinas novas nascem desligadas, para o usuário revisar e ligar) e altera o que
 * já existe (projeto, especializações e bots com `edit`, rotinas com `existingId`, que são refeitas com as etapas do
 * plano). Os bots reaproveitados ganham as especializações do plano, sem perder as que já tinham.
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

    // Rotinas do bot: o gatilho e as etapas, ligadas em sequência.
    for (const r of b.routines) {
      const trigger: FlowNode = { id: uid(), type: 'trigger', position: { x: 0, y: 0 }, data: { schedule: r.schedule } }
      const nodes: FlowNode[] = [trigger]
      const edges: FlowEdge[] = []
      r.steps.forEach((step, i) => {
        const prev = nodes[nodes.length - 1]
        const node = stepNode(step, (ref) => specIds.get(ref), model, (i + 1) * STEP_GAP)
        // Depois de uma decisão ou confirmação, segue pela primeira opção (as outras encerram a rotina).
        const handle = prev.type === 'decision' || prev.type === 'confirm' ? prev.data.options?.[0]?.id : undefined
        edges.push({ id: uid(), source: prev.id, target: node.id, ...(handle ? { sourceHandle: handle } : {}) })
        nodes.push(node)
      })
      // Rotina existente: a mesma rotina refeita com as etapas do plano (continua ligada ou desligada como estava).
      const existing = r.existingId ? app.flows.find((x) => x.id === r.existingId) : undefined
      const flow: Flow = existing
        ? { ...existing, botId, name: r.name.slice(0, 60) || existing.name, nodes, edges, updatedAt: now }
        : { id: uid(), botId, name: r.name.slice(0, 60), enabled: false, nodes, edges, createdAt: now, updatedAt: now }
      await app.saveFlow(flow)
      flowIds.push(flow.id)
    }
  }

  return { projectId, specializationIds: plan.specializations.map((s) => specIds.get(s.ref)!).filter(Boolean), botIds, flowIds }
}
