import { execFile } from 'node:child_process'

/**
 * Executa um comando pelo shell de login do usuário. Apps abertos pelo Finder não herdam o PATH
 * do terminal, então `claude`, `node` etc. só são encontrados via `zsh -lc`.
 */
export function runInLoginShell(command: string, timeoutMs = 10_000): Promise<string> {
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((resolve, reject) => {
    execFile(shell, ['-lc', command], { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message))
      else resolve(stdout.trim())
    })
  })
}
