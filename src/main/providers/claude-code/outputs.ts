import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ChatEvent, ChatFile } from '@shared/types'

/** Pastas que não valem a pena olhar (dependências, builds, git…). */
const SKIP = new Set(['node_modules', 'dist', 'out', 'build', '.git'])
const MAX_DEPTH = 2
const MAX_FILES = 12

/** Arquivos da pasta criados ou alterados desde `since` (até 2 níveis de subpasta), do mais novo ao mais antigo. */
function changedFiles(dir: string, since: number): ChatFile[] {
  const found: (ChatFile & { mtime: number })[] = []
  const walk = (current: string, depth: number) => {
    let names: string[]
    try {
      names = readdirSync(current)
    } catch {
      return
    }
    for (const name of names) {
      if (name.startsWith('.') || SKIP.has(name)) continue
      const path = join(current, name)
      try {
        const st = statSync(path)
        if (st.isDirectory()) {
          if (depth < MAX_DEPTH) walk(path, depth + 1)
        } else if (st.isFile() && st.mtimeMs >= since) {
          found.push({ path, name, size: st.size, mtime: st.mtimeMs })
        }
      } catch {
        // arquivo sumiu no meio da leitura
      }
    }
  }
  walk(dir, 0)
  return found
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_FILES)
    .map(({ path, name, size }) => ({ path, name, size }))
}

/**
 * Embrulha o `emit` de um turno: quando a resposta termina, anexa à mensagem os arquivos que apareceram ou mudaram
 * na pasta de trabalho durante ela (inclusive os criados por comandos, como um PDF convertido).
 */
export function withOutputFiles(cwd: string, emit: (ev: ChatEvent) => void): (ev: ChatEvent) => void {
  // Margem para arquivos gravados no mesmo segundo em que o turno começou.
  const since = Date.now() - 1000
  return (ev) => {
    if (ev.type === 'done') {
      const files = changedFiles(cwd, since)
      if (files.length) emit({ type: 'files', files })
    }
    emit(ev)
  }
}
