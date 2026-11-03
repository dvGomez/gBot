/** Compara nomes sem acento e sem diferenciar maiúsculas. */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * Itens mencionados com `@Nome` no texto, na ordem em que aparecem (nomes podem ter espaços; vence o nome mais longo).
 * A menção precisa terminar em espaço, pontuação ou fim do texto.
 */
export function findMentions<T extends { name: string }>(text: string, items: T[], trigger = '@'): T[] {
  const norm = normalize(text)
  const found: { item: T; index: number }[] = []
  const taken: [number, number][] = []
  for (const item of [...items].sort((a, b) => b.name.length - a.name.length)) {
    const needle = `${trigger}${normalize(item.name)}`
    let from = 0
    let i: number
    while ((i = norm.indexOf(needle, from)) >= 0) {
      const end = i + needle.length
      const after = norm[end]
      const free = !taken.some(([a, b]) => i < b && end > a)
      if ((after === undefined || /[\s.,;:!?)]/.test(after)) && free) {
        found.push({ item, index: i })
        taken.push([i, end])
        break
      }
      from = i + 1
    }
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.item)
}
