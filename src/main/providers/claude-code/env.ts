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

/**
 * Variáveis herdadas que mudariam a conta usada (`ANTHROPIC_*`) ou que sessões do Claude Code injetam
 * nos processos filhos (`CLAUDE*`). O gBot nunca as repassa.
 */
const INHERITED_AUTH = /^(ANTHROPIC_|CLAUDE|AI_AGENT$)/

const FALLBACK_BINS = ['.local/bin/claude', '.claude/local/claude', '.npm-global/bin/claude'].map((p) => join(homedir(), p))
const FALLBACK_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

let cached: Promise<ClaudeEnv> | undefined

export function resolveClaudeEnv(): Promise<ClaudeEnv> {
  cached ??= (async () => {
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
    return { bin, env }
  })()
  cached.catch(() => (cached = undefined))
  return cached
}

/** Roda um subcomando curto do Claude Code (ex.: `--version`, `auth status`) no perfil do gBot. */
export async function runClaude(args: string[], timeoutMs = 15_000): Promise<string> {
  const { bin, env } = await resolveClaudeEnv()
  return new Promise((resolve, reject) => {
    execFile(bin, args, { env, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error && !stdout) reject(new Error(stderr.trim() || error.message))
      else resolve(stdout.trim())
    })
  })
}
