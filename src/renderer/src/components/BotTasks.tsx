import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useState } from 'react'
import { LoaderCircle, MessageSquare, Network, Workflow, X } from 'lucide-react'
import type { BotTask } from '@shared/types'
import { Card } from '@/components/ui'
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

/** O que o bot está fazendo e o que espera na fila dele. Some quando não há nada. */
export function BotTasks({ botId, botName }: { botId: string; botName: string }) {
  useLanguage()
  const app = useApp()
  const tasks = useBotTasks().filter((t) => t.botId === botId)
  if (!tasks.length) return null

  const open = (t: BotTask) => {
    if (t.origin === 'flow' && t.originId) app.openFlow(t.originId)
    else if (t.originId && app.conversations.some((c) => c.id === t.originId)) app.openConversation(t.originId)
  }
  const waiting = tasks.filter((t) => t.status === 'waiting')

  return (
    <Card className="mt-8 p-5">
      <div className="flex items-baseline justify-between gap-4 pb-2">
        <p className="text-[13px] font-medium text-muted">{tr('Tarefas de ')}{botName}</p>
        <p className="text-[12px] text-muted">
          {botName}{tr(' faz uma tarefa por vez')}{waiting.length ? tr(' · {0} na fila', waiting.length) : ''}
        </p>
      </div>
      {tasks.map((t, i) => {
        const Icon = ICONS[t.origin]
        const running = t.status === 'running'
        return (
          <div key={t.id} className="flex items-center gap-4 border-b border-line py-3 last:border-0">
            <span className="flex w-9 shrink-0 justify-center">
              {running ? (
                <LoaderCircle size={18} className="animate-spin text-warning" />
              ) : (
                <span className="text-[13px] font-medium text-muted tabular-nums">{i}</span>
              )}
            </span>
            <button onClick={() => open(t)} className="min-w-0 flex-1 text-left hover:opacity-85">
              <span className="flex items-center gap-2 truncate text-[14px] font-medium">
                <Icon size={14} className="shrink-0 text-muted" />
                <span className="truncate">{t.label}</span>
              </span>
              <span className={`block text-[12px] ${running ? 'text-warning' : 'text-muted'}`}>
                {running ? tr('Fazendo agora · começou {0}', timeAgo(t.startedAt ?? t.queuedAt)) : tr('Na fila · chegou {0}', timeAgo(t.queuedAt))}
              </span>
            </button>
            <button
              onClick={() => void window.gbot.bots.cancelTask(t.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-muted hover:bg-hover hover:text-danger"
              title={running ? tr('Interromper esta tarefa') : tr('Tirar da fila')}
            >
              <X size={13} /> {running ? tr('Interromper') : tr('Cancelar')}
            </button>
          </div>
        )
      })}
    </Card>
  )
}
