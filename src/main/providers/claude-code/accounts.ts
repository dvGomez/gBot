import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

/**
 * Contas Claude conectadas ao gBot. Cada conta tem a própria pasta de perfil do Claude Code (`CLAUDE_CONFIG_DIR`),
 * com login separado; a conta ativa é a que atende as conversas, bots e fluxos. O histórico das sessões
 * (`projects/`) é um só para todas: as pastas das outras contas apontam para o do perfil original, e assim
 * qualquer conversa continua com qualquer conta.
 */
export interface AccountRecord {
  id: string
  /** Apelido dado pelo usuário; sem ele, aparece o e-mail. */
  name?: string
  createdAt: number
}

interface AccountsFile {
  active?: string
  accounts: AccountRecord[]
}

/** A primeira conta usa o perfil original do gBot, que também guarda o histórico. */
const DEFAULT_ID = 'default'
const VALID_ID = /^[a-z0-9-]+$/

const root = () => app.getPath('userData')

const dataFile = () => {
  const dir = join(root(), 'data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'claude-accounts.json')
}

/** Pasta do histórico de sessões, comum a todas as contas. */
export function historyDir(): string {
  const dir = join(root(), 'claude-profile', 'projects')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Liga `projects/` do perfil ao histórico comum (junção no Windows, que não exige administrador). */
function linkHistory(dir: string) {
  const link = join(dir, 'projects')
  try {
    lstatSync(link)
    return
  } catch {
    // ainda não existe
  }
  symlinkSync(historyDir(), link, 'junction')
}

/** Pasta de perfil do Claude Code da conta. */
export function accountDir(id: string): string {
  if (!VALID_ID.test(id)) throw new Error('Conta inválida.')
  const dir = id === DEFAULT_ID ? join(root(), 'claude-profile') : join(root(), 'claude-accounts', id)
  mkdirSync(dir, { recursive: true })
  if (id !== DEFAULT_ID) linkHistory(dir)
  return dir
}

export interface ProfileInfo {
  accountUuid: string
  organizationUuid?: string
  email?: string
  organization?: string
  /** Plano da assinatura (ex.: pro, max, team). */
  plan?: string
}

/** Conta logada no perfil, pelo que o Claude Code gravou em `.claude.json` e `.credentials.json`. */
export function profileInfo(dir: string): ProfileInfo | undefined {
  let account: Record<string, unknown> | undefined
  try {
    account = JSON.parse(readFileSync(join(dir, '.claude.json'), 'utf8')).oauthAccount
  } catch {
    return undefined
  }
  if (!account?.accountUuid) return undefined
  let plan: string | undefined
  try {
    plan = JSON.parse(readFileSync(join(dir, '.credentials.json'), 'utf8')).claudeAiOauth?.subscriptionType
  } catch {
    // no macOS as credenciais ficam no Keychain: o plano sai do tipo da organização
  }
  plan ??= String(account.organizationType ?? '').replace(/^claude_/, '') || undefined
  return {
    accountUuid: String(account.accountUuid),
    organizationUuid: account.organizationUuid ? String(account.organizationUuid) : undefined,
    email: account.emailAddress ? String(account.emailAddress) : undefined,
    organization: account.organizationName ? String(account.organizationName) : undefined,
    plan
  }
}

function read(): AccountsFile {
  try {
    return JSON.parse(readFileSync(dataFile(), 'utf8')) as AccountsFile
  } catch {
    // Primeira vez com contas: o login que já existia no perfil vira a primeira conta.
    const migrated: AccountsFile = profileInfo(accountDir(DEFAULT_ID))
      ? { active: DEFAULT_ID, accounts: [{ id: DEFAULT_ID, createdAt: Date.now() }] }
      : { accounts: [] }
    write(migrated)
    return migrated
  }
}

function write(data: AccountsFile) {
  const tmp = `${dataFile()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, dataFile())
}

/** Avisa as janelas que a lista, a conta ativa ou os limites mudaram. */
export function notifyAccountsChanged() {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('accounts:changed')
}

export const listAccountRecords = (): AccountRecord[] => read().accounts

export function getAccountRecord(id: string): AccountRecord | undefined {
  return read().accounts.find((a) => a.id === id)
}

/** Conta ativa; sem nenhuma conectada, o perfil original (onde o primeiro login acontece). */
export function activeAccountId(): string {
  const { active, accounts } = read()
  return accounts.find((a) => a.id === active)?.id ?? accounts[0]?.id ?? DEFAULT_ID
}

export function setActiveAccount(id: string) {
  const data = read()
  if (!data.accounts.some((a) => a.id === id)) throw new Error('Conta não encontrada.')
  write({ ...data, active: id })
  notifyAccountsChanged()
}

/** Id para uma conta nova: o perfil original, se estiver livre, senão uma pasta nova. */
export function newAccountId(): string {
  const free = !getAccountRecord(DEFAULT_ID) && !profileInfo(accountDir(DEFAULT_ID))
  return free ? DEFAULT_ID : randomUUID()
}

export function addAccountRecord(id: string) {
  const data = read()
  const accounts = [...data.accounts.filter((a) => a.id !== id), { id, createdAt: Date.now() }]
  // A primeira conta conectada já entra como ativa.
  write({ active: data.accounts.length ? data.active : id, accounts })
  notifyAccountsChanged()
}

export function renameAccount(id: string, name: string) {
  const data = read()
  write({ ...data, accounts: data.accounts.map((a) => (a.id === id ? { ...a, name: name.trim() || undefined } : a)) })
  notifyAccountsChanged()
}

/** Tira a conta da lista. A pasta do perfil original fica (ela guarda o histórico); as outras são apagadas. */
export function removeAccountRecord(id: string) {
  const data = read()
  const accounts = data.accounts.filter((a) => a.id !== id)
  write({ active: data.active === id ? accounts[0]?.id : data.active, accounts })
  if (id !== DEFAULT_ID) discardProfile(id)
  notifyAccountsChanged()
}

/** Apaga a pasta de perfil de uma conta extra, desfazendo antes a ligação com o histórico comum. */
export function discardProfile(id: string) {
  if (id === DEFAULT_ID || !VALID_ID.test(id)) return
  const dir = join(root(), 'claude-accounts', id)
  const link = join(dir, 'projects')
  try {
    unlinkSync(link)
  } catch {
    // sem ligação
  }
  // Se a ligação não saiu, apagar a pasta poderia levar o histórico comum junto: melhor deixar a pasta.
  try {
    lstatSync(link)
    return
  } catch {
    rmSync(dir, { recursive: true, force: true })
  }
}
