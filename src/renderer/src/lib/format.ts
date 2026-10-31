export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function longDate(date = new Date()): string {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function shortTime(ts: number): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(ts)
}

/** Tempo relativo curto, ex.: "há 5 min", "há 2 dias". */
export function timeAgo(ts: number, now = Date.now()): string {
  const min = Math.round((now - ts) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(ts)
}

export const uid = () => crypto.randomUUID()
