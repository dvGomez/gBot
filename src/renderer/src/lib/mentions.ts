import type { Bot, Specialization } from '@shared/types'

/** Compara nomes sem acento e sem diferenciar maiúsculas. */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export function botByName(bots: Bot[], name?: string): Bot | undefined {
  if (!name) return undefined
  const key = normalize(name.replace(/^@/, '').trim())
  return bots.find((b) => normalize(b.name) === key)
}

/**
 * Primeiro bot mencionado com `@Nome` no texto (nomes podem ter espaços; vence o nome mais longo).
 * A menção precisa terminar em espaço, pontuação ou fim do texto.
 */
export function findMention(text: string, bots: Bot[]): Bot | undefined {
  const norm = normalize(text)
  const byLength = [...bots].sort((a, b) => b.name.length - a.name.length)
  let best: { bot: Bot; index: number } | undefined
  for (const bot of byLength) {
    const needle = `@${normalize(bot.name)}`
    let from = 0
    let i: number
    while ((i = norm.indexOf(needle, from)) >= 0) {
      const after = norm[i + needle.length]
      if (after === undefined || /[\s.,;:!?)]/.test(after)) {
        if (!best || i < best.index) best = { bot, index: i }
        break
      }
      from = i + 1
    }
  }
  return best?.bot
}

/**
 * Especializações chamadas com `/Nome` no texto, na ordem em que aparecem (nomes podem ter espaços; vence o mais longo).
 * O `/` precisa estar no começo ou depois de um espaço, e o nome terminar em espaço, pontuação ou fim do texto.
 */
export function findSlashes(text: string, specializations: Specialization[]): Specialization[] {
  const norm = normalize(text)
  const found: { sp: Specialization; index: number }[] = []
  const taken: [number, number][] = []
  for (const sp of [...specializations].sort((a, b) => b.name.length - a.name.length)) {
    const needle = `/${normalize(sp.name)}`
    let from = 0
    let i: number
    while ((i = norm.indexOf(needle, from)) >= 0) {
      const end = i + needle.length
      const before = norm[i - 1]
      const after = norm[end]
      const free = !taken.some(([a, b]) => i < b && end > a)
      if ((before === undefined || /\s/.test(before)) && (after === undefined || /[\s.,;:!?)]/.test(after)) && free) {
        found.push({ sp, index: i })
        taken.push([i, end])
        break
      }
      from = i + 1
    }
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.sp)
}

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
