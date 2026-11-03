import { t as tr, useLanguage } from '@/i18n'
import { useState } from 'react'
import { ArrowLeft, GraduationCap, MessageSquarePlus, Pencil, Trash2 } from 'lucide-react'
import { triggersOf } from '@shared/flows'
import { BotChatDock } from '@/components/BotChatDock'
import { BotTasks } from '@/components/BotTasks'
import { FlowCanvas } from '@/components/flow/FlowCanvas'
import { LimitsButton } from '@/components/LimitsButton'
import { ItemMenu } from '@/components/ItemMenu'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Button } from '@/components/ui'
import { modelLabel } from '@/components/ModelSelect'
import { useApp } from '@/state/app'

/**
 * Página de um bot: um painel compacto com quem ele é (especializações, modelo, rotinas) e, logo abaixo, o canvas do
 * fluxo dele (execuções, arquivos e memória no painel lateral). A conversa com o bot fica no chat flutuante.
 */
export function BotView() {
  useLanguage()
  const app = useApp()
  const bot = app.selectedBot
  const [chatOpen, setChatOpen] = useState(false)
  if (!bot) return null
  const flow = app.botFlow(bot.id)
  const specializations = bot.specializationIds.map((id) => app.getSpecialization(id)).filter((sp) => !!sp)
  const project = app.getProject(bot.projectId)
  const routines = flow ? triggersOf(flow) : []
  const on = routines.filter((t) => t.data.enabled && t.data.schedule).length

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-5 px-6 pb-4">
        <button
          onClick={() => (project ? app.openProject(project.id) : app.setView('home'))}
          className="self-start rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg"
          aria-label={project ? project.name : tr('Início')}
          title={project ? project.name : tr('Início')}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex size-[64px] shrink-0 items-center justify-center rounded-card bg-sidebar">
          <PixelAvatar avatar={bot.avatar} size={44} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-[24px] leading-tight font-medium tracking-[-0.02em]">{bot.name}</h1>
            <p className="shrink-0 text-[12px] text-muted">
              {project && (
                <>
                  <button onClick={() => app.openProject(project.id)} className="hover:text-fg hover:underline">
                    {project.name}
                  </button>
                  {' · '}
                </>
              )}
              {tr('{0} rotinas · {1} ligadas', routines.length, on)}
              {app.models.length > 0 &&
                ` · ${modelLabel(app.providers.find((p) => p.id === (bot.providerId ?? 'claude-code'))?.models ?? [], bot.model)}`}
            </p>
          </div>
          {bot.description && <p className="truncate text-[14px] text-muted">{bot.description}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {specializations.map((sp) => (
              <button
                key={sp.id}
                onClick={() => app.editSpecialization(sp.id)}
                title={sp.description}
                className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[12px] text-fg-2 hover:bg-hover"
              >
                <GraduationCap size={12} className="text-muted" />
                {sp.name}
              </button>
            ))}
            <button onClick={() => app.editBot(bot.id)} className="px-1 text-[12px] text-muted hover:text-fg">
              {specializations.length ? tr('Escolher') : tr('Escolher especializações')}
            </button>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <LimitsButton className="self-center" />
          <Button onClick={() => app.editBot(bot.id)}>
            <Pencil size={14} />{tr(' Editar')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              app.newConversation(bot.id, undefined, { inPlace: true })
              setChatOpen(true)
            }}
          >
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

      <div className="px-6 [&>*]:mt-0 [&>*]:mb-4">
        <BotTasks botId={bot.id} botName={bot.name} />
      </div>

      <div className="relative min-h-0 flex-1 border-t border-line">
        {flow ? <FlowCanvas key={flow.id} flow={flow} /> : <p className="p-6 text-[13px] text-muted">{tr('Carregando o fluxo…')}</p>}
        <BotChatDock key={bot.id} bot={bot} open={chatOpen} onOpenChange={setChatOpen} />
      </div>
    </div>
  )
}
