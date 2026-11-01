import type { UsageLimit } from '@shared/types'
import { notifyAccountsChanged } from '../claude-code/accounts'
import { accountDir, codexAuth, listAccountRecords } from './accounts'

/**
 * Limites do plano ChatGPT de cada conta (janela curta e semanal), lidos do mesmo endpoint que a tela de uso do
 * Codex consulta. O endpoint não é documentado: se mudar ou falhar, os limites aparecem como indisponíveis.
 * O token de acesso dura dias e o próprio Codex o renova quando é usado; o gBot só lê.
 */
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

const FRESH_MS = 60_000
const MIN_INTERVAL_MS = 10_000

type Window = { used_percent?: number; limit_window_seconds?: number; reset_at?: number } | null | undefined

/** "Limite de 5 horas", "Semanal"... a partir do tamanho da janela. */
function windowLabel(seconds = 0): string {
  if (seconds >= 6 * 86_400) return 'Semanal'
  if (seconds >= 86_400) return `Limite de ${Math.round(seconds / 86_400)} dias`
  return `Limite de ${Math.round(seconds / 3600)} horas`
}

function parse(data: { rate_limit?: { primary_window?: Window; secondary_window?: Window } }): UsageLimit[] {
  const out: UsageLimit[] = []
  for (const [id, w] of [
    ['primary', data.rate_limit?.primary_window],
    ['secondary', data.rate_limit?.secondary_window]
  ] as const) {
    if (typeof w?.used_percent !== 'number') continue
    out.push({
      id,
      label: windowLabel(w.limit_window_seconds),
      percent: Math.round(w.used_percent),
      resetsAt: w.reset_at ? new Date(w.reset_at * 1000).toISOString() : undefined
    })
  }
  return out
}

async function fetchLimits(accountId: string): Promise<UsageLimit[]> {
  const auth = codexAuth(accountDir(accountId))
  if (!auth) throw new Error('Sem login com ChatGPT nesta conta.')
  if (auth.expiresAt && auth.expiresAt < Date.now()) throw new Error('Login a renovar: os limites atualizam quando esta conta for usada.')
  const res = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      ...(auth.accountId ? { 'ChatGPT-Account-Id': auth.accountId } : {}),
      'User-Agent': 'codex_cli_rs'
    },
    signal: AbortSignal.timeout(15_000)
  })
  if (res.status === 401) throw new Error('O login desta conta expirou. Entre de novo.')
  if (!res.ok) throw new Error(`Limites indisponíveis agora (HTTP ${res.status}).`)
  return parse((await res.json()) as Parameters<typeof parse>[0])
}

export interface LimitsEntry {
  limits: UsageLimit[]
  at?: number
  triedAt: number
  error?: string
}

const cache = new Map<string, LimitsEntry>()
const inflight = new Map<string, Promise<void>>()

export const cachedLimits = (accountId: string): LimitsEntry | undefined => cache.get(accountId)

function refreshOne(accountId: string): Promise<void> {
  const running = inflight.get(accountId)
  if (running) return running
  const p = fetchLimits(accountId)
    .then((limits) => void cache.set(accountId, { limits, at: Date.now(), triedAt: Date.now() }))
    .catch((e: Error) => {
      const prev = cache.get(accountId)
      cache.set(accountId, { limits: prev?.limits ?? [], at: prev?.at, triedAt: Date.now(), error: e.message })
    })
    .finally(() => inflight.delete(accountId))
  inflight.set(accountId, p)
  return p
}

/** Atualiza os limites desatualizados (`force`: todos, respeitando o intervalo mínimo) e avisa as janelas. */
export async function refreshLimits(force = false): Promise<void> {
  const due = listAccountRecords().filter((a) => Date.now() - (cache.get(a.id)?.triedAt ?? 0) > (force ? MIN_INTERVAL_MS : FRESH_MS))
  if (!due.length) return
  await Promise.all(due.map((a) => refreshOne(a.id)))
  notifyAccountsChanged()
}

export const forgetLimits = (accountId: string) => void cache.delete(accountId)
