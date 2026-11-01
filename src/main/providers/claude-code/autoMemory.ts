import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import type { AutoMemoryNote } from '@shared/types'
import { historyDir } from './accounts'

/**
 * Memória automática do Claude Code (antes de o gBot desligá-la): arquivos .md em
 * <perfil>/projects/<pasta de trabalho>/memory/, com um índice MEMORY.md. Não são mais lidos pelos bots,
 * mas ficam visíveis no gBot para você apagar ou trazer para a memória de um bot.
 */
function projectsDir() {
  return historyDir()
}

/** Separa o cabeçalho (`---` ... `---`) do texto. */
function parse(raw: string): { name: string; description: string; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const head = m?.[1] ?? ''
  const field = (k: string) => head.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? ''
  return { name: field('name'), description: field('description'), body: (m?.[2] ?? raw).trim() }
}

export function listAutoMemory(): AutoMemoryNote[] {
  const root = projectsDir()
  if (!existsSync(root)) return []
  const out: AutoMemoryNote[] = []
  for (const project of readdirSync(root)) {
    const dir = join(root, project, 'memory')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md') || f === 'MEMORY.md') continue
      const path = join(dir, f)
      try {
        const { name, description, body } = parse(readFileSync(path, 'utf8'))
        out.push({ path, name: name || f.replace(/\.md$/, ''), description, body, folder: project })
      } catch {
        // arquivo ilegível: ignora
      }
    }
  }
  return out
}

/** Apaga uma nota e a linha dela no índice MEMORY.md. Só aceita arquivos dentro das pastas de memória do perfil. */
export function removeAutoMemory(path: string) {
  const rel = relative(projectsDir(), path)
  if (
    rel.startsWith('..') ||
    basename(dirname(path)) !== 'memory' ||
    !path.endsWith('.md') ||
    basename(path) === 'MEMORY.md'
  ) {
    throw new Error('Arquivo fora da memória do Claude Code.')
  }
  rmSync(path, { force: true })
  const index = join(dirname(path), 'MEMORY.md')
  if (existsSync(index)) {
    const name = basename(path)
    const lines = readFileSync(index, 'utf8').split('\n')
    writeFileSync(index, lines.filter((l) => !l.includes(`(${name})`)).join('\n'))
  }
}
