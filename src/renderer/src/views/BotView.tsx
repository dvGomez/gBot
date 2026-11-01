import { ArrowLeft, MessageSquarePlus, Pencil, Trash2 } from 'lucide-react'
import { BotFiles } from '@/components/BotFiles'
import { BotTasks } from '@/components/BotTasks'
import { LimitsButton } from '@/components/LimitsButton'
import { ItemMenu } from '@/components/ItemMenu'
import { ConversationList } from '@/components/ConversationList'
import { MemoryPanel } from '@/components/MemoryPanel'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Button, Card } from '@/components/ui'
import { modelLabel } from '@/components/ModelSelect'
import { useApp } from '@/state/app'

/** Página de um bot: identidade, instruções e as conversas com ele. */
export function BotView() {
  const app = useApp()
  const bot = app.selectedBot
  if (!bot) return null
  const conversations = app.conversations.filter((c) => c.botId === bot.id)
  const project = app.getProject(bot.projectId)

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <button
        onClick={() => (project ? app.openProject(project.id) : app.setView('home'))}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
      >
        <ArrowLeft size={14} /> {project ? project.name : 'Início'}
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
            <p className="mt-2 text-[12px] text-muted">Modelo: {modelLabel(app.models, bot.model)}</p>
          )}
        </div>
        <div className="flex gap-2">
          <LimitsButton className="self-center" />
          <Button onClick={() => app.editBot(bot.id)}>
            <Pencil size={14} /> Editar
          </Button>
          <Button variant="primary" onClick={() => app.newConversation(bot.id)}>
            <MessageSquarePlus size={14} /> Nova conversa
          </Button>
          <ItemMenu
            className="self-center"
            actions={[
              {
                label: 'Excluir bot',
                icon: Trash2,
                danger: true,
                confirm: `Excluir ${bot.name} e as conversas dele? Não dá para desfazer.`,
                onSelect: () => void app.removeBot(bot.id)
              }
            ]}
          />
        </div>
      </div>

      <BotTasks botId={bot.id} botName={bot.name} />

      <div className="mt-8 grid grid-cols-[1fr_360px] gap-4">
        <Card className="p-5">
          <p className="pb-2 text-[13px] font-medium text-muted">Conversas com {bot.name}</p>
          <ConversationList items={conversations} empty="Nenhuma conversa ainda. Comece uma nova." />
        </Card>
        <div className="space-y-4 self-start">
          <Card className="p-5">
            <p className="pb-2 text-[13px] font-medium text-muted">Instruções</p>
            <p className="selectable text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{bot.instructions}</p>
          </Card>
          <Card className="p-5">
            <BotFiles key={bot.id} botId={bot.id} botName={bot.name} />
          </Card>
          <Card className="p-5">
            <MemoryPanel owner={{ kind: 'bot', id: bot.id }} />
          </Card>
        </div>
      </div>
    </div>
  )
}
