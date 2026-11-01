import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { notifyAccountsChanged } from '../claude-code/accounts'

/**
 * Contas ChatGPT conectadas ao gBot pelo Codex. Cada conta tem a própria pasta de perfil (`CODEX_HOME`), com login
 * separado do `~/.codex` do usuário; a conta ativa é a que atende o que usa o provedor Codex.
 */
export interface CodexAccountRecord {
  id: string
  /** Apelido dado pelo usuário; sem ele, aparece o e-mail. */
  name?: string
  createdAt: number
}

interface AccountsFile {
  active?: string
  accounts: CodexAccountRecord[]
}

const VALID_ID = /^[a-z0-9-]+$/

const dataFile = () => {
  const dir = join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'codex-accounts.json')
}

/** Pasta de perfil do Codex da conta. */
export function accountDir(id: string): string {
  if (!VALID_ID.test(id)) throw new Error('Conta inválida.')
  const dir = join(app.getPath('userData'), 'codex-accounts', id)
  mkdirSync(dir, { recursive: true })
  return dir
}

export interface CodexAuth {
  accessToken: string
  accountId?: string
  /** Fim da validade do token de acesso (ms). */
  expiresAt?: number
}

export interface CodexProfileInfo {
  userId: string
  accountId?: string
  email?: string
  /** Plano do ChatGPT (ex.: plus, pro, team). */
  plan?: string
}

const jwt = (token?: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
}

function readAuthFile(dir: string): { tokens?: { id_token?: string; access_token?: string; account_id?: string } } | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, 'auth.json'), 'utf8'))
  } catch {
    return undefined
  }
}

/** Token de acesso da conta (login com ChatGPT), para ler os limites. */
export function codexAuth(dir: string): CodexAuth | undefined {
  const tokens = readAuthFile(dir)?.tokens
  if (!tokens?.access_token) return undefined
  const exp = Number(jwt(tokens.access_token)?.exp)
  return { accessToken: tokens.access_token, accountId: tokens.account_id, expiresAt: exp ? exp * 1000 : undefined }
}

/** Conta logada no perfil, pelo `id_token` que o Codex guarda em `auth.json`. */
export function profileInfo(dir: string): CodexProfileInfo | undefined {
  const tokens = readAuthFile(dir)?.tokens
  const claims = jwt(tokens?.id_token)
  if (!claims?.sub) return undefined
  const auth = (claims['https://api.openai.com/auth'] ?? {}) as Record<string, unknown>
  return {
    userId: String(auth.chatgpt_user_id ?? claims.sub),
    accountId: tokens?.account_id ?? (auth.chatgpt_account_id ? String(auth.chatgpt_account_id) : undefined),
    email: claims.email ? String(claims.email) : undefined,
    plan: auth.chatgpt_plan_type ? String(auth.chatgpt_plan_type) : undefined
  }
}

function read(): AccountsFile {
  try {
    return JSON.parse(readFileSync(dataFile(), 'utf8')) as AccountsFile
  } catch {
    return { accounts: [] }
  }
}

function write(data: AccountsFile) {
  const tmp = `${dataFile()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, dataFile())
}

export const listAccountRecords = (): CodexAccountRecord[] => read().accounts

export const getAccountRecord = (id: string) => read().accounts.find((a) => a.id === id)

/** Conta ativa; vazio quando nenhuma está conectada. */
export function activeAccountId(): string {
  const { active, accounts } = read()
  return accounts.find((a) => a.id === active)?.id ?? accounts[0]?.id ?? ''
}

export function setActiveAccount(id: string) {
  const data = read()
  if (!data.accounts.some((a) => a.id === id)) throw new Error('Conta não encontrada.')
  write({ ...data, active: id })
  notifyAccountsChanged()
}

export const newAccountId = () => randomUUID()

export function addAccountRecord(id: string) {
  const data = read()
  write({ active: data.accounts.length ? data.active : id, accounts: [...data.accounts.filter((a) => a.id !== id), { id, createdAt: Date.now() }] })
  notifyAccountsChanged()
}

export function renameAccount(id: string, name: string) {
  const data = read()
  write({ ...data, accounts: data.accounts.map((a) => (a.id === id ? { ...a, name: name.trim() || undefined } : a)) })
  notifyAccountsChanged()
}

export function removeAccountRecord(id: string) {
  const data = read()
  const accounts = data.accounts.filter((a) => a.id !== id)
  write({ active: data.active === id ? accounts[0]?.id : data.active, accounts })
  discardProfile(id)
  notifyAccountsChanged()
}

/** Apaga a pasta de perfil de uma conta (login, histórico e configurações dela). */
export function discardProfile(id: string) {
  if (!VALID_ID.test(id)) return
  rmSync(join(app.getPath('userData'), 'codex-accounts', id), { recursive: true, force: true })
}
