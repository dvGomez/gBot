import type { Bot, Specialization } from '@shared/types'
import { findMentions, normalize } from '@shared/mentions'

export { normalize }

export function botByName(bots: Bot[], name?: string): Bot | undefined {
  if (!name) return undefined
  const key = normalize(name.replace(/^@/, '').trim())
  return bots.find((b) => normalize(b.name) === key)
}

/** Primeiro bot mencionado com `@Nome` no texto (nomes podem ter espaços; vence o nome mais longo). */
export const findMention = (text: string, bots: Bot[]): Bot | undefined => findMentions(text, bots)[0]

/**
 * Bot chamado no começo da mensagem (`@Lia, faça…`): a mensagem vai direto para ele. Mencionado no meio do texto
 * (`pergunte à @Lia…`), quem responde é o assistente da conversa, que consulta o bot mencionado.
 */
export function leadingMention(text: string, bots: Bot[]): Bot | undefined {
  const t = text.trimStart()
  const bot = findMention(t, bots)
  return bot && normalize(t).startsWith(`@${normalize(bot.name)}`) ? bot : undefined
}

/**
 * Especializações chamadas com `/Nome` no texto, na ordem em que aparecem. O `/` precisa estar no começo ou depois de um
 * espaço (para não confundir com caminhos e datas).
 */
export const findSlashes = (text: string, specializations: Specialization[]): Specialization[] =>
  findMentions(text, specializations, '/').filter((sp) => {
    const i = normalize(text).indexOf(`/${normalize(sp.name)}`)
    return i === 0 || /\s/.test(text[i - 1])
  })

/**
 * Trecho sendo digitado depois de um `@` (ou do caractere `trigger`), para o autocompletar (ou undefined se não houver).
 */
export function mentionQuery(text: string, caret: number, trigger = '@'): { start: number; query: string } | undefined {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf(trigger)
  if (at < 0) return undefined
  if (at > 0 && !/\s/.test(before[at - 1])) return undefined
  const query = before.slice(at + 1)
  if (query.length > 30 || /\n/.test(query)) return undefined
  return { start: at, query }
}
