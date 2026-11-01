import { useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, CircleCheck, Clock, FolderOpen, GitFork, Hand, LoaderCircle, Play, Wand2 } from 'lucide-react'
import type { AutomationPlan, AvatarDef, ChatMessage, PlanStep } from '@shared/types'
import { PixelAvatar } from '@/components/PixelAvatar'
import { PROJECT_COLORS, ProjectTile } from '@/components/ProjectBadge'
import { Button } from '@/components/ui'
import { applyPlan } from '@/lib/applyPlan'
import { cn } from '@/lib/cn'
import { describeSchedule } from '@/lib/schedule'
import { useApp } from '@/state/app'

const MODEL_LABEL: Record<string, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'new' }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'new' ? 'bg-primary text-on-primary' : 'border border-line text-muted'
      )}
    >
      {children}
    </span>
  )
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-tile border border-line bg-card p-4', className)}>
      <p className="pb-3 text-[12px] font-medium text-muted">{title}</p>
      {children}
    </div>
  )
}

/** Uma etapa do fluxo como "pílula" na corrente do fluxo. */
function StepPill({ step, avatar, botName }: { step: PlanStep; avatar?: AvatarDef; botName?: string }) {
  const label =
    step.label || (step.type === 'bot' ? botName : step.type === 'prompt' ? 'Prompt' : step.type === 'confirm' ? 'Confirmação' : 'Decisão')
  return (
    <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-line bg-sidebar py-1 pr-3 pl-1.5 text-[12px]">
      {step.type === 'bot' ? (
        <span className="flex size-5 items-center justify-center">
          <PixelAvatar avatar={avatar} size={16} animated={false} />
        </span>
      ) : step.type === 'prompt' ? (
        <Wand2 size={13} className="ml-0.5 text-muted" />
      ) : step.type === 'confirm' ? (
        <Hand size={13} className="ml-0.5 text-warning" />
      ) : (
        <GitFork size={13} className="ml-0.5 text-muted" />
      )}
      <span className="truncate">{label}</span>
    </span>
  )
}

function PlanView({ plan, avatars }: { plan: AutomationPlan; avatars: Record<string, AvatarDef> }) {
  const app = useApp()
  const [openBot, setOpenBot] = useState<string>()
  const avatarOf = (ref: string) => {
    const b = plan.bots.find((x) => x.ref === ref)
    return b?.existingId ? app.getBot(b.existingId)?.avatar : avatars[ref]
  }
  const nameOf = (ref: string) => plan.bots.find((x) => x.ref === ref)?.name
  const project = plan.project
  const existingProject = project && 'existingId' in project ? app.getProject(project.existingId) : undefined

  return (
    <div className="grid gap-3">
      {project && (
        <Section title="Projeto">
          <div className="flex items-center gap-3">
            <ProjectTile project={{ color: existingProject?.color ?? PROJECT_COLORS[app.projects.length % PROJECT_COLORS.length] }} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{existingProject?.name ?? ('name' in project ? project.name : '')}</p>
              <p className="truncate text-[12px] text-muted">
                {existingProject?.description ?? ('description' in project ? project.description : '')}
              </p>
            </div>
            <Badge tone={existingProject ? 'muted' : 'new'}>{existingProject ? 'Já existe' : 'Novo'}</Badge>
          </div>
        </Section>
      )}

      {plan.bots.length > 0 && (
        <Section title={plural(plan.bots.length, 'Bot', 'Bots')}>
          <div className="space-y-3">
            {plan.bots.map((b) => (
              <div key={b.ref}>
                <div className="flex items-start gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-tile bg-sidebar">
                    <PixelAvatar avatar={avatarOf(b.ref)} size={36} mood="happy" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-semibold">{b.name}</p>
                      <Badge tone={b.existingId ? 'muted' : 'new'}>{b.existingId ? 'Reaproveitado' : 'Novo'}</Badge>
                      {b.model && <Badge>{MODEL_LABEL[b.model] ?? b.model}</Badge>}
                    </div>
                    <p className="text-[12px] leading-snug text-fg-2">{b.description}</p>
                    {b.why && <p className="mt-1 text-[12px] leading-snug text-muted">{b.why}</p>}
                    {!b.existingId && b.instructions && (
                      <button
                        onClick={() => setOpenBot(openBot === b.ref ? undefined : b.ref)}
                        className="mt-1 inline-flex items-center gap-1 text-[12px] text-fg-2 hover:text-fg"
                      >
                        {openBot === b.ref ? 'Esconder instruções' : 'Ver instruções'}
                        <ChevronDown size={12} className={cn('transition-transform', openBot === b.ref && 'rotate-180')} />
                      </button>
                    )}
                  </div>
                </div>
                {openBot === b.ref && (
                  <pre className="selectable mt-2 max-h-[220px] overflow-y-auto rounded-nav bg-sidebar p-3 font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-fg-2">
                    {b.instructions}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {plan.flows.length > 0 && (
        <Section title={plural(plan.flows.length, 'Fluxo', 'Fluxos')}>
          <div className="space-y-4">
            {plan.flows.map((f, i) => (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14px] font-semibold">{f.name}</p>
                  <Badge tone="new">Novo</Badge>
                </div>
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-fg-2">
                  <Clock size={12} className="text-muted" />
                  {f.schedule ? describeSchedule(f.schedule) : 'Quando você mandar rodar'}
                </p>
                {f.why && <p className="mt-1 text-[12px] leading-snug text-muted">{f.why}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-[12px] text-fg-2">
                    <Play size={11} /> Início
                  </span>
                  {f.steps.map((s, j) => (
                    <span key={j} className="inline-flex items-center gap-1.5">
                      <ArrowRight size={12} className="text-muted" />
                      <StepPill step={s} avatar={s.type === 'bot' ? avatarOf(s.bot) : undefined} botName={s.type === 'bot' ? nameOf(s.bot) : undefined} />
                      {(s.type === 'decision' || s.type === 'confirm') && <span className="text-[11px] text-muted">se “{s.options[0]}”</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {plan.setup.length > 0 && (
        <Section title="Antes de ligar">
          <ol className="space-y-2">
            {plan.setup.map((s, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-snug text-fg-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line text-[11px] text-muted">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  )
}

/**
 * Plano proposto pelo arquiteto, dentro da resposta: projeto, bots e fluxos, com "Criar tudo". Depois de criado,
 * mostra atalhos para abrir o que foi feito.
 */
export function PlanCard({ conversationId, msg }: { conversationId: string; msg: ChatMessage }) {
  const app = useApp()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string>()
  if (!msg.plan) return null
  const plan = msg.plan
  const applied = msg.planApplied

  const create = async () => {
    setCreating(true)
    setError(undefined)
    try {
      const result = await applyPlan(plan, msg.planAvatars ?? {}, app)
      app.markPlanApplied(conversationId, msg.id, result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-sidebar p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-muted">Plano do gBot</p>
          <h3 className="text-[18px] font-medium tracking-[-0.01em]">{plan.title}</h3>
          {plan.summary && <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{plan.summary}</p>}
        </div>
        {!applied && (
          <Button variant="primary" onClick={() => void create()} disabled={creating}>
            {creating ? <LoaderCircle size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {creating ? 'Criando…' : 'Criar tudo'}
          </Button>
        )}
      </div>

      {applied && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-tile border border-success/40 bg-success/10 px-4 py-3">
          <CircleCheck size={18} className="shrink-0 text-success" />
          <p className="min-w-0 flex-1 text-[13px] text-fg-2">
            Criado{applied.flowIds.length > 0 && '. Os fluxos ficam desligados até você fazer os passos de preparação e ligar'}.
          </p>
          {applied.flowIds[0] && (
            <Button className="h-8" onClick={() => app.openFlow(applied.flowIds[0])}>
              <Play size={13} /> Abrir fluxo
            </Button>
          )}
          {applied.projectId && (
            <Button className="h-8" onClick={() => app.openProject(applied.projectId!)}>
              <FolderOpen size={13} /> Abrir projeto
            </Button>
          )}
          {!applied.flowIds.length && applied.botIds[0] && (
            <Button className="h-8" onClick={() => app.newConversation(applied.botIds[0])}>
              Conversar com o bot
            </Button>
          )}
        </div>
      )}
      {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}

      <PlanView plan={plan} avatars={msg.planAvatars ?? {}} />
    </div>
  )
}
