import { dirname } from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { requestApproval } from '../../approvals'

/**
 * Pedidos de permissão do Claude Code (`--permission-prompt-tool`): criar e editar arquivos na pasta de trabalho
 * já é liberado pelo modo `acceptEdits`; o resto (comandos, arquivos fora da pasta…) chega aqui e vira um cartão
 * de aprovação no chat.
 */
export const APPROVE_TOOL = 'mcp__gbot__approve'

/** Comando com mais de um programa (encadeado, com pipe, redirecionamento ou substituição). */
const COMPOUND = /&&|\|\||[;|`<>]|\$\(/

const programOf = (command: string) =>
  command
    .trim()
    .split(/\s+/)
    .find((w) => !/^\w+=/.test(w)) ?? ''

const filePathOf = (input: Record<string, unknown>) =>
  String(input.file_path ?? input.notebook_path ?? input.path ?? '')

/**
 * O que "Sempre permitir" libera. Um comando simples libera o programa (ex.: `Bash:textutil`); um comando composto
 * só vale exatamente igual, para uma aprovação não abrir caminho para outro programa no meio.
 */
function ruleFor(tool: string, input: Record<string, unknown>): { rule: string; label: string } {
  if (tool === 'Bash') {
    const command = String(input.command ?? '').trim()
    if (COMPOUND.test(command)) return { rule: `Bash=${command}`, label: 'Sempre permitir este comando' }
    const program = programOf(command)
    return { rule: `Bash:${program}`, label: `Sempre permitir ${program}` }
  }
  const path = filePathOf(input)
  if (path) {
    const dir = dirname(path)
    return { rule: `${tool}:${dir}`, label: `Sempre em ${dir.split(/[\\/]/).pop() || dir}` }
  }
  return { rule: tool, label: `Sempre permitir ${tool}` }
}

const VERBS: Record<string, string> = {
  Write: 'Criar ou substituir',
  Edit: 'Editar',
  MultiEdit: 'Editar',
  NotebookEdit: 'Editar',
  Read: 'Ler'
}

function describe(tool: string, input: Record<string, unknown>): string {
  if (tool === 'Bash') {
    const command = String(input.command ?? '').trim()
    return command.length > 400 ? `${command.slice(0, 400)}…` : command
  }
  const path = filePathOf(input)
  if (path) return `${VERBS[tool] ?? tool} ${path}`
  const json = JSON.stringify(input)
  return `${tool} ${json.length > 300 ? `${json.slice(0, 300)}…` : json}`
}

export function registerApprovalTool(server: McpServer, caller: { readonly conversationId: string; readonly callerName: string; readonly signal?: AbortSignal }) {
  server.registerTool(
    'approve',
    {
      description: 'Uso interno do gBot: decide pedidos de permissão do Claude Code. Não chame esta ferramenta.',
      inputSchema: {
        tool_name: z.string(),
        input: z.record(z.string(), z.unknown()),
        tool_use_id: z.string().optional()
      }
    },
    async ({ tool_name, input }) => {
      const { rule, label } = ruleFor(tool_name, input)
      const decision = await requestApproval({
        kind: 'tool',
        conversationId: caller.conversationId,
        requester: caller.callerName,
        host: rule,
        action: describe(tool_name, input),
        alwaysLabel: label
      }, caller.signal)
      const result =
        decision === 'deny'
          ? {
              behavior: 'deny',
              message: 'O usuário não permitiu esta ação. Não tente de novo nem contorne; explique o que faria ou peça outra forma.'
            }
          : { behavior: 'allow', updatedInput: input }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )
}
