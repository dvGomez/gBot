import { execFile } from 'node:child_process'

const MARK = '__GBOT_OUT__'

/**
 * Executa um comando no shell do usuário como um terminal faria (login + interativo), para enxergar o
 * mesmo PATH: apps abertos pelo Finder não herdam o ambiente do terminal, e o PATH costuma ser
 * definido no `.zshrc`. A saída vem entre marcadores para ignorar mensagens impressas pelo `.zshrc`.
 */
export function runInUserShell(command: string, timeoutMs = 10_000): Promise<string> {
  const shell = process.env.SHELL || '/bin/zsh'
  const script = `printf '${MARK}'; ${command}; printf '${MARK}'`
  return new Promise((resolve, reject) => {
    execFile(shell, ['-ilc', script], { timeout: timeoutMs }, (error, stdout, stderr) => {
      const parts = stdout.split(MARK)
      if (error && parts.length < 3) reject(new Error(stderr.trim() || error.message))
      else resolve((parts[1] ?? '').trim())
    })
  })
}
