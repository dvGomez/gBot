import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useState } from 'react'
import { ChevronDown, LoaderCircle, MessageSquare, Network, Workflow, X } from 'lucide-react'
import type { BotTask } from '@shared/types'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/format'
import { useApp } from '@/state/app'

/** Tarefas rodando e na fila de todos os bots, atualizadas ao vivo. */
export function useBotTasks(): BotTask[] {
  const [tasks, setTasks] = useState<BotTask[]>([])
  useEffect(() => {
    void window.gbot.bots.tasks().then(setTasks)
    return window.gbot.bots.onTasks(setTasks)
  }, [])
  return tasks
}

const ICONS = { flow: Workflow, chat: MessageSquare, consult: Network }

/**
 * O que o bot está fazendo, numa linha só: a tarefa atual (clique abre a conversa ou a rotina), "Interromper" e,
 * quando há fila, um botão que abre a lista das tarefas esperando. Some quando não há nada.
 */
export function BotTasks({ botId, botName }: { botId: string; botName: string }) {
  useLanguage()
  const app = useApp()
  const [queueOpen, setQueueOpen] = useState(false)
  const tasks = useBotTasks().filter((t) => t.botId === botId)
  if (!tasks.length) return null

  const open = (t: BotTask) => {
    if (t.origin === 'flow' && t.originId) app.openFlow(t.originId)
    else if (t.originId && app.conversations.some((c) => c.id === t.originId)) app.openConversation(t.originId)
  }
  const running = tasks.find((t) => t.status === 'running')
  const waiting = tasks.filter((t) => t.status === 'waiting')
  const Icon = running ? ICONS[running.origin] : undefined

  return (
    <div className="relative mt-2 flex max-w-full items-center gap-1 text-[12px]">
      {running && Icon && (
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 py-0.5 pr-1 pl-2">
          <LoaderCircle size={12} className="shrink-0 animate-spin text-warning" />
          <button
            onClick={() => open(running)}
            title={tr('{0} faz uma tarefa por vez', botName)}
            className="inline-flex min-w-0 items-center gap-1.5 hover:opacity-85"
          >
            <Icon size={12} className="shrink-0 text-muted" />
            <span className="truncate font-medium text-fg">{running.label}</span>
            <span className="shrink-0 text-warning">· {tr('começou {0}', timeAgo(running.startedAt ?? running.queuedAt))}</span>
          </button>
          <button
            onClick={() => void window.gbot.bots.cancelTask(running.id)}
            title={tr('Interromper esta tarefa')}
            aria-label={tr('Interromper esta tarefa')}
            className="shrink-0 rounded-full p-0.5 text-muted hover:bg-hover hover:text-danger"
          >
            <X size={12} />
          </button>
        </span>
      )}
      {waiting.length > 0 && (
        <button
          onClick={() => setQueueOpen(!queueOpen)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-muted hover:bg-hover hover:text-fg"
        >
          {tr('{0} na fila', waiting.length)}
          <ChevronDown size={12} className={cn('transition-transform', queueOpen && 'rotate-180')} />
        </button>
      )}
      {queueOpen && waiting.length > 0 && (
        <div className="absolute top-full left-0 z-40 mt-1 w-[360px] max-w-[80vw] rounded-tile border border-line bg-sidebar py-1 shadow-lg">
          {waiting.map((t, i) => {
            const QIcon = ICONS[t.origin]
            return (
              <div key={t.id} className="flex items-center gap-2.5 px-3 py-1.5">
                <span className="w-4 shrink-0 text-center text-muted tabular-nums">{i + 1}</span>
                <button onClick={() => open(t)} className="min-w-0 flex-1 text-left hover:opacity-85">
                  <span className="flex items-center gap-1.5">
                    <QIcon size={12} className="shrink-0 text-muted" />
                    <span className="truncate text-[13px]">{t.label}</span>
                  </span>
                  <span className="block text-[11px] text-muted">{tr('chegou {0}', timeAgo(t.queuedAt))}</span>
                </button>
                <button
                  onClick={() => void window.gbot.bots.cancelTask(t.id)}
                  title={tr('Tirar da fila')}
                  aria-label={tr('Tirar da fila')}
                  className="shrink-0 rounded-full p-1 text-muted hover:bg-hover hover:text-danger"
                >
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
