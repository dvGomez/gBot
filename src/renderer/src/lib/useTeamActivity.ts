import { t as tr, locale } from '@/i18n'
import { useMemo } from 'react'
import type { AvatarMood, FlowRun } from '@shared/types'
import { timeAgo } from '@/lib/format'
import { isLive } from '@/lib/useFlowRuns'
import { useApp } from '@/state/app'

export interface BotActivity {
  botId: string
  state: 'working' | 'waiting' | 'sleeping'
  mood: AvatarMood
  /** O que está fazendo (ou quando trabalhou pela última vez). */
  text: string
  /** Onde clicar leva: a rotina ou a conversa da atividade; senão, a página do bot. */
  target: { kind: 'flow' | 'conversation' | 'bot'; id: string }
}

/**
 * O que cada bot está fazendo agora, a partir do que o app já sabe: execuções ao vivo das rotinas dele
 * (inclusive esperando confirmação), a conversa respondendo (inclusive bots consultados por outro) e
 * pedidos de aprovação.
 */
export function useTeamActivity(runs: Record<string, FlowRun[]>): Map<string, BotActivity> {
  const app = useApp()

  return useMemo(() => {
    const out = new Map<string, BotActivity>()
    const set = (a: BotActivity) => {
      const prev = out.get(a.botId)
      // "esperando você" vence "trabalhando", que vence "dormindo"
      const rank = { waiting: 2, working: 1, sleeping: 0 }
      if (!prev || rank[a.state] > rank[prev.state]) out.set(a.botId, a)
    }
    const byName = (name: string) => app.bots.find((b) => b.name.toLowerCase() === name.trim().toLowerCase())

    // Rotinas rodando: toda etapa roda como o bot dono da rotina
    for (const list of Object.values(runs)) {
      const run = list[0]
      if (!run || !isLive(run)) continue
      const flow = app.flows.find((f) => f.id === run.flowId)
      if (!flow || !app.getBot(flow.botId)) continue
      const target = { kind: 'flow' as const, id: run.flowId }
      // Caixinha de confirmação parada esperando a sua escolha
      const waiting = run.steps.find((s) => s.status === 'waiting')
      if (waiting) {
        set({ botId: flow.botId, state: 'waiting', mood: 'attention', text: tr('Esperando sua confirmação em "{0}"', flow.name), target })
        continue
      }
      const running = run.steps.find((s) => s.status === 'running')
      if (!running) continue
      const step = running.label ? ` · ${running.label}` : ''
      set({ botId: flow.botId, state: 'working', mood: 'thinking', text: tr('Na rotina "{0}"{1}', flow.name, step), target })
    }

    // Conversa respondendo agora
    const conv = app.activeConversation
    if (app.busy && conv) {
      const last = conv.messages.at(-1)
      const author = app.getBot(last?.botId ?? conv.botId)
      if (author) {
        set({
          botId: author.id,
          state: 'working',
          mood: app.mood === 'idle' ? 'thinking' : app.mood,
          text: tr('Respondendo em "{0}"', conv.title),
          target: { kind: 'conversation', id: conv.id }
        })
      }
      // Bots consultados por quem está respondendo
      for (const t of last?.tools ?? []) {
        const bot = t.botName && t.status === 'running' ? byName(t.botName) : undefined
        if (bot) set({ botId: bot.id, state: 'working', mood: 'thinking', text: tr('Consultado em "{0}"', conv.title), target: { kind: 'conversation', id: conv.id } })
      }
    }

    // Esperando aprovação
    for (const req of app.approvals) {
      const bot = req.requester ? byName(req.requester) : undefined
      if (bot) {
        set({
          botId: bot.id,
          state: 'waiting',
          mood: 'attention',
          text: tr('Esperando você liberar {0}', req.host),
          target: req.conversationId ? { kind: 'conversation', id: req.conversationId } : { kind: 'bot', id: bot.id }
        })
      }
    }

    // O resto dorme; mostra quando trabalhou pela última vez
    for (const bot of app.bots) {
      if (out.has(bot.id)) continue
      let last = 0
      for (const c of app.conversations) if (c.botId === bot.id) last = Math.max(last, c.updatedAt)
      for (const f of app.flows) {
        if (f.botId !== bot.id) continue
        for (const r of runs[f.id] ?? []) last = Math.max(last, r.finishedAt ?? r.startedAt)
      }
      out.set(bot.id, {
        botId: bot.id,
        state: 'sleeping',
        mood: 'sleeping',
        text: last ? tr('Última atividade {0}', timeAgo(last)) : tr('Ainda não trabalhou'),
        target: { kind: 'bot', id: bot.id }
      })
    }
    return out
  }, [runs, app.bots, app.flows, app.conversations, app.activeConversation, app.busy, app.mood, app.approvals, app.getBot, locale()])
}
