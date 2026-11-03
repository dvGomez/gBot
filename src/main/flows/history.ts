import type { FlowRun } from '@shared/types'
import { botFlow, listRuns } from './store'

/**
 * Histórico das rotinas de um bot em texto, para ele responder na conversa sobre o que fez ou encontrou
 * (ferramentas `routine_history` e `routine_run`).
 */

const when = (ms?: number) => (ms ? new Date(ms).toLocaleString('sv-SE').slice(0, 16) : '?')
const clip = (text: string, max: number) => {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
const STATUS: Record<FlowRun['status'], string> = { running: 'rodando', done: 'concluída', error: 'com erro', stopped: 'parada' }

function runsOf(botId: string): FlowRun[] {
  const flow = botFlow(botId)
  return flow ? listRuns(flow.id) : []
}

export function routineRunsText(botId: string, limit: number, routine?: string): string {
  const key = routine?.trim().toLowerCase()
  const runs = runsOf(botId)
    .filter((r) => !key || r.triggerLabel.toLowerCase().includes(key))
    .slice(0, limit)
  if (!runs.length) return key ? `Nenhuma execução da rotina "${routine}".` : 'Nenhuma execução de rotina ainda.'
  return runs
    .map((r) => {
      const last = [...r.steps].reverse().find((s) => s.output || s.error || s.chosen)
      const summary = last ? clip(last.error ?? last.chosen ?? last.output ?? '', 240).replace(/\s+/g, ' ') : ''
      return `- ${r.id} | ${when(r.startedAt)} | rotina "${r.triggerLabel}" | ${STATUS[r.status]} | ${r.trigger === 'manual' ? 'manual' : 'agendada'}${summary ? ` | ${summary}` : ''}`
    })
    .join('\n')
}

export function routineRunText(botId: string, runId: string): string {
  const run = runsOf(botId).find((r) => r.id === runId)
  if (!run) return 'Execução não encontrada entre as suas rotinas. Veja os ids com routine_history.'
  return [
    `Rotina "${run.triggerLabel}" · ${run.trigger === 'manual' ? 'manual' : 'agendada'} · ${STATUS[run.status]}`,
    `Início ${when(run.startedAt)} · fim ${when(run.finishedAt)}`,
    ...run.steps.map((s, i) =>
      [
        `\n${i + 1}. ${s.label} (${s.status})`,
        s.chosen ? `Escolha: ${s.chosen}${s.note ? ` · comentário: ${s.note}` : ''}` : '',
        s.error ? `Erro: ${s.error}` : '',
        s.output ? `Resultado:\n${clip(s.output, 6000)}` : '',
        s.files?.length ? `Arquivos: ${s.files.map((f) => f.path).join(', ')}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    )
  ].join('\n')
}
