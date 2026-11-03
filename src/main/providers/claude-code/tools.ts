import { basename } from 'node:path'

type Input = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const file = (input: Input) => basename(str(input.file_path) || str(input.notebook_path) || str(input.path))

/** Nomes das ferramentas do gBot como o Claude Code as vê (`mcp__<servidor>__<ferramenta>`). */
export const LIST_BOTS_TOOL = 'mcp__gbot__list_bots'
export const ASK_BOT_TOOL = 'mcp__gbot__ask_bot'
/** Perguntas com opções ao usuário: viram um cartão no chat, então não aparecem na lista de ferramentas. */
export const ASK_USER_TOOL = 'mcp__gbot__ask_user'

/** Ferramentas internas do Claude Code que não interessam ao usuário (não aparecem no chat). */
/** Plano proposto pelo arquiteto: vira um cartão no chat. */
export const PROPOSE_PLAN_TOOL = 'mcp__gbot__propose_plan'
/** Guia do que existe no gBot e de como montar um plano (para criar ou editar bots, rotinas, especializações e projetos). */
export const GBOT_OVERVIEW_TOOL = 'mcp__gbot__gbot_overview'
export const HIDDEN_TOOLS = new Set(['ToolSearch', ASK_USER_TOOL, PROPOSE_PLAN_TOOL])

/** Frase curta em português descrevendo o uso de uma ferramenta do Claude Code. */
export function describeTool(name: string, input: Input = {}): string {
  switch (name) {
    case LIST_BOTS_TOOL:
      return 'Viu a lista de bots'
    case GBOT_OVERVIEW_TOOL:
      return 'Viu os bots, especializações e projetos do gBot'
    case 'mcp__gbot__routine_history':
      return 'Viu o histórico das rotinas'
    case 'mcp__gbot__routine_run':
      return 'Viu os detalhes de uma execução'
    case 'mcp__gbot__save_lesson':
      return input.title ? `Aprendeu: ${clip(str(input.title), 50)}` : 'Guardando na memória'
    case 'mcp__gbot__browser_navigate':
      try {
        return `Abriu ${new URL(/^[a-z]+:\/\//i.test(str(input.url)) ? str(input.url) : `https://${str(input.url)}`).hostname.replace(/^www\./, '')}`
      } catch {
        return 'Abrindo site'
      }
    case 'mcp__gbot__browser_read':
      return 'Leu a página'
    case 'mcp__gbot__browser_click':
      return input.description ? `Clicou em ${clip(str(input.description), 40)}` : 'Clicando'
    case 'mcp__gbot__browser_type':
      return input.description ? `Digitou em ${clip(str(input.description), 40)}` : 'Digitando'
    case 'mcp__gbot__browser_press':
      return input.key ? `Apertou ${str(input.key)}` : 'Apertando tecla'
    case 'mcp__gbot__browser_screenshot':
      return 'Tirou print da página'
    case 'mcp__gbot__browser_tabs':
      return 'Viu as abas do navegador'
    case 'mcp__gbot__browser_upload':
      return Array.isArray(input.paths) && input.paths.length
        ? `Anexou ${clip(input.paths.map((p) => str(p).split(/[\\/]/).pop()).join(', '), 50)}`
        : 'Anexando arquivo'
    case 'mcp__gbot__browser_back':
      return 'Voltou uma página'
    case ASK_BOT_TOOL:
      return input.bot ? `Perguntou a ${str(input.bot)}` : 'Consultando um bot'
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
