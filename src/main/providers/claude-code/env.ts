import { execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { runInUserShell } from '../shell'

export interface ClaudeEnv {
  /** Caminho absoluto do executável `claude`. */
  bin: string
  /** Ambiente usado em todo processo do Claude Code aberto pelo gBot. */
  env: NodeJS.ProcessEnv
}

/**
 * Perfil do Claude Code exclusivo do gBot. Tem login, configurações e histórico próprios, separado do
 * `~/.claude` do usuário (que pode apontar para outra conta, um gateway corporativo etc.).
 */
export function profileDir(): string {
  const dir = join(app.getPath('userData'), 'claude-profile')
  mkdirSync(dir, { recursive: true })
  return dir
}

/*
 * `CLAUDE_CODE_DISABLE_AUTO_MEMORY`: a memória automática do Claude Code fica numa pasta por diretório de trabalho e
 * vale para TODOS os bots que trabalham ali, sem aparecer no gBot. O gBot tem a própria memória, por bot e por fluxo,
 * visível e editável; por isso a do Claude Code fica desligada.
 */

/**
 * Variáveis herdadas que mudariam a conta usada (`ANTHROPIC_*`) ou que sessões do Claude Code injetam
 * nos processos filhos (`CLAUDE*`). O gBot nunca as repassa.
 */
const INHERITED_AUTH = /^(ANTHROPIC_|CLAUDE|AI_AGENT$)/

const FALLBACK_BINS = ['.local/bin/claude', '.claude/local/claude', '.npm-global/bin/claude'].map((p) => join(homedir(), p))
const FALLBACK_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

/**
 * No Windows não há shell de login para consultar: vale o `claude.exe` do instalador nativo (~/.local/bin)
 * ou o primeiro que estiver no PATH.
 */
function findWindowsClaude(): string {
  const dirs = [join(homedir(), '.local', 'bin'), ...(process.env.PATH ?? '').split(';').filter(Boolean)]
  return dirs.map((d) => join(d, 'claude.exe')).find((p) => existsSync(p)) ?? ''
}

let cached: Promise<ClaudeEnv> | undefined

export function resolveClaudeEnv(): Promise<ClaudeEnv> {
  cached ??= (async () => {
    if (process.platform === 'win32') {
      const bin = findWindowsClaude()
      if (!bin) throw new Error('Claude Code não encontrado')
      // O PATH do Windows já vem certo (e a chave é "Path"): só tira as variáveis de conta.
      const env: NodeJS.ProcessEnv = {}
      for (const [k, v] of Object.entries(process.env)) if (!INHERITED_AUTH.test(k)) env[k] = v
      env.CLAUDE_CONFIG_DIR = profileDir()
      env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
      return { bin, env }
    }
    let bin = ''
    let path = ''
    try {
      ;[bin, path] = await Promise.all([runInUserShell('command -v claude'), runInUserShell('printf %s "$PATH"')])
    } catch {
      // shell lento ou com erro: segue com os caminhos padrão
    }
    if (!bin || !existsSync(bin)) bin = FALLBACK_BINS.find((p) => existsSync(p)) ?? ''
    if (!bin) throw new Error('Claude Code não encontrado')

    const env: NodeJS.ProcessEnv = {}
    for (const [k, v] of Object.entries(process.env)) if (!INHERITED_AUTH.test(k)) env[k] = v
    env.PATH = path || [join(homedir(), '.local/bin'), ...FALLBACK_PATH].join(':')
    env.CLAUDE_CONFIG_DIR = profileDir()
    env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
    return { bin, env }
  })()
  cached.catch(() => (cached = undefined))
  return cached
}

/** Roda um subcomando curto do Claude Code (ex.: `--version`, `auth status`) no perfil do gBot. */
export async function runClaude(args: string[], timeoutMs = 15_000, cwd?: string): Promise<string> {
  const { bin, env } = await resolveClaudeEnv()
  return new Promise((resolve, reject) => {
    execFile(bin, args, { env, cwd, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error && !stdout) reject(new Error(stderr.trim() || error.message))
      else resolve(stdout.trim())
    })
  })
}
