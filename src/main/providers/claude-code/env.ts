import { runInLoginShell } from '../shell'

export interface ClaudeEnv {
  /** Caminho absoluto do executável `claude`. */
  bin: string
  /** PATH do shell de login (o app aberto pelo Finder não herda o do terminal). */
  path: string
}

let cached: Promise<ClaudeEnv> | undefined

/** Localiza o Claude Code uma vez por execução do app. */
export function resolveClaudeEnv(): Promise<ClaudeEnv> {
  cached ??= (async () => {
    const [bin, path] = await Promise.all([runInLoginShell('command -v claude'), runInLoginShell('printf %s "$PATH"')])
    if (!bin) throw new Error('Claude Code não encontrado')
    return { bin, path }
  })()
  cached.catch(() => (cached = undefined))
  return cached
}
