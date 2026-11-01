import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UsageLimit } from '@shared/types'
import { accountDir, listAccountRecords, notifyAccountsChanged } from './accounts'
import { accountInUse } from './sessions'

/**
 * Limites de uso da assinatura de cada conta (janela de 5 horas, semanal...), lidos do mesmo endpoint que o
 * `/usage` do Claude Code consulta. O endpoint não é documentado: se ele mudar ou falhar, os limites aparecem
 * como indisponíveis e o resto do app segue normal.
 */
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'

/** Leituras mais novas que isso são reaproveitadas; pedir de novo antes do intervalo mínimo não consulta. */
const FRESH_MS = 60_000
const MIN_INTERVAL_MS = 10_000

interface OAuthCreds {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  refreshTokenExpiresAt?: number
  scopes?: string[]
}

/**
 * Credenciais da conta: `.credentials.json` no perfil (Windows e Linux) ou o Keychain (macOS), no item que o
 * Claude Code cria para o perfil. `file` só vem quando dá para gravar de volta um token renovado.
 */
async function readCreds(dir: string): Promise<{ creds: OAuthCreds; file?: string } | undefined> {
  const file = join(dir, '.credentials.json')
  try {
    const creds = JSON.parse(readFileSync(file, 'utf8')).claudeAiOauth as OAuthCreds | undefined
    if (creds?.accessToken) return { creds, file }
  } catch {
    // sem arquivo: no macOS fica no Keychain
  }
  if (process.platform !== 'darwin') return undefined
  const service = `Claude Code-credentials-${createHash('sha256').update(dir).digest('hex').slice(0, 8)}`
  const raw = await new Promise<string>((resolve) =>
    execFile('security', ['find-generic-password', '-w', '-s', service], { timeout: 10_000 }, (err, out) =>
      resolve(err ? '' : out.trim())
    )
  )
  try {
    const creds = JSON.parse(raw).claudeAiOauth as OAuthCreds | undefined
    return creds?.accessToken ? { creds } : undefined
  } catch {
    return undefined
  }
}

/** Renova o token de acesso e grava no arquivo do perfil no mesmo formato do Claude Code. */
async function refreshToken(file: string, creds: OAuthCreds): Promise<OAuthCreds> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: CLIENT_ID,
      scope: (creds.scopes ?? []).join(' ')
    }),
    signal: AbortSignal.timeout(30_000)
  })
  if (!res.ok) throw new Error('O login desta conta expirou. Entre de novo.')
  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    refresh_token_expires_in?: number
    scope?: string
  }
  const next: OAuthCreds = {
    ...creds,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? creds.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    ...(data.refresh_token_expires_in ? { refreshTokenExpiresAt: Date.now() + data.refresh_token_expires_in * 1000 } : {}),
    ...(data.scope ? { scopes: data.scope.split(' ').filter(Boolean) } : {})
  }
  // Relê o arquivo na hora de gravar para não perder campos que o Claude Code tenha mudado nesse meio-tempo.
  const current = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify({ ...current, claudeAiOauth: { ...(current.claudeAiOauth as object), ...next } }))
  renameSync(tmp, file)
  return next
}

type Window = { utilization?: number | null; resets_at?: string | null } | null | undefined

/** Janelas conhecidas da resposta, na ordem em que aparecem. */
const WINDOWS: { key: string; label: string }[] = [
  { key: 'five_hour', label: 'Limite de 5 horas' },
  { key: 'seven_day', label: 'Semanal · todos os modelos' },
  { key: 'seven_day_opus', label: 'Semanal · Opus' },
  { key: 'seven_day_sonnet', label: 'Semanal · Sonnet' }
]

function parseLimits(data: Record<string, unknown>): UsageLimit[] {
  const out: UsageLimit[] = []
  for (const { key, label } of WINDOWS) {
    const w = data[key] as Window
    if (typeof w?.utilization !== 'number') continue
    out.push({ id: key, label, percent: Math.round(w.utilization), resetsAt: w.resets_at ?? undefined })
  }
  const extra = data.extra_usage as { is_enabled?: boolean; utilization?: number | null } | undefined
  if (extra?.is_enabled && typeof extra.utilization === 'number') {
    out.push({ id: 'extra', label: 'Créditos extras do mês', percent: Math.round(extra.utilization) })
  }
  return out
}

async function fetchLimits(accountId: string): Promise<UsageLimit[]> {
  const found = await readCreds(accountDir(accountId))
  if (!found) throw new Error('Sem login nesta conta.')
  let { creds } = found
  if (creds.expiresAt && creds.expiresAt < Date.now() + 60_000) {
    // Com um processo do Claude Code aberto nesta conta, ele mesmo renova: renovar aqui ao mesmo tempo
    // poderia invalidar o token dele. Fora isso, renova (só onde o token fica em arquivo).
    if (!found.file || !creds.refreshToken || accountInUse(accountId)) {
      throw new Error('Login a renovar: os limites atualizam quando esta conta for usada.')
    }
    creds = await refreshToken(found.file, creds)
  }
  const res = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(15_000)
  })
  if (res.status === 401) throw new Error('O login desta conta expirou. Entre de novo.')
  if (!res.ok) throw new Error(`Limites indisponíveis agora (HTTP ${res.status}).`)
  return parseLimits((await res.json()) as Record<string, unknown>)
}

export interface LimitsEntry {
  limits: UsageLimit[]
  /** Quando os limites foram lidos com sucesso. */
  at?: number
  /** Última tentativa (com ou sem sucesso). */
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
      // Falhou: mantém os últimos limites lidos, marcando o erro.
      const prev = cache.get(accountId)
      cache.set(accountId, { limits: prev?.limits ?? [], at: prev?.at, triedAt: Date.now(), error: e.message })
    })
    .finally(() => inflight.delete(accountId))
  inflight.set(accountId, p)
  return p
}

/**
 * Atualiza os limites das contas que estão desatualizados (`force`: todos, respeitando o intervalo mínimo)
 * e avisa as janelas quando terminar.
 */
export async function refreshLimits(force = false): Promise<void> {
  const due = listAccountRecords().filter((a) => {
    const age = Date.now() - (cache.get(a.id)?.triedAt ?? 0)
    return age > (force ? MIN_INTERVAL_MS : FRESH_MS)
  })
  if (!due.length) return
  await Promise.all(due.map((a) => refreshOne(a.id)))
  notifyAccountsChanged()
}

export function forgetLimits(accountId: string) {
  cache.delete(accountId)
}
