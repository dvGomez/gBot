import type { MemoryOwner } from '@shared/types'
import type { ClaudeSession } from './session'

const PROMPT = [
  '[Mensagem automática do gBot, não do usuário.]',
  'Algo falhou nesta tarefa antes de ser concluído. Se você aprendeu um jeito melhor ou um cuidado que evita o erro,',
  'registre agora com save_lesson (curto e objetivo). Se não houver nada útil para próximas vezes, responda só: OK.'
].join(' ')

/**
 * Reflexão automática: se o turno teve ferramenta com erro ou negada, pede (sem aparecer no chat) que a lição
 * seja registrada. Roda na fila da sessão, então a próxima mensagem do usuário só começa depois.
 */
export function reflectIfNeeded(session: ClaudeSession, owner?: MemoryOwner) {
  if (!owner || !session.lastTurnFailed || session.exited) return
  const tag = { kind: 'reflection' as const, ...(owner.kind === 'bot' ? { botId: owner.id } : {}) }
  void session.send(PROMPT, () => undefined, AbortSignal.timeout(120_000), tag).catch(() => undefined)
}
