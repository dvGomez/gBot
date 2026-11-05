import { t as tr, useLanguage } from '@/i18n'
import type { ReactNode } from 'react'
import type { Bot } from '@shared/types'
import { Card } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { BotActivity } from '@/lib/useTeamActivity'
import { useApp } from '@/state/app'
import { PixelAvatar } from './PixelAvatar'

/** "z z z" subindo sobre quem está dormindo. */
function Snore({ seed }: { seed: number }) {
  useLanguage()
  return (
    <span className="pointer-events-none absolute -top-1 right-0 text-[10px] font-semibold text-muted" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="gbot-z absolute" style={{ animationDelay: `${(i * 0.9 + seed * 0.37) % 2.7}s`, left: i * 5 }}>
          z
        </span>
      ))}
    </span>
  )
}

function useOpen() {
  const app = useApp()
  return (a: BotActivity) => {
    if (a.target.kind === 'flow') app.openFlow(a.target.id)
    else if (a.target.kind === 'conversation') app.openConversation(a.target.id)
    else app.openBot(a.target.id)
  }
}

/** Bot trabalhando: avatar grande e animado, com um balão dizendo o que está fazendo. */
function Worker({ bot, activity, seed }: { bot: Bot; activity: BotActivity; seed: number }) {
  useLanguage()
  const open = useOpen()
  const waiting = activity.state === 'waiting'
  return (
    <button onClick={() => open(activity)} className="group flex w-[210px] flex-col items-center text-center">
      <span
        className={cn(
          'relative mb-3 w-full rounded-tile border px-3 py-2 text-[12px] leading-snug text-fg-2 transition-colors group-hover:bg-hover',
          waiting ? 'border-warning/60 bg-sidebar' : 'border-line bg-sidebar'
        )}
      >
        <span className="line-clamp-2">{activity.text}</span>
        {!waiting && (
          <span className="gbot-dots mt-1 inline-flex gap-0.5" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        )}
        <span
          className={cn(
            'absolute -bottom-[7px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b bg-sidebar',
            waiting ? 'border-warning/60' : 'border-line'
          )}
        />
      </span>
      <span className="gbot-work">
        <PixelAvatar avatar={bot.avatar} mood={activity.mood} size={64} seed={seed} />
      </span>
      <span className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold">
        <span className={cn('size-1.5 rounded-full', waiting ? 'bg-warning' : 'animate-pulse bg-success')} />
        {bot.name}
      </span>
    </button>
  )
}

/** Bot dormindo: pequeno, de olhos fechados; o detalhe aparece ao passar o mouse. */
function Sleeper({ bot, activity, seed }: { bot: Bot; activity: BotActivity; seed: number }) {
  useLanguage()
  const open = useOpen()
  return (
    <button onClick={() => open(activity)} className="group relative flex flex-col items-center rounded-tile px-1 pt-3 pb-2 hover:bg-hover">
      <span className="relative opacity-80 transition-opacity group-hover:opacity-100">
        <PixelAvatar avatar={bot.avatar} mood="sleeping" size={40} seed={seed} />
        <Snore seed={seed} />
      </span>
      <span className="mt-1.5 w-full truncate text-[12px] text-fg-2">{bot.name}</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 w-max max-w-[220px] -translate-x-1/2 rounded-nav border border-line bg-sidebar px-2.5 py-1.5 text-left text-[11px] text-fg-2 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        <span className="block font-semibold text-fg">{bot.name}</span>
        {bot.description && <span className="block">{bot.description}</span>}
        <span className="block text-muted">{activity.text}</span>
      </span>
    </button>
  )
}

/** Painel da equipe: quem está trabalhando em destaque, o resto dormindo numa grade compacta. */
export function TeamPanel({ activity, aside }: { activity: Map<string, BotActivity>; aside?: ReactNode }) {
  useLanguage()
  const app = useApp()
  const awake = app.bots.filter((b) => activity.get(b.id)?.state !== 'sleeping')
  const asleep = app.bots.filter((b) => activity.get(b.id)?.state === 'sleeping')
  const seedOf = (id: string) => app.bots.findIndex((b) => b.id === id)

  if (!app.bots.length) {
    return (
      <Card className="p-5">
        <p className="text-[13px] font-medium text-muted">{tr('Equipe')}</p>
        <p className="py-3 text-[14px] text-muted">{tr('Você ainda não tem bots. Crie um para ele aparecer aqui.')}</p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] font-medium text-muted">{tr('Equipe')}</p>
        <div className="flex items-center gap-3">
          <p className="text-[12px] text-muted">
            {awake.length > 0 && <span className="text-success">{awake.length}{tr(' trabalhando · ')}</span>}
            {asleep.length}{tr(' descansando')}</p>
          {aside}
        </div>
      </div>

      {awake.length > 0 ? (
        <div className="mt-4 flex flex-wrap justify-center gap-6 border-b border-line pb-6">
          {awake.map((b) => (
            <Worker key={b.id} bot={b} activity={activity.get(b.id)!} seed={seedOf(b.id)} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-muted">{tr('Todo mundo descansando. Eles acordam quando uma conversa ou rotina precisar deles.')}</p>
      )}

      {asleep.length > 0 && (
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1">
          {asleep.map((b) => (
            <Sleeper key={b.id} bot={b} activity={activity.get(b.id)!} seed={seedOf(b.id)} />
          ))}
        </div>
      )}
    </Card>
  )
}
