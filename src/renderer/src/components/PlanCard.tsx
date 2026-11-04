import { t as tr, useLanguage } from '@/i18n'
import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  FlaskConical,
  FolderOpen,
  GitFork,
  GraduationCap,
  Hand,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Play,
  Send,
  TriangleAlert,
  Wand2
} from 'lucide-react'
import type { AutomationPlan, AvatarDef, ChatMessage, PlanStep, PlanSuggestion } from '@shared/types'
import { PixelAvatar } from '@/components/PixelAvatar'
import { PROJECT_COLORS, ProjectTile } from '@/components/ProjectBadge'
import { Button } from '@/components/ui'
import { applyPlan } from '@/lib/applyPlan'
import { cn } from '@/lib/cn'
import { describeSchedule } from '@/lib/schedule'
import { useApp } from '@/state/app'

const MODEL_LABEL: Record<string, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Plano de uma versão anterior do gBot (com fluxos soltos em vez de rotinas dos bots): só dá para ler. */
const isLegacy = (plan: AutomationPlan) => !Array.isArray(plan.specializations) || plan.bots.some((b) => !Array.isArray(b.routines))

function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'new' | 'edit' }) {
  useLanguage()
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'new' ? 'bg-primary text-on-primary' : tone === 'edit' ? 'border border-warning/60 text-warning' : 'border border-line text-muted'
      )}
    >
      {children}
    </span>
  )
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  useLanguage()
  return (
    <div className={cn('rounded-tile border border-line bg-card p-4', className)}>
      <p className="pb-3 text-[12px] font-medium text-muted">{title}</p>
      {children}
    </div>
  )
}

/** "Ver instruções": abre as instruções propostas logo abaixo. */
function Instructions({ text }: { text: string }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null
  return (
    <>
      <button onClick={() => setOpen(!open)} className="mt-1 inline-flex items-center gap-1 text-[12px] text-fg-2 hover:text-fg">
        {open ? tr('Esconder instruções') : tr('Ver instruções')}
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <pre className="selectable mt-2 max-h-[220px] overflow-y-auto rounded-nav bg-sidebar p-3 font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-fg-2">
          {text}
        </pre>
      )}
    </>
  )
}

/** Uma etapa da rotina como "pílula" na corrente da rotina. */
function StepPill({ step, specializationName }: { step: PlanStep; specializationName?: string }) {
  useLanguage()
  const label =
    step.label || (step.type === 'task' ? specializationName || tr('Tarefa') : step.type === 'confirm' ? tr('Confirmação') : tr('Decisão'))
  return (
    <span
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-line bg-sidebar py-1 pr-3 pl-1.5 text-[12px]"
      title={step.type === 'task' && specializationName ? tr('Com a especialização {0}', specializationName) : undefined}
    >
      {step.type === 'task' ? (
        specializationName ? (
          <GraduationCap size={13} className="ml-0.5 text-muted" />
        ) : (
          <ListChecks size={13} className="ml-0.5 text-muted" />
        )
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
  useLanguage()
  const app = useApp()
  // Nome de uma especialização do plano (ou de uma existente citada pelo id).
  const specName = (ref: string) => {
    const s = plan.specializations.find((x) => x.ref === ref)
    return s ? s.name || app.getSpecialization(s.existingId)?.name || ref : (app.getSpecialization(ref)?.name ?? ref)
  }
  const project = plan.project
  const existingProject = project && 'existingId' in project ? app.getProject(project.existingId) : undefined
  const projectEdit = project && 'existingId' in project && project.edit ? project : undefined

  return (
    <div className="grid gap-3">
      {!!plan.attention?.length && (
        <Section title={tr('Pontos de atenção')} className="border-warning/40">
          <ul className="space-y-2">
            {plan.attention.map((a, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-fg-2">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" />
                {a}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {project && (
        <Section title={tr('Projeto')}>
          <div className="flex items-center gap-3">
            <ProjectTile project={{ color: existingProject?.color ?? PROJECT_COLORS[app.projects.length % PROJECT_COLORS.length] }} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">
                {projectEdit?.name || existingProject?.name || ('name' in project ? project.name : '')}
              </p>
              <p className="truncate text-[12px] text-muted">
                {projectEdit?.description ?? existingProject?.description ?? ('description' in project ? project.description : '')}
              </p>
            </div>
            <Badge tone={projectEdit ? 'edit' : existingProject ? 'muted' : 'new'}>
              {projectEdit ? tr('Alterado') : existingProject ? tr('Já existe') : tr('Novo')}
            </Badge>
          </div>
        </Section>
      )}

      {plan.specializations.length > 0 && (
        <Section title={plural(plan.specializations.length, tr('Especialização'), tr('Especializações'))}>
          <div className="space-y-3">
            {plan.specializations.map((s) => (
              <div key={s.ref} className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-sidebar text-muted">
                  <GraduationCap size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-semibold">{specName(s.ref)}</p>
                    <Badge tone={s.edit ? 'edit' : s.existingId ? 'muted' : 'new'}>
                      {s.edit ? tr('Editada') : s.existingId ? tr('Reaproveitada') : tr('Nova')}
                    </Badge>
                  </div>
                  {s.description && <p className="text-[12px] leading-snug text-fg-2">{s.description}</p>}
                  {s.why && <p className="mt-1 text-[12px] leading-snug text-muted">{s.why}</p>}
                  {(!s.existingId || s.edit) && <Instructions text={s.instructions} />}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {plan.bots.length > 0 && (
        <Section title={plural(plan.bots.length, 'Bot', 'Bots')}>
          <div className="space-y-5">
            {plan.bots.map((b) => (
              <div key={b.ref}>
                <div className="flex items-start gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-tile bg-sidebar">
                    <PixelAvatar avatar={b.existingId ? app.getBot(b.existingId)?.avatar : avatars[b.ref]} size={36} mood="happy" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-semibold">{b.name}</p>
                      <Badge tone={b.edit ? 'edit' : b.existingId ? 'muted' : 'new'}>
                        {b.edit ? tr('Alterado') : b.existingId ? tr('Reaproveitado') : tr('Novo')}
                      </Badge>
                      {b.model && <Badge>{MODEL_LABEL[b.model] ?? b.model}</Badge>}
                    </div>
                    <p className="text-[12px] leading-snug text-fg-2">{b.description}</p>
                    {b.specializations.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {b.specializations.map((ref) => (
                          <span key={ref} className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-[11.5px] text-fg-2">
                            <GraduationCap size={11} className="text-muted" />
                            {specName(ref)}
                          </span>
                        ))}
                      </div>
                    )}
                    {b.why && <p className="mt-1 text-[12px] leading-snug text-muted">{b.why}</p>}
                    {(!b.existingId || b.edit) && <Instructions text={b.instructions} />}
                  </div>
                </div>

                {/* Rotinas do bot, com a agenda e a corrente de etapas. */}
                {b.routines.length > 0 && (
                  <div className="mt-3 ml-[60px] space-y-3 border-l border-line pl-4">
                    {b.routines.map((r, i) => (
                      <div key={r.existingId ?? i}>
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-semibold">{r.name}</p>
                          <Badge tone={r.existingId ? 'edit' : 'new'}>{r.existingId ? tr('Alterada') : tr('Nova')}</Badge>
                        </div>
                        <p className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-fg-2">
                          <Clock size={12} className="text-muted" />
                          {r.schedule ? describeSchedule(r.schedule) : tr('Quando você mandar rodar')}
                        </p>
                        {r.why && <p className="mt-1 text-[12px] leading-snug text-muted">{r.why}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-[12px] text-fg-2">
                            <Play size={11} />{tr(' Início')}</span>
                          {r.steps.map((s, j) => (
                            <span key={j} className="inline-flex items-center gap-1.5">
                              <ArrowRight size={12} className="text-muted" />
                              <StepPill step={s} specializationName={s.type === 'task' && s.specialization ? specName(s.specialization) : undefined} />
                              {(s.type === 'decision' || s.type === 'confirm') && <span className="text-[11px] text-muted">{tr('se “')}{s.options[0]}”</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {plan.setup.length > 0 && (
        <Section title={tr('Antes de ligar')}>
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

      {!!plan.tested?.length && (
        <Section title={tr('O que foi testado')}>
          <ul className="space-y-2">
            {plan.tested.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-fg-2">
                <FlaskConical size={14} className="mt-0.5 shrink-0 text-muted" />
                {t}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

/**
 * Melhorias opcionais que o arquiteto sugeriu e que ficaram fora do plano: o usuário marca as que quer e pede para
 * incluir; o arquiteto refaz o plano (ou, depois de aplicado, propõe as mudanças).
 */
function Suggestions({ suggestions, applied }: { suggestions: PlanSuggestion[]; applied: boolean }) {
  useLanguage()
  const app = useApp()
  const [picked, setPicked] = useState<number[]>([])
  const [sent, setSent] = useState(false)
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))
  const request = () => {
    const chosen = [...picked].sort((a, b) => a - b).map((i) => suggestions[i])
    const intro = applied ? tr('Quero também estas melhorias:') : tr('Inclua no plano estas sugestões:')
    app.send([intro, ...chosen.map((x) => `- ${x.title}${x.detail ? `: ${x.detail}` : ''}`)].join('\n'))
    setSent(true)
  }
  return (
    <Section title={tr('Sugestões (fora do plano)')} className="mt-3">
      <div className="space-y-1">
        {suggestions.map((x, i) => {
          const on = picked.includes(i)
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              disabled={sent}
              aria-pressed={on}
              className="flex w-full items-start gap-3 rounded-tile px-2 py-2 text-left hover:bg-hover disabled:hover:bg-transparent"
            >
              <span
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                  on ? 'border-primary bg-primary text-on-primary' : 'border-line'
                )}
              >
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Lightbulb size={13} className="text-muted" />
                  {x.title}
                </span>
                {x.detail && <span className="block text-[12px] leading-snug text-muted">{x.detail}</span>}
              </span>
            </button>
          )
        })}
      </div>
      {sent ? (
        <p className="mt-2 px-2 text-[12px] text-muted">{tr('Pedido enviado na conversa.')}</p>
      ) : (
        picked.length > 0 && (
          <Button className="mt-2 h-8" onClick={request} disabled={app.busy}>
            <Send size={13} />
            {applied ? tr(' Pedir as melhorias ({0})', picked.length) : tr(' Incluir no plano ({0})', picked.length)}
          </Button>
        )
      )}
    </Section>
  )
}

/**
 * Plano proposto pelo arquiteto, dentro da resposta: projeto, especializações e bots com as rotinas deles, com
 * "Criar tudo". Depois de criado, mostra atalhos para abrir o que foi feito.
 */
export function PlanCard({ conversationId, msg }: { conversationId: string; msg: ChatMessage }) {
  useLanguage()
  const app = useApp()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string>()
  if (!msg.plan) return null
  const plan = msg.plan
  const applied = msg.planApplied

  if (isLegacy(plan)) {
    return (
      <div className="mt-4 rounded-card border border-line bg-sidebar p-4">
        <p className="text-[12px] font-medium text-muted">{tr('Plano do gBot')}</p>
        <h3 className="text-[18px] font-medium tracking-[-0.01em]">{plan.title}</h3>
        {plan.summary && <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{plan.summary}</p>}
        <p className="mt-3 text-[12px] text-muted">
          {tr('Este plano é de uma versão anterior do gBot, com fluxos em vez de rotinas dos bots. Peça um plano novo para aplicar.')}
        </p>
      </div>
    )
  }

  const routines = plan.bots.flatMap((b) => b.routines)
  // O botão diz o que vai acontecer: criar, alterar ou os dois.
  const edits =
    plan.specializations.some((s) => s.edit) ||
    plan.bots.some((b) => b.edit) ||
    routines.some((r) => r.existingId) ||
    (!!plan.project && 'existingId' in plan.project && !!plan.project.edit)
  const news =
    plan.specializations.some((s) => !s.existingId) ||
    plan.bots.some((b) => !b.existingId) ||
    routines.some((r) => !r.existingId) ||
    (!!plan.project && !('existingId' in plan.project))
  const action = edits ? (news ? tr('Aplicar tudo') : tr('Aplicar alterações')) : tr('Criar tudo')
  const newRoutines = routines.some((r) => !r.existingId)
  const routinesBot = applied?.flowIds?.[0] ? app.flows.find((f) => f.id === applied.flowIds[0])?.botId : undefined

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
          <p className="text-[12px] font-medium text-muted">{tr('Plano do gBot')}</p>
          <h3 className="text-[18px] font-medium tracking-[-0.01em]">{plan.title}</h3>
          {plan.summary && <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{plan.summary}</p>}
        </div>
        {!applied && (
          <Button variant="primary" onClick={() => void create()} disabled={creating}>
            {creating ? <LoaderCircle size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {creating ? tr('Aplicando…') : action}
          </Button>
        )}
      </div>

      {applied && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-tile border border-success/40 bg-success/10 px-4 py-3">
          <CircleCheck size={18} className="shrink-0 text-success" />
          <p className="min-w-0 flex-1 text-[13px] text-fg-2">
            {edits && !news ? tr('Alterações aplicadas') : tr('Pronto')}
            {newRoutines && tr('. As rotinas novas ficam desligadas até você fazer os passos de preparação e ligar')}.
          </p>
          {applied.botIds?.[0] && app.getBot(applied.botIds[0]) && (
            <Button className="h-8" onClick={() => app.openBot(applied.botIds[0])}>
              {tr('Abrir bot')}
            </Button>
          )}
          {/* As rotinas ficam na página do bot: só vale o atalho se for de outro bot que não o do "Abrir bot". */}
          {applied.flowIds?.[0] && routinesBot && routinesBot !== applied.botIds?.[0] && (
            <Button className="h-8" onClick={() => app.openFlow(applied.flowIds[0])}>
              <Play size={13} />{tr(' Abrir rotina')}</Button>
          )}
          {applied.projectId && (
            <Button className="h-8" onClick={() => app.openProject(applied.projectId!)}>
              <FolderOpen size={13} />{tr(' Abrir projeto')}</Button>
          )}
        </div>
      )}
      {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}

      <PlanView plan={plan} avatars={msg.planAvatars ?? {}} />
      {!!plan.suggestions?.length && <Suggestions suggestions={plan.suggestions} applied={!!applied} />}
    </div>
  )
}
