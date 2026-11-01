import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import type { BotTask } from '@shared/types'

/**
 * Fila de trabalho de cada bot: um bot faz uma tarefa por vez, venha ela de um fluxo, de uma conversa ou de
 * uma consulta de outro bot. As demais esperam na ordem de chegada (e aparecem na página do bot).
 */

interface Entry {
  task: BotTask
  /** Cancela a tarefa (esperando ou já rodando) pela página do bot. */
  cancel: AbortController
}

const entries = new Map<string, Entry>()
/** Fim da última tarefa enfileirada de cada bot: a próxima começa depois dela. */
const tails = new Map<string, Promise<void>>()

export function listBotTasks(): BotTask[] {
  return [...entries.values()].map((e) => e.task).sort((a, b) => a.queuedAt - b.queuedAt)
}

export function cancelBotTask(id: string) {
  entries.get(id)?.cancel.abort()
}

function broadcast() {
  const tasks = listBotTasks()
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('bots:tasks', tasks)
}

const aborted = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    const fail = () => reject(new Error('Tarefa cancelada antes de começar.'))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })

/**
 * Roda `work` quando chegar a vez desta tarefa na fila do bot. `onWait` recebe quantas tarefas estão na frente
 * (só é chamado se houver alguma). O `signal` entregue a `work` também dispara se a tarefa for cancelada.
 */
export async function runAsBot<T>(
  botId: string,
  info: Pick<BotTask, 'label' | 'origin' | 'originId'>,
  signal: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
  onWait?: (ahead: number) => void
): Promise<T> {
  const task: BotTask = { id: randomUUID(), botId, ...info, status: 'waiting', queuedAt: Date.now() }
  const cancel = new AbortController()
  const ahead = listBotTasks().filter((t) => t.botId === botId).length
  entries.set(task.id, { task, cancel })

  const prev = tails.get(botId) ?? Promise.resolve()
  let finish!: () => void
  const mine = new Promise<void>((resolve) => (finish = resolve))
  const tail = prev.then(() => mine)
  tails.set(botId, tail)
  broadcast()

  try {
    if (ahead) onWait?.(ahead)
    const stop = AbortSignal.any([signal, cancel.signal])
    await Promise.race([prev, aborted(stop)])
    stop.throwIfAborted()
    task.status = 'running'
    task.startedAt = Date.now()
    broadcast()
    return await work(stop)
  } finally {
    finish()
    entries.delete(task.id)
    if (tails.get(botId) === tail) tails.delete(botId)
    broadcast()
  }
}

/** Aviso padrão para quem ficou esperando na fila. */
export const waitNotice = (botName: string, ahead: number) =>
  `${botName} está terminando ${ahead === 1 ? 'outra tarefa' : `${ahead} tarefas`}; esta está na fila e começa em seguida.`
