import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { TokenUsage, UsageRecord, UsageSummary } from '@shared/types'
import { addUsage, emptyUsage } from '@shared/usage'

/** Gastos de tokens em data/usage.jsonl, um por linha; guarda os últimos 90 dias. */
const KEEP_DAYS = 90
const DAY = 24 * 60 * 60_000

function file() {
  const dir = join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'usage.jsonl')
}

function readAll(): UsageRecord[] {
  let raw = ''
  try {
    raw = readFileSync(file(), 'utf8')
  } catch {
    return []
  }
  const out: UsageRecord[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as UsageRecord)
    } catch {
      // linha cortada (app fechado no meio da gravação): ignora
    }
  }
  return out
}

/** Tira do arquivo o que passou do prazo (roda uma vez ao abrir o app). */
export function pruneUsage() {
  const all = readAll()
  const keep = all.filter((r) => r.at > Date.now() - KEEP_DAYS * DAY)
  if (keep.length !== all.length) writeFileSync(file(), keep.map((r) => JSON.stringify(r)).join('\n') + (keep.length ? '\n' : ''))
}

export function recordUsage(rec: UsageRecord) {
  appendFileSync(file(), JSON.stringify(rec) + '\n')
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('usage:changed')
}

const only = ({ input, output, cacheRead, cacheWrite, cost }: TokenUsage): TokenUsage => ({ input, output, cacheRead, cacheWrite, cost })

export function usageSummary(): UsageSummary {
  const startOfDay = new Date().setHours(0, 0, 0, 0)
  const weekAgo = Date.now() - 7 * DAY
  let today = emptyUsage()
  let week = emptyUsage()
  const groups = new Map<string, UsageSummary['top'][number]>()
  for (const r of readAll()) {
    if (r.at < weekAgo) continue
    week = addUsage(week, only(r))
    if (r.at >= startOfDay) today = addUsage(today, only(r))
    // Quem gastou: a rotina (inclusive bots consultados nela), senão o bot, senão a conversa.
    const owner = r.flowId
      ? ({ kind: 'flow', id: r.flowId } as const)
      : r.botId
        ? ({ kind: 'bot', id: r.botId } as const)
        : r.conversationId
          ? ({ kind: 'conversation', id: r.conversationId } as const)
          : undefined
    if (!owner) continue
    const key = `${owner.kind}:${owner.id}`
    const g = groups.get(key) ?? { ...owner, usage: emptyUsage() }
    g.usage = addUsage(g.usage, only(r))
    groups.set(key, g)
  }
  const top = [...groups.values()].sort((a, b) => b.usage.cost - a.usage.cost).slice(0, 6)
  return { today, week, top }
}

export const usageRecords = (since: number) => readAll().filter((r) => r.at >= since)

export function conversationUsage(conversationId: string): TokenUsage {
  return readAll()
    .filter((r) => r.conversationId === conversationId)
    .reduce((sum, r) => addUsage(sum, only(r)), emptyUsage())
}
