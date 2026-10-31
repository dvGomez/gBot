import { ChevronRight, Trash2 } from 'lucide-react'
import type { ConversationMeta } from '@shared/types'
import { draggable } from '@/lib/dnd'
import { useApp } from '@/state/app'
import { AgentAvatar } from './AgentAvatar'

function when(ts: number): string {
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return new Intl.DateTimeFormat('pt-BR', today ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short' }).format(d)
}

/** Lista de conversas com avatar (do bot, ou ícone de conversa), título, data e excluir. */
export function ConversationList({ items, empty }: { items: ConversationMeta[]; empty?: string }) {
  const app = useApp()
  if (items.length === 0) return empty ? <p className="py-3 text-[13px] text-muted">{empty}</p> : null

  return (
    <div>
      {items.map((c) => {
        const bot = app.getBot(c.botId)
        const project = app.getProject(c.projectId)
        return (
          <div
            key={c.id}
            {...draggable({ kind: 'conversation', id: c.id, projectId: c.projectId })}
            className="group flex items-center gap-4 border-b border-line py-3 last:border-0"
          >
            <button onClick={() => app.openConversation(c.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
              <AgentAvatar avatar={bot?.avatar} size={30} animated={false} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{c.title}</p>
                <p className="text-[12px] text-muted">
                  {project ? `${project.name} · ` : ''}
                  {bot ? `${bot.name} · ` : ''}
                  {c.messageCount} mensagens · {when(c.updatedAt)}
                </p>
              </div>
              <ChevronRight size={16} className="text-muted" />
            </button>
            <button
              onClick={() => void app.removeConversation(c.id)}
              title="Excluir conversa"
              className="rounded-full p-1.5 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-hover hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
