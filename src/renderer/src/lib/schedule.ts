import { t as tr, locale, localized } from '@/i18n'
import type { FlowSchedule } from '@shared/types'

export const WEEKDAYS = localized([tr('Dom'), tr('Seg'), tr('Ter'), tr('Qua'), tr('Qui'), tr('Sex'), tr('Sáb')])

/** Frase curta da agenda, ex.: "Seg a Sex · 09:00" ou "A cada 30 min". */
export function describeSchedule(s?: FlowSchedule): string {
  if (!s) return tr('Sem agenda')
  if (s.mode === 'interval') {
    const m = s.everyMinutes
    return m % 60 === 0 ? tr('A cada {0} h', m / 60) : tr('A cada {0} min', m)
  }
  const days = [...s.days].sort()
  let dayText: string
  if (days.length === 7) dayText = tr('Todo dia')
  else if (days.join() === '1,2,3,4,5') dayText = tr('Seg a Sex')
  else if (days.join() === '0,6') dayText = tr('Fim de semana')
  else if (!days.length) dayText = tr('Nenhum dia')
  else dayText = days.map((d) => WEEKDAYS[d]).join(', ')
  const times = [...s.times].sort()
  return `${dayText} · ${times.length ? times.join(', ') : tr('sem horário')}`
}

/** Próximo disparo (para mostrar no canvas). Intervalo depende da última execução, então não calcula. */
export function nextRun(s?: FlowSchedule, from = new Date()): Date | undefined {
  if (!s || s.mode !== 'times' || !s.days.length || !s.times.length) return undefined
  for (let d = 0; d < 8; d++) {
    const day = new Date(from)
    day.setDate(from.getDate() + d)
    if (!s.days.includes(day.getDay())) continue
    for (const t of [...s.times].sort()) {
      const [h, m] = t.split(':').map(Number)
      const at = new Date(day)
      at.setHours(h, m, 0, 0)
      if (at > from) return at
    }
  }
  return undefined
}

export function formatWhen(d: Date): string {
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return tr('hoje {0}', time)
  if (d.toDateString() === tomorrow.toDateString()) return tr('amanhã {0}', time)
  return `${WEEKDAYS[d.getDay()].toLowerCase()} ${time}`
}
