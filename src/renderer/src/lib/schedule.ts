import type { FlowSchedule } from '@shared/types'

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Frase curta da agenda, ex.: "Seg a Sex · 09:00" ou "A cada 30 min". */
export function describeSchedule(s?: FlowSchedule): string {
  if (!s) return 'Sem agenda'
  if (s.mode === 'interval') {
    const m = s.everyMinutes
    return m % 60 === 0 ? `A cada ${m / 60} h` : `A cada ${m} min`
  }
  const days = [...s.days].sort()
  let dayText: string
  if (days.length === 7) dayText = 'Todo dia'
  else if (days.join() === '1,2,3,4,5') dayText = 'Seg a Sex'
  else if (days.join() === '0,6') dayText = 'Fim de semana'
  else if (!days.length) dayText = 'Nenhum dia'
  else dayText = days.map((d) => WEEKDAYS[d]).join(', ')
  const times = [...s.times].sort()
  return `${dayText} · ${times.length ? times.join(', ') : 'sem horário'}`
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
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `hoje ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `amanhã ${time}`
  return `${WEEKDAYS[d.getDay()].toLowerCase()} ${time}`
}
