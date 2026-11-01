import { t as tr, locale } from '@/i18n'
import type { TokenUsage } from '@shared/types'
export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return tr('Bom dia')
  if (h < 18) return tr('Boa tarde')
  return tr('Boa noite')
}

export function longDate(date = new Date()): string {
  const s = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function shortTime(ts: number): string {
  return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(ts)
}

/** Tempo relativo curto, ex.: "há 5 min", "há 2 dias". */
export function timeAgo(ts: number, now = Date.now()): string {
  const min = Math.round((now - ts) / 60000)
  if (min < 1) return tr('agora')
  if (min < 60) return tr('há {0} min', min)
  const h = Math.round(min / 60)
  if (h < 24) return tr('há {0} h', h)
  const d = Math.round(h / 24)
  if (d < 30) return tr('há {0} {1}', d, d === 1 ? tr('dia') : tr('dias'))
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(ts)
}

/** Quantidade de tokens curta, ex.: "850", "12,3 mil", "1,2 mi". */
export function formatTokens(n: number): string {
  const fmt = (v: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return tr('{0} mil', fmt(n / 1000))
  return tr('{0} mi', fmt(n / 1_000_000))
}

/** Detalhe do consumo para o tooltip. */
export function usageDetail(u: TokenUsage): string {
  const cost = new Intl.NumberFormat(locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 3 }).format(u.cost)
  return [
    tr('{0} de entrada novos', formatTokens(u.input + u.cacheWrite)),
    tr('{0} lidos do cache (pesam bem menos)', formatTokens(u.cacheRead)),
    tr('{0} gerados', formatTokens(u.output)),
    tr('≈ {0} se fosse pela API (na assinatura não é cobrado; serve para comparar o peso no limite)', cost)
  ].join('\n')
}

export const uid = () => crypto.randomUUID()

/** Quando um limite zera, ex.: "às 21:09", "amanhã às 08:00", "sáb. às 14:00". */
export function resetTime(iso: string, now = new Date()): string {
  const at = new Date(iso)
  const time = shortTime(at.getTime())
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days <= 0) return tr('às {0}', time)
  if (days === 1) return tr('amanhã às {0}', time)
  if (days < 7) return tr('{0} às {1}', new Intl.DateTimeFormat(locale(), {
  weekday: 'short'
}).format(at), time)
  return tr('{0} às {1}', new Intl.DateTimeFormat(locale(), {
  day: 'numeric',
  month: 'short'
}).format(at), time)
}
