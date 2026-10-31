import { useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import type { ChatMessage } from '@shared/types'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Composer } from '@/components/Composer'
import { Markdown } from '@/components/Markdown'
import { ToolList } from '@/components/ToolList'
import { MOOD_LABELS } from '@/avatars/sprites'
import { modelLabel } from '@/components/ModelSelect'
import { ProjectIcon } from '@/components/ProjectBadge'
import { ItemMenu } from '@/components/ItemMenu'
import { useApp } from '@/state/app'

function Message({ msg, live }: { msg: ChatMessage; live: boolean }) {
  const app = useApp()
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="selectable max-w-[75%] rounded-[18px] bg-tile px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    )
  }
  // Resposta de um bot (o da conversa ou um chamado por @menção) leva o avatar dele; numa conversa normal, nada.
  const author = msg.botId ? app.getBot(msg.botId) : undefined
  const avatar = author?.avatar ?? app.activeAvatar
  return (
    <div className="flex gap-3">
      {avatar && (
        <div className="pt-0.5">
          <PixelAvatar avatar={avatar} mood={live ? app.mood : 'idle'} size={28} animated={live} />
        </div>
      )}
      <div className="selectable min-w-0 flex-1 pt-1 text-[15px] leading-relaxed">
        {author && <p className="mb-1 text-[12px] font-semibold text-fg-2">{author.name}</p>}
        {msg.tools && msg.tools.length > 0 && <ToolList tools={msg.tools} />}
        {msg.error ? (
          <p className="text-danger">{msg.text}</p>
        ) : msg.text ? (
          <Markdown text={msg.text} />
        ) : (
          live && !msg.tools?.length && <span className="text-muted">Pensando…</span>
        )}
        {msg.notices?.map((n, i) => (
          <p key={i} className="mt-2 text-[13px] text-muted">
            {n}
          </p>
        ))}
      </div>
    </div>
  )
}

export function ChatView() {
  const app = useApp()
  const conv = app.activeConversation
  const avatar = app.activeAvatar
  const bot = app.activeBot
  const project = app.activeProject
  const empty = !conv || conv.messages.length === 0
  const bottom = useRef<HTMLDivElement>(null)
  const lastText = conv?.messages.at(-1)?.text

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [conv?.messages.length, lastText])

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-[860px] items-center gap-3 px-8 pb-4">
        {avatar && <PixelAvatar avatar={avatar} mood={app.mood} size={40} />}
        <div className="min-w-0">
          {bot ? (
            <button onClick={() => app.openBot(bot.id)} className="text-[15px] font-semibold hover:underline">
              {bot.name}
            </button>
          ) : (
            <p className="truncate text-[15px] font-semibold">{conv?.title ?? 'Nova conversa'}</p>
          )}
          {bot && (
            <p className="text-[12px] text-muted">
              {app.models.length > 0 && `${modelLabel(app.models, app.activeModel)} · `}
              {MOOD_LABELS[app.mood]}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {conv && !bot?.projectId ? (
            <label className="relative inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px] text-fg-2 hover:bg-hover">
              {project ? <ProjectIcon project={project} size={14} /> : <span className="text-muted">Projeto:</span>}
              <select
                value={conv.projectId ?? ''}
                onChange={(e) => void app.moveConversation(conv.id, e.target.value || undefined)}
                disabled={app.busy}
                className="appearance-none bg-transparent pr-1 outline-none"
              >
                <option value="">Nenhum</option>
                {app.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            project && (
              <button
                onClick={() => app.openProject(project.id)}
                className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px] text-fg-2 hover:bg-hover"
              >
                <ProjectIcon project={project} size={14} />
                {project.name}
              </button>
            )
          )}
          {conv && (
            <ItemMenu
              actions={[
                {
                  label: 'Excluir conversa',
                  icon: Trash2,
                  danger: true,
                  confirm: 'Excluir esta conversa? Não dá para desfazer.',
                  onSelect: () => void app.removeConversation(conv.id)
                }
              ]}
            />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border-t border-line">
        <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-8 py-8">
          {empty && (
            <div className="flex flex-col items-center pt-16 text-center">
              {avatar && <PixelAvatar avatar={avatar} mood={app.mood} size={96} />}
              <p className={`${avatar ? 'mt-5' : ''} text-[22px] font-medium tracking-[-0.02em]`}>
                {bot ? `Converse com ${bot.name}` : 'Nova conversa'}
              </p>
              <p className="mt-1 max-w-[460px] text-[14px] text-muted">
                {bot
                  ? bot.description || 'Este bot segue as instruções que você definiu.'
                  : app.visibleBots.length
                    ? 'Pergunte o que quiser. Para falar com um bot, mencione com @.'
                    : 'Pergunte o que quiser.'}
              </p>
            </div>
          )}
          {conv?.messages.map((m, i) => (
            <Message key={m.id} msg={m} live={app.busy && i === conv.messages.length - 1} />
          ))}
          <div ref={bottom} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[860px] px-8 pt-2 pb-6">
        <Composer autoFocus placeholder={empty ? (bot ? `Mensagem para ${bot.name}…` : 'Mensagem…') : 'Responder…'} />
      </div>
    </div>
  )
}
