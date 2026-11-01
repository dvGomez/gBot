import type { AutomationPlan, AvatarDef, Bot, Flow, FlowEdge, FlowNode, PlanStep, Project } from '@shared/types'
import { PROJECT_COLORS } from '@/components/ProjectBadge'
import { generateAvatar } from '@/avatars/parts'
import { AVATARS } from '@/avatars/sprites'
import type { AppState } from '@/state/app'
import { uid } from './format'

/** Avatar para cada bot novo do plano: os prontos que ainda ninguém usa, depois avatares gerados. */
export function avatarsForPlan(plan: AutomationPlan, existing: Bot[]): Record<string, AvatarDef> {
  const used = new Set(existing.map((b) => b.avatar.id))
  const free = AVATARS.filter((a) => !used.has(a.id)).sort(() => Math.random() - 0.5)
  const out: Record<string, AvatarDef> = {}
  for (const b of plan.bots) if (!b.existingId) out[b.ref] = free.shift() ?? generateAvatar()
  return out
}

export interface AppliedPlan {
  projectId?: string
  /** Bots do plano (novos e reaproveitados), na ordem do plano. */
  botIds: string[]
  flowIds: string[]
}

const STEP_GAP = 320

/** Caixinha do fluxo para uma etapa do plano (caixinhas de modelo usam o último modelo escolhido). */
function stepNode(step: PlanStep, botId: (ref: string) => string | undefined, model: string | undefined, x: number): FlowNode {
  const base = { id: uid(), position: { x, y: 0 } }
  const label = step.label?.slice(0, 40) || undefined
  if (step.type === 'bot') return { ...base, type: 'bot', data: { label, botId: botId(step.bot), message: step.message } }
  if (step.type === 'prompt') return { ...base, type: 'prompt', data: { label, providerId: 'claude-code', model, message: step.message } }
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
 * Aplica o plano: cria o que é novo (fluxos novos nascem desligados, para o usuário revisar e ligar) e altera o que
 * já existe (projeto e bots com `edit`, fluxos com `existingId`, que são refeitos com as etapas do plano).
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

  const ids = new Map<string, string>()
  for (const b of plan.bots) {
    if (b.existingId) {
      ids.set(b.ref, b.existingId)
      const current = app.getBot(b.existingId)
      if (b.edit && current) {
        await app.saveBot({
          ...current,
          name: b.name || current.name,
          description: b.description || current.description,
          instructions: b.instructions.trim() || current.instructions,
          model: b.model ?? current.model,
          updatedAt: now
        })
      }
      continue
    }
    const bot: Bot = {
      id: uid(),
      name: b.name,
      avatar: avatars[b.ref] ?? generateAvatar(),
      description: b.description,
      instructions: b.instructions.trim() || b.description,
      model: b.model,
      projectId,
      createdAt: now,
      updatedAt: now
    }
    await app.saveBot(bot)
    ids.set(b.ref, bot.id)
  }

  const model = app.preferredModel('claude-code')
  const flowIds: string[] = []
  for (const f of plan.flows) {
    const trigger: FlowNode = { id: uid(), type: 'trigger', position: { x: 0, y: 0 }, data: { schedule: f.schedule } }
    const nodes: FlowNode[] = [trigger]
    const edges: FlowEdge[] = []
    f.steps.forEach((step, i) => {
      const prev = nodes[nodes.length - 1]
      const node = stepNode(step, (ref) => ids.get(ref), model, (i + 1) * STEP_GAP)
      // Depois de uma decisão ou confirmação, segue pela primeira opção (as outras encerram o fluxo).
      const handle = prev.type === 'decision' || prev.type === 'confirm' ? prev.data.options?.[0]?.id : undefined
      edges.push({ id: uid(), source: prev.id, target: node.id, ...(handle ? { sourceHandle: handle } : {}) })
      nodes.push(node)
    })
    // Fluxo existente: o mesmo fluxo refeito com as etapas do plano (continua ligado ou desligado como estava).
    const current = f.existingId ? app.flows.find((x) => x.id === f.existingId) : undefined
    const flow: Flow = current
      ? { ...current, name: f.name.slice(0, 60) || current.name, projectId: projectId ?? current.projectId, nodes, edges, updatedAt: now }
      : { id: uid(), name: f.name.slice(0, 60), enabled: false, projectId, nodes, edges, createdAt: now, updatedAt: now }
    await app.saveFlow(flow)
    flowIds.push(flow.id)
  }

  return { projectId, botIds: plan.bots.map((b) => ids.get(b.ref)!).filter(Boolean), flowIds }
}
