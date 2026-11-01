import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import type { QuestionAnswer, QuestionRequest, UserQuestion } from '@shared/types'

/** Tempo para o usuário responder antes de a IA seguir sozinha. */
const TIMEOUT_MS = 30 * 60_000

const pending = new Map<string, { resolve(answers?: QuestionAnswer[]): void; timer: NodeJS.Timeout }>()

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

/**
 * Mostra perguntas com opções no chat da conversa e espera as respostas. Resolve sem respostas se o usuário não
 * responder a tempo ou se o turno for cancelado.
 */
export function askUser(req: Omit<QuestionRequest, 'id'>, signal?: AbortSignal): Promise<QuestionAnswer[] | undefined> {
  const id = randomUUID()
  return new Promise((resolve) => {
    const timer = setTimeout(() => respondQuestions(id), TIMEOUT_MS)
    pending.set(id, { resolve, timer })
    signal?.addEventListener('abort', () => respondQuestions(id), { once: true })
    broadcast('questions:request', { ...req, id } satisfies QuestionRequest)
  })
}

export function respondQuestions(id: string, answers?: QuestionAnswer[]) {
  const p = pending.get(id)
  if (!p) return
  pending.delete(id)
  clearTimeout(p.timer)
  broadcast('questions:resolved', id)
  p.resolve(answers)
}

/** Texto devolvido à IA com as respostas. */
export function answersText(questions: UserQuestion[], answers?: QuestionAnswer[]): string {
  if (!answers) return 'O usuário não respondeu. Siga com a opção que fizer mais sentido e diga qual escolheu.'
  return ['Respostas do usuário:', ...answers.map((a) => `- ${a.question}\n  ${a.answer}`)].join('\n') +
    (answers.length < questions.length ? '\n(Algumas perguntas ficaram sem resposta: decida com bom senso.)' : '')
}
