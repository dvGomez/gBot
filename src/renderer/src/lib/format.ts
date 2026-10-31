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

export const uid = () => crypto.randomUUID()
