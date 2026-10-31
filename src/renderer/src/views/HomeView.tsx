import type { ReactNode } from 'react'
import { ChevronRight, Monitor, Plug, Plus, Smile } from 'lucide-react'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Composer } from '@/components/Composer'
import { Card, IconTile } from '@/components/ui'
import { getAvatar } from '@/avatars/sprites'
import { greeting, longDate, shortTime } from '@/lib/format'
import { useApp } from '@/state/app'

function QuickCard({
  icon,
  title,
  subtitle,
  primary,
  onClick
}: {
  icon: ReactNode
  title: string
  subtitle: string
  primary?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex items-center gap-4 rounded-card border border-line bg-card p-4 text-left transition-colors hover:bg-hover disabled:cursor-default disabled:hover:bg-card"
    >
      <IconTile primary={primary}>{icon}</IconTile>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold tracking-[-0.005em]">{title}</p>
        <p className="truncate text-[12px] text-muted">{subtitle}</p>
      </div>
    </button>
  )
}

export function HomeView() {
  const app = useApp()
  const avatar = getAvatar(app.avatarId)

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-[12px] font-medium tracking-[0.02em] text-muted">{longDate()}</p>
          <h1 className="mt-2 text-[36px] leading-tight font-medium tracking-[-0.03em]">{greeting()}</h1>
          <p className="mt-2 text-[15px] text-muted">Sou o {avatar.name}. Como posso ajudar hoje?</p>
        </div>
        <button onClick={() => app.setView('avatars')} title="Trocar avatar" className="rounded-tile p-1 hover:bg-hover">
          <PixelAvatar avatarId={app.avatarId} mood={app.mood} size={84} />
        </button>
      </div>

      <div className="mt-8">
        <Composer autoFocus />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <QuickCard primary icon={<Plus size={18} />} title="Nova conversa" subtitle="Comece do zero" onClick={app.newConversation} />
        <QuickCard icon={<Smile size={18} strokeWidth={1.6} />} title="Avatares" subtitle="Escolha seu assistente" onClick={() => app.setView('avatars')} />
        <QuickCard icon={<Plug size={18} strokeWidth={1.6} />} title="Provedores" subtitle="Claude Code e outros" onClick={() => app.setView('providers')} />
        <QuickCard icon={<Monitor size={18} strokeWidth={1.6} />} title="Ações no computador" subtitle="Em breve" />
      </div>

      {app.conversations.length > 0 && (
        <Card className="mt-6 p-5">
          <p className="pb-2 text-[13px] font-medium text-muted">Conversas recentes</p>
          {app.conversations.slice(0, 6).map((c) => (
            <button
              key={c.id}
              onClick={() => app.openConversation(c.id)}
              className="flex w-full items-center gap-4 border-b border-line py-3 text-left last:border-0 hover:opacity-80"
            >
              <div className="flex w-12 shrink-0 flex-col items-center rounded-nav border border-line py-1">
                <span className="text-[13px] font-semibold">{shortTime(c.createdAt)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{c.title}</p>
                <p className="text-[12px] text-muted">{c.messages.length} mensagens</p>
              </div>
              <ChevronRight size={16} className="text-muted" />
            </button>
          ))}
        </Card>
      )}
    </div>
  )
}
