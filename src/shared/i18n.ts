import { en } from './locales/en'

export type Language = 'en' | 'pt-BR'
export type LanguagePreference = Language | 'system'

const patterns = Object.keys(en).filter((key) => /\{\d+\}/.test(key)).map((source) => {
  const parts = source.split(/(\{\d+\})/g)
  const indexes: number[] = []
  const expression = parts.map((part) => {
    if (/^\{\d+\}$/.test(part)) { indexes.push(Number(part.slice(1, -1))); return '(.*?)' }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('')
  return { source, indexes, regex: new RegExp(`^${expression}$`, 's') }
})

export function resolveLanguage(preference: LanguagePreference | undefined, systemLocale: string): Language {
  if (preference === 'en' || preference === 'pt-BR') return preference
  return /^pt(?:-|$)/i.test(systemLocale) ? 'pt-BR' : 'en'
}

export function translate(source: string, language: Language, ...values: unknown[]): string {
  let template = source
  if (language === 'en') {
    template = en[source] ?? (en[source.trim()] ? source.replace(source.trim(), en[source.trim()]) : source)
    if (!values.length && template === source && !en[source]) {
      for (const pattern of patterns) {
        const match = source.match(pattern.regex)
        if (!match) continue
        const args: unknown[] = []
        pattern.indexes.forEach((index, i) => { args[index] = match[i + 1] })
        return translate(pattern.source, language, ...args)
      }
    }
  }
  // Never replace the workflow's {{anterior}} token or interpolate user content twice.
  return template.replace(/(?<!\{)\{(\d+)\}(?!\})/g, (match, index: string) => Number(index) < values.length ? String(values[Number(index)] ?? '') : match)
}
