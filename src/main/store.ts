import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Bot, Conversation, ConversationMeta } from '@shared/types'

/**
 * Armazenamento local em JSON (~/Library/Application Support/gBot/data):
 *   bots.json             todos os bots
 *   conversations/<id>.json  uma conversa por arquivo
 * Escritas são atômicas (arquivo temporário + rename).
 */
function dataDir(...parts: string[]): string {
  const dir = join(app.getPath('userData'), 'data', ...parts)
  mkdirSync(dir, { recursive: true })
  return dir
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, file)
}

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9-]/g, '')

// ── Bots ────────────────────────────────────────────────────────────

const botsFile = () => join(dataDir(), 'bots.json')

export function listBots(): Bot[] {
  return readJson<Bot[]>(botsFile(), []).sort((a, b) => a.createdAt - b.createdAt)
}

export function getBot(id: string): Bot | undefined {
  return listBots().find((b) => b.id === id)
}

export function saveBot(bot: Bot) {
  const bots = listBots().filter((b) => b.id !== bot.id)
  writeJson(botsFile(), [...bots, bot])
}

export function removeBot(id: string) {
  writeJson(
    botsFile(),
    listBots().filter((b) => b.id !== id)
  )
  // As conversas do bot vão junto.
  for (const meta of listConversations()) if (meta.botId === id) removeConversation(meta.id)
}

// ── Conversas ───────────────────────────────────────────────────────

const conversationFile = (id: string) => join(dataDir('conversations'), `${safeId(id)}.json`)

export function getConversation(id: string): Conversation | undefined {
  return readJson<Conversation | undefined>(conversationFile(id), undefined)
}

export function listConversations(): ConversationMeta[] {
  const dir = dataDir('conversations')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<Conversation | undefined>(join(dir, f), undefined))
    .filter((c): c is Conversation => !!c)
    .map(({ messages, ...meta }) => ({ ...meta, messageCount: messages.length }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveConversation(conversation: Conversation) {
  writeJson(conversationFile(conversation.id), conversation)
}

export function removeConversation(id: string) {
  rmSync(conversationFile(id), { force: true })
}
