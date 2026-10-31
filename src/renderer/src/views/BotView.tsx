import { ArrowLeft, MessageSquarePlus, Pencil } from 'lucide-react'
import { ConversationList } from '@/components/ConversationList'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Button, Card } from '@/components/ui'
import { useApp } from '@/state/app'

/** Página de um bot: identidade, instruções e as conversas com ele. */
export function BotView() {
  const app = useApp()
  const bot = app.selectedBot
  if (!bot) return null
  const conversations = app.conversations.filter((c) => c.botId === bot.id)

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <button onClick={() => app.setView('home')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft size={14} /> Início
      </button>

      <div className="flex items-center gap-6">
        <div className="flex size-[120px] shrink-0 items-center justify-center rounded-card bg-sidebar">
          <PixelAvatar avatar={bot.avatar} size={84} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium tracking-[0.02em] text-muted">Bot</p>
          <h1 className="mt-1 text-[36px] leading-tight font-medium tracking-[-0.03em]">{bot.name}</h1>
          {bot.description && <p className="mt-1 text-[15px] text-muted">{bot.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => app.editBot(bot.id)}>
            <Pencil size={14} /> Editar
          </Button>
          <Button variant="primary" onClick={() => app.newConversation(bot.id)}>
            <MessageSquarePlus size={14} /> Nova conversa
          </Button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-[1fr_360px] gap-4">
        <Card className="p-5">
          <p className="pb-2 text-[13px] font-medium text-muted">Conversas com {bot.name}</p>
          <ConversationList items={conversations} empty="Nenhuma conversa ainda. Comece uma nova." />
        </Card>
        <Card className="self-start p-5">
          <p className="pb-2 text-[13px] font-medium text-muted">Instruções</p>
          <p className="selectable text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{bot.instructions}</p>
        </Card>
      </div>
    </div>
  )
}
