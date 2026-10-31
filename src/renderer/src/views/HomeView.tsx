import type { ReactNode } from 'react'
import { Bot as BotIcon, FolderPlus, MessageSquarePlus, Plus } from 'lucide-react'
import { ConversationList } from '@/components/ConversationList'
import { PixelAvatar } from '@/components/PixelAvatar'
import { ProjectTile } from '@/components/ProjectBadge'
import { ProviderNotice } from '@/components/ProviderNotice'
import { Card } from '@/components/ui'
import { greeting, longDate } from '@/lib/format'
import { useApp } from '@/state/app'

function BigOption({
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
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 rounded-card border border-line bg-card p-5 text-left transition-colors hover:bg-hover"
    >
      <div
        className={`flex size-14 shrink-0 items-center justify-center rounded-tile ${primary ? 'bg-primary text-on-primary' : 'bg-tile text-fg'}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-[18px] font-semibold tracking-[-0.01em]">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
      </div>
    </button>
  )
}

export function HomeView() {
  const app = useApp()

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[60px] pt-6 pb-12">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-[12px] font-medium tracking-[0.02em] text-muted">{longDate()}</p>
          <h1 className="mt-2 text-[36px] leading-tight font-medium tracking-[-0.03em]">{greeting()}</h1>
          <p className="mt-2 text-[15px] text-muted">O que vamos fazer hoje?</p>
        </div>
      </div>

      <div className="mt-8">
        <ProviderNotice />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <BigOption
          primary
          icon={<MessageSquarePlus size={22} strokeWidth={1.8} />}
          title="Nova conversa"
          subtitle="Converse livremente; chame bots com @"
          onClick={() => app.newConversation()}
        />
        <BigOption
          icon={<BotIcon size={22} strokeWidth={1.6} />}
          title="Novo bot"
          subtitle="Assistente especializado com instruções próprias"
          onClick={() => app.editBot()}
        />
        <BigOption
          icon={<FolderPlus size={22} strokeWidth={1.6} />}
          title="Novo projeto"
          subtitle="Agrupe bots e conversas, com pasta e instruções"
          onClick={() => app.editProject()}
        />
      </div>

      {app.projects.length > 0 && (
        <>
          <p className="mt-8 text-[13px] font-medium text-muted">Seus projetos</p>
          <div className="mt-3 grid grid-cols-3 gap-3 xl:grid-cols-4">
            {app.projects.map((p) => {
              const nBots = app.bots.filter((b) => b.projectId === p.id).length
              const nConvs = app.conversations.filter((c) => c.projectId === p.id).length
              return (
                <button
                  key={p.id}
                  onClick={() => app.openProject(p.id)}
                  className="flex flex-col items-start rounded-card border border-line bg-card p-5 text-left transition-colors hover:bg-hover"
                >
                  <ProjectTile project={p} size={44} />
                  <p className="mt-3 w-full truncate text-[15px] font-semibold">{p.name}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {nBots} {nBots === 1 ? 'bot' : 'bots'} · {nConvs} {nConvs === 1 ? 'conversa' : 'conversas'}
                  </p>
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="mt-8 flex items-end justify-between">
        <p className="text-[13px] font-medium text-muted">Seus bots (fora de projetos)</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 xl:grid-cols-4">
        {app.bots
          .filter((b) => !b.projectId)
          .map((b, i) => (
          <button
            key={b.id}
            onClick={() => app.openBot(b.id)}
            className="flex flex-col items-start rounded-card border border-line bg-card p-5 text-left transition-colors hover:bg-hover"
          >
            <PixelAvatar avatar={b.avatar} size={44} seed={i} />
            <p className="mt-3 w-full truncate text-[15px] font-semibold">{b.name}</p>
            <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{b.description || 'Sem descrição'}</p>
          </button>
          ))}
        <button
          onClick={() => app.editBot()}
          className="flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <Plus size={18} />
          Criar bot
        </button>
      </div>

      {app.conversations.length > 0 && (
        <Card className="mt-8 p-5">
          <p className="pb-2 text-[13px] font-medium text-muted">Conversas recentes</p>
          <ConversationList items={app.conversations.slice(0, 8)} />
        </Card>
      )}
    </div>
  )
}
