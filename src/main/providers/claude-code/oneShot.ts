import type { TokenUsage } from '@shared/types'
import { runClaude } from './env'
import { recordTurn, usageByModel, type UsageTag } from './session'
import { workspaceDir } from './sessions'

/**
 * Pergunta avulsa e barata: sem ferramentas, sem sessão salva e na pasta padrão do gBot (para não carregar
 * o CLAUDE.md de nenhum projeto). Serve para respostas curtas, como escolher uma opção ou sugerir um nome.
 * Com `jsonSchema`, a resposta vem validada nesse formato em `structured`. O prompt vai pela entrada padrão.
 */
export async function askOnce(
  prompt: string,
  model: string | undefined,
  tag: UsageTag,
  timeoutMs = 120_000,
  jsonSchema?: object
): Promise<{ text: string; usage: TokenUsage; structured?: unknown }> {
  const args = [
    '-p',
    ...(model && model !== 'default' ? ['--model', model] : []),
    '--tools', '',
    '--no-session-persistence',
    '--output-format', 'json',
    ...(jsonSchema ? ['--json-schema', JSON.stringify(jsonSchema)] : [])
  ]
  const out = await runClaude(args, { timeoutMs, cwd: workspaceDir(), input: prompt })
  let res: { result?: string; is_error?: boolean; structured_output?: unknown } & Parameters<typeof usageByModel>[0]
  try {
    res = JSON.parse(out)
  } catch {
    throw new Error('O Claude Code não devolveu uma resposta válida.')
  }
  // Processo de um turno só: o acumulado é o gasto da pergunta.
  const usage = recordTurn(usageByModel(res), tag)
  if (res.is_error) throw new Error(res.result || 'O Claude Code não conseguiu responder.')
  return { text: (res.result ?? '').trim(), usage, structured: res.structured_output }
}
