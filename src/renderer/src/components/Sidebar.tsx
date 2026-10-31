import type { ComponentType, ReactNode } from 'react'
import { Bot as BotIcon, House, MessageSquarePlus, MessageSquareText, Plug, Plus, Settings, Smile } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useApp, type View } from '@/state/app'
import { PixelAvatar } from './PixelAvatar'
import { StatusDot } from './ui'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="px-3 pb-1.5 text-[12px] font-medium text-muted">{title}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

function NavItem({
  icon: Icon,
  leading,
  label,
  active,
  onClick
}: {
  icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  leading?: ReactNode
  label: string
  active?: boolean
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-9 w-full items-center gap-3 rounded-nav px-3 text-left text-[14px] transition-colors',
        active ? 'bg-nav-active font-medium text-fg' : 'text-fg-2 hover:bg-hover'
      )}
    >
      {leading ?? (Icon && <Icon size={17} strokeWidth={1.6} className="shrink-0" />)}
      <span className="truncate">{label}</span>
    </button>
  )
}

export function Sidebar() {
  const app = useApp()
  const isMac = window.gbot.platform === 'darwin'
  const provider = app.providers.find((p) => p.id === app.providerId)
  const go = (v: View) => () => app.setView(v)
  const chatActive = (id: string) => app.view === 'chat' && app.activeConversation?.id === id
  const plainConversations = app.conversations.filter((c) => !c.botId).slice(0, 6)

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className={cn('drag flex h-14 items-center gap-2.5', isMac ? 'pl-[88px]' : 'pl-5')}>
        <PixelAvatar avatarId={app.avatarId} size={20} animated={false} />
        <span className="text-[15px] font-medium tracking-[-0.015em]">gBot</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <Section title="Conversas">
          <NavItem icon={House} label="Início" active={app.view === 'home'} onClick={go('home')} />
          <NavItem icon={MessageSquarePlus} label="Nova conversa" onClick={() => app.newConversation()} />
          {plainConversations.map((c) => (
            <NavItem
              key={c.id}
              icon={MessageSquareText}
              label={c.title}
              active={chatActive(c.id)}
              onClick={() => app.openConversation(c.id)}
            />
          ))}
        </Section>

        <Section title="Bots">
          {app.bots.map((b) => (
            <NavItem
              key={b.id}
              leading={<PixelAvatar avatar={b.avatar} size={17} animated={false} className="shrink-0" />}
              label={b.name}
              active={
                ((app.view === 'bot' || app.view === 'bot-editor') && app.selectedBot?.id === b.id) ||
                (app.view === 'chat' && app.activeBot?.id === b.id)
              }
              onClick={() => app.openBot(b.id)}
            />
          ))}
          <NavItem
            icon={app.bots.length ? Plus : BotIcon}
            label="Novo bot"
            active={app.view === 'bot-editor' && !app.selectedBot}
            onClick={() => app.editBot()}
          />
        </Section>

        <Section title="Sistema">
          <NavItem icon={Smile} label="Avatares" active={app.view === 'avatars'} onClick={go('avatars')} />
          <NavItem icon={Plug} label="Provedores" active={app.view === 'providers'} onClick={go('providers')} />
          <NavItem icon={Settings} label="Configurações" active={app.view === 'settings'} onClick={go('settings')} />
        </Section>
      </nav>

      <button
        onClick={go('providers')}
        className="mx-3 mb-3 flex items-center gap-3 rounded-tile border border-line bg-card px-3 py-2.5 text-left hover:bg-hover"
      >
        <PixelAvatar avatar={app.activeAvatar} mood={app.mood} size={26} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{provider?.name ?? 'Carregando…'}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            {provider && <StatusDot status={provider.status} />}
            Provedor ativo
          </p>
        </div>
      </button>
    </aside>
  )
}
