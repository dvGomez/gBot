import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { runInUserShell } from '../shell'
import { accountDir, activeAccountId } from './accounts'

export interface CodexEnv {
  /** Caminho absoluto do executável `codex`. */
  bin: string
  /** Ambiente de todo processo do Codex aberto pelo gBot (com o perfil da conta em `CODEX_HOME`). */
  env: NodeJS.ProcessEnv
  accountId: string
}

/**
 * Variáveis herdadas que mudariam a conta usada (chave de API, outro `CODEX_HOME`). O gBot nunca as repassa: cada
 * conta tem o próprio perfil, separado do `~/.codex` do usuário.
 */
const INHERITED_AUTH = /^(OPENAI_API_KEY|CODEX_)/

const FALLBACK_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

/** O mais novo dos executáveis encontrados (o app desktop guarda uma pasta por versão). */
function newest(paths: string[]): string {
  return paths.filter((p) => existsSync(p)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? ''
}

/** O `codex.exe` que vem dentro do app desktop do Codex (plano B quando o CLI não está instalado). */
function desktopAppBins(): string[] {
  const root = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin')
  try {
    return readdirSync(root).map((d) => join(root, d, 'codex.exe'))
  } catch {
    return []
  }
}

/**
 * No Windows: o CLI no PATH ou o binário nativo do pacote npm (o `codex.cmd` do npm não pode ser aberto direto),
 * depois o do app desktop.
 */
function findWindowsCodex(): string {
  const dirs = [join(homedir(), '.local', 'bin'), ...(process.env.PATH ?? '').split(';').filter(Boolean)]
  const onPath = dirs.map((d) => join(d, 'codex.exe')).find((p) => existsSync(p))
  if (onPath) return onPath
  const npm = join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@openai', 'codex', 'vendor', 'x86_64-pc-windows-msvc', 'codex', 'codex.exe')
  return existsSync(npm) ? npm : newest(desktopAppBins())
}

let cached: Promise<Omit<CodexEnv, 'accountId'>> | undefined

function baseEnv(): Promise<Omit<CodexEnv, 'accountId'>> {
  cached ??= (async () => {
    const env: NodeJS.ProcessEnv = {}
    for (const [k, v] of Object.entries(process.env)) if (!INHERITED_AUTH.test(k)) env[k] = v
    if (process.platform === 'win32') {
      const bin = findWindowsCodex()
      if (!bin) throw new Error('Codex não encontrado')
      return { bin, env }
    }
    let bin = ''
    let path = ''
    try {
      ;[bin, path] = await Promise.all([runInUserShell('command -v codex'), runInUserShell('printf %s "$PATH"')])
    } catch {
      // shell lento ou com erro: segue com os caminhos padrão
    }
    const fallbacks = [
      ...FALLBACK_PATH.map((d) => join(d, 'codex')),
      join(homedir(), '.npm-global/bin/codex'),
      '/Applications/Codex.app/Contents/Resources/codex'
    ]
    if (!bin || !existsSync(bin)) bin = fallbacks.find((p) => existsSync(p)) ?? ''
    if (!bin) throw new Error('Codex não encontrado')
    env.PATH = path || [join(homedir(), '.local/bin'), ...FALLBACK_PATH].join(':')
    return { bin, env }
  })()
  cached.catch(() => (cached = undefined))
  return cached
}

/** Executável e ambiente do Codex no perfil da conta (por padrão, a ativa; sem conta, só serve para `--version`). */
export async function resolveCodexEnv(accountId = activeAccountId()): Promise<CodexEnv> {
  const { bin, env } = await baseEnv()
  return { bin, env: accountId ? { ...env, CODEX_HOME: accountDir(accountId) } : env, accountId }
}

/** Roda um subcomando curto do Codex (ex.: `--version`, `login status`) no perfil da conta. */
export async function runCodex(args: string[], { timeoutMs = 15_000, accountId }: { timeoutMs?: number; accountId?: string } = {}): Promise<string> {
  const { bin, env } = await resolveCodexEnv(accountId)
  return new Promise((resolve, reject) => {
    execFile(bin, args, { env, timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      const out = `${stdout}${stderr}`.trim()
      if (error && !out) reject(new Error(error.message))
      else resolve(out)
    })
  })
}
