import { t as tr, useLanguage } from '@/i18n'
import { useState } from 'react'
import { ArrowLeft, GraduationCap, LoaderCircle, MessageSquarePlus, Pencil, Plus, Trash2, Workflow } from 'lucide-react'
import type { Bot, Flow, FlowRun } from '@shared/types'
import { BotTasks } from '@/components/BotTasks'
import { FilesPanel, useTouchedFiles } from '@/components/FilesPanel'
import { LimitsButton } from '@/components/LimitsButton'
import { ItemMenu } from '@/components/ItemMenu'
import { ConversationList } from '@/components/ConversationList'
import { MemoryPanel } from '@/components/MemoryPanel'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Button, Card, Toggle } from '@/components/ui'
import { modelLabel } from '@/components/ModelSelect'
import { timeAgo } from '@/lib/format'
import { describeSchedule } from '@/lib/schedule'
import { isLive, useFlowRuns } from '@/lib/useFlowRuns'
import { useApp } from '@/state/app'

/** Arquivos que o bot mexeu nas conversas, consultas e rotinas. */
function BotTouchedFiles({ botId }: { botId: string }) {
  useLanguage()
  const files = useTouchedFiles({ botId })
  return <FilesPanel files={files} empty={tr('Nenhum arquivo mexido por este bot ainda.')} />
}

/** Situação da última execução de uma rotina, em poucas palavras. */
function lastRunText(run?: FlowRun): { text: string; tone: string } {
  if (!run) return { text: tr('Ainda não rodou'), tone: 'text-muted' }
  if (isLive(run)) return { text: tr('Rodando agora'), tone: 'text-warning' }
  const when = timeAgo(run.finishedAt ?? run.startedAt)
  if (run.status === 'error') return { text: tr('Falhou {0}', when), tone: 'text-danger' }
  if (run.status === 'stopped') return { text: tr('Parada {0}', when), tone: 'text-muted' }
  return { text: tr('Rodou {0}', when), tone: 'text-muted' }
}

/** Rotinas do bot: agenda, se está ligada e como foi a última execução. */
function Routines({ bot, routines }: { bot: Bot; routines: Flow[] }) {
  useLanguage()
  const app = useApp()
  const runs = useFlowRuns(routines, 1)
  const [error, setError] = useState<string>()

  const setEnabled = async (flow: Flow, enabled: boolean) => {
    setError(undefined)
    try {
      await app.saveFlow({ ...flow, enabled, updatedAt: Date.now() })
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between pb-2">
        <p className="text-[13px] font-medium text-muted">{tr('Rotinas de ')}{bot.name}</p>
        <Button className="h-8" onClick={() => void app.newFlow(bot.id)}>
          <Plus size={14} />{tr(' Nova rotina')}</Button>
      </div>
      {routines.length ? (
        routines.map((f) => {
          const last = lastRunText(runs[f.id]?.[0])
          const live = runs[f.id]?.[0] && isLive(runs[f.id][0])
          const schedule = f.nodes.find((n) => n.type === 'trigger')?.data.schedule
          return (
            <div key={f.id} className="flex items-center gap-4 border-b border-line py-3 last:border-0">
              <span className="flex w-9 shrink-0 justify-center">
                {live ? (
                  <LoaderCircle size={18} className="animate-spin text-warning" />
                ) : (
                  <Workflow size={18} strokeWidth={1.7} className={f.enabled ? 'text-success' : 'text-muted'} />
                )}
              </span>
              <button onClick={() => app.openFlow(f.id)} className="min-w-0 flex-1 text-left hover:opacity-85">
                <span className="block truncate text-[14px] font-medium">{f.name}</span>
                <span className="block truncate text-[12px] text-muted">
                  {describeSchedule(schedule)} · <span className={last.tone}>{last.text}</span>
                </span>
              </button>
              <Toggle checked={f.enabled} onChange={(v) => void setEnabled(f, v)} label={tr('Rotina ligada')} />
            </div>
          )
        })
      ) : (
        <p className="py-2 text-[13px] text-muted">
          {tr('Nenhuma rotina ainda. Crie uma para o bot trabalhar sozinho, num horário ou de tempos em tempos.')}
        </p>
      )}
      {error && <p className="pt-2 text-[12px] text-danger">{error}</p>}
    </Card>
  )
}

/** Página de um bot: identidade, rotinas, especializações, conversas e memória. */
export function BotView() {
  useLanguage()
  const app = useApp()
  const bot = app.selectedBot
  if (!bot) return null
  const conversations = app.conversations.filter((c) => c.botId === bot.id)
  const routines = app.flows.filter((f) => f.botId === bot.id)
  const specializations = bot.specializationIds.map((id) => app.getSpecialization(id)).filter((sp) => !!sp)
  const project = app.getProject(bot.projectId)

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <button
        onClick={() => (project ? app.openProject(project.id) : app.setView('home'))}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
      >
        <ArrowLeft size={14} /> {project ? project.name : tr('Início')}
      </button>

      <div className="flex items-center gap-6">
        <div className="flex size-[120px] shrink-0 items-center justify-center rounded-card bg-sidebar">
          <PixelAvatar avatar={bot.avatar} size={84} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium tracking-[0.02em] text-muted">
            Bot
            {project && (
              <>
                {' · '}
                <button onClick={() => app.openProject(project.id)} className="hover:text-fg hover:underline">
                  {project.name}
                </button>
              </>
            )}
          </p>
          <h1 className="mt-1 text-[36px] leading-tight font-medium tracking-[-0.03em]">{bot.name}</h1>
          {bot.description && <p className="mt-1 text-[15px] text-muted">{bot.description}</p>}
          {app.models.length > 0 && (
            <p className="mt-2 text-[12px] text-muted">{tr('Modelo: ')}{modelLabel(app.providers.find((p) => p.id === (bot.providerId ?? 'claude-code'))?.models ?? [], bot.model)}</p>
          )}
        </div>
        <div className="flex gap-2">
          <LimitsButton className="self-center" />
          <Button onClick={() => app.editBot(bot.id)}>
            <Pencil size={14} />{tr(' Editar')}</Button>
          <Button variant="primary" onClick={() => app.newConversation(bot.id)}>
            <MessageSquarePlus size={14} />{tr(' Nova conversa')}</Button>
          <ItemMenu
            className="self-center"
            actions={[
              {
                label: tr('Excluir bot'),
                icon: Trash2,
                danger: true,
                confirm: tr('Excluir {0} com as rotinas e as conversas dele? Não dá para desfazer.', bot.name),
                onSelect: () => void app.removeBot(bot.id)
              }
            ]}
          />
        </div>
      </div>

      <BotTasks botId={bot.id} botName={bot.name} />

      <div className="mt-8 grid grid-cols-[1fr_360px] gap-4">
        <div className="space-y-4 self-start">
          <Routines bot={bot} routines={routines} />
          <Card className="p-5">
            <p className="pb-2 text-[13px] font-medium text-muted">{tr('Conversas com ')}{bot.name}</p>
            <ConversationList items={conversations} empty={tr('Nenhuma conversa ainda. Comece uma nova.')} />
          </Card>
        </div>
        <div className="space-y-4 self-start">
          <Card className="p-5">
            <div className="flex items-center justify-between pb-2">
              <p className="text-[13px] font-medium text-muted">{tr('Especializações')}</p>
              <button onClick={() => app.editBot(bot.id)} className="text-[12px] text-muted hover:text-fg">
                {tr('Escolher')}
              </button>
            </div>
            {specializations.length ? (
              <div className="space-y-1">
                {specializations.map((sp) => (
                  <button
                    key={sp.id}
                    onClick={() => app.editSpecialization(sp.id)}
                    className="flex w-full items-start gap-2.5 rounded-nav px-1.5 py-1.5 text-left hover:bg-hover"
                  >
                    <GraduationCap size={15} className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{sp.name}</span>
                      {sp.description && <span className="block truncate text-[12px] text-muted">{sp.description}</span>}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">{tr('Nenhuma especialização. Em Editar, escolha o que este bot sabe fazer.')}</p>
            )}
          </Card>
          {bot.instructions.trim() && (
            <Card className="p-5">
              <p className="pb-2 text-[13px] font-medium text-muted">{tr('Personalidade e orientações')}</p>
              <p className="selectable text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{bot.instructions}</p>
            </Card>
          )}
          <Card className="p-5">
            <p className="pb-2 text-[13px] font-medium text-muted">{tr('Arquivos mexidos')}</p>
            <BotTouchedFiles botId={bot.id} />
          </Card>
          <Card className="p-5">
            <MemoryPanel owner={{ kind: 'bot', id: bot.id }} />
          </Card>
        </div>
      </div>
    </div>
  )
}
