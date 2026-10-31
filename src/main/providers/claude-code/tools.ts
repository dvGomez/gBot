import { basename } from 'node:path'

type Input = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const file = (input: Input) => basename(str(input.file_path) || str(input.notebook_path) || str(input.path))

/** Frase curta em português descrevendo o uso de uma ferramenta do Claude Code. */
export function describeTool(name: string, input: Input = {}): string {
  switch (name) {
    case 'Bash':
      return str(input.description) || `Executou \`${clip(str(input.command) || 'comando')}\``
    case 'Read':
      return file(input) ? `Leu ${file(input)}` : 'Lendo arquivo'
    case 'Write':
      return file(input) ? `Criou ${file(input)}` : 'Criando arquivo'
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return file(input) ? `Editou ${file(input)}` : 'Editando arquivo'
    case 'Glob':
    case 'Grep':
      return input.pattern ? `Buscou "${clip(str(input.pattern), 40)}"` : 'Buscando arquivos'
    case 'WebSearch':
      return input.query ? `Pesquisou "${clip(str(input.query), 50)}"` : 'Pesquisando na web'
    case 'WebFetch':
      try {
        return `Abriu ${new URL(str(input.url)).hostname}`
      } catch {
        return 'Abrindo página'
      }
    case 'TodoWrite':
      return 'Atualizou a lista de tarefas'
    case 'Task':
    case 'Agent':
      return input.description ? `Delegou: ${clip(str(input.description))}` : 'Delegou a um subagente'
    case 'Skill':
      return input.skill ? `Usou a skill ${str(input.skill)}` : 'Usou uma skill'
  }
  const mcp = name.match(/^mcp__(.+?)__(.+)$/)
  if (mcp) return `Usou ${mcp[2]} (${mcp[1]})`
  return `Usou ${name}`
}
