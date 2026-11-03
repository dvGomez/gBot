import { t as tr, useLanguage } from '@/i18n'
import { useEffect } from 'react'
import { Maximize2, MessageCircle, Plus, X } from 'lucide-react'
import type { Bot } from '@shared/types'
import { PixelAvatar } from '@/components/PixelAvatar'
import { cn } from '@/lib/cn'
import { useApp } from '@/state/app'
import { ChatThread } from '@/views/ChatView'

/**
 * Chat flutuante da página do bot: um balão "Chat" no canto de baixo que abre a conversa com o bot por cima do canvas.
 * Dá para conversar, perguntar sobre o que as rotinas fizeram e pedir mudanças no fluxo (o bot propõe um plano e você
 * aplica no cartão, como no arquiteto da página inicial).
 */
export function BotChatDock({ bot, open, onOpenChange }: { bot: Bot; open: boolean; onOpenChange(open: boolean): void }) {
  useLanguage()
  const app = useApp()
  const conversations = app.conversations.filter((c) => c.botId === bot.id)
  const current = app.activeConversation?.botId === bot.id ? app.activeConversation : undefined
  // Rascunho de conversa nova com este bot (ainda sem mensagens).
  const drafting = !app.activeConversation && app.activeBot?.id === bot.id

  // Ao abrir, continua a conversa mais recente com o bot (ou começa uma nova).
  useEffect(() => {
    if (!open || current || drafting) return
    if (conversations[0]) app.openConversation(conversations[0].id, { inPlace: true })
    else app.newConversation(bot.id, undefined, { inPlace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bot.id])

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        className="absolute right-6 bottom-6 z-30 flex items-center gap-2 rounded-full bg-primary py-2.5 pr-4 pl-3 text-[14px] font-medium text-on-primary shadow-lg transition-transform hover:scale-[1.03]"
      >
        <MessageCircle size={18} />
        {tr('Chat')}
      </button>
    )
  }

  return (
    <div className="absolute right-6 bottom-6 z-30 flex h-[min(680px,calc(100%-48px))] w-[440px] flex-col overflow-hidden rounded-card border border-line bg-page shadow-2xl">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <PixelAvatar avatar={bot.avatar} mood={app.busy && current ? app.mood : 'idle'} size={28} animated={app.busy && !!current} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{bot.name}</p>
          <select
            value={current?.id ?? ''}
            onChange={(e) =>
              e.target.value ? app.openConversation(e.target.value, { inPlace: true }) : app.newConversation(bot.id, undefined, { inPlace: true })
            }
            disabled={app.busy}
            aria-label={tr('Conversa')}
            className="max-w-full truncate bg-transparent text-[12px] text-muted outline-none"
          >
            <option value="">{tr('Nova conversa')}</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => app.newConversation(bot.id, undefined, { inPlace: true })}
          disabled={app.busy}
          title={tr('Nova conversa')}
          aria-label={tr('Nova conversa')}
          className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg disabled:opacity-40"
        >
          <Plus size={16} />
        </button>
        {current && (
          <button
            onClick={() => app.openConversation(current.id)}
            title={tr('Abrir em tela cheia')}
            aria-label={tr('Abrir em tela cheia')}
            className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg"
          >
            <Maximize2 size={15} />
          </button>
        )}
        <button
          onClick={() => onOpenChange(false)}
          title={tr('Fechar chat')}
          aria-label={tr('Fechar chat')}
          className={cn('rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg')}
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatThread
          compact
          emptyHint={tr('Pergunte o que quiser, inclusive sobre o que as rotinas encontraram, ou peça mudanças no fluxo: {0} propõe e você aplica.', bot.name)}
        />
      </div>
    </div>
  )
}
