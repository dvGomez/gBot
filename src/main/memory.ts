import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { Lesson, MemoryOwner } from '@shared/types'

/**
 * Memória de procedimentos de cada bot e fluxo: data/memory/<bot|flow>-<id>.json.
 * Cada lição vai inteira no prompt de sistema do dono, então fica curta e objetiva.
 */
const MAX_IN_PROMPT = 30
const LIMITS = { title: 70, when: 140, steps: 500, why: 200 }

function file(owner: MemoryOwner) {
  const dir = join(app.getPath('userData'), 'data', 'memory')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${owner.kind}-${owner.id.replace(/[^a-zA-Z0-9-]/g, '')}.json`)
}

export function listLessons(owner: MemoryOwner): Lesson[] {
  try {
    return (JSON.parse(readFileSync(file(owner), 'utf8')) as Lesson[]).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function write(owner: MemoryOwner, lessons: Lesson[]) {
  const f = file(owner)
  if (!lessons.length) return rmSync(f, { force: true })
  writeFileSync(`${f}.tmp`, JSON.stringify(lessons, null, 2))
  renameSync(`${f}.tmp`, f)
}

function changed(owner: MemoryOwner) {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('memory:changed', owner)
}

const clip = (s: string, n: number) => s.replace(/\s+\n/g, '\n').trim().slice(0, n)

export function saveLesson(lesson: Lesson) {
  const clean: Lesson = {
    ...lesson,
    title: clip(lesson.title, LIMITS.title),
    when: clip(lesson.when, LIMITS.when),
    steps: clip(lesson.steps, LIMITS.steps),
    why: clip(lesson.why, LIMITS.why)
  }
  write(lesson.owner, [clean, ...listLessons(lesson.owner).filter((l) => l.id !== lesson.id)])
  changed(lesson.owner)
}

export function removeLesson(owner: MemoryOwner, id: string) {
  write(
    owner,
    listLessons(owner).filter((l) => l.id !== id)
  )
  changed(owner)
}

/** Apaga a memória inteira (quando o bot ou fluxo é excluído). */
export function removeMemory(owner: MemoryOwner) {
  rmSync(file(owner), { force: true })
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Registrado pelo próprio bot/fluxo. Mesmo título = atualiza a lição existente em vez de duplicar. */
export function learn(
  owner: MemoryOwner,
  input: { title: string; when: string; steps: string; why: string },
  source: Lesson['source']
): { lesson: Lesson; updated: boolean } {
  const now = Date.now()
  const existing = listLessons(owner).find((l) => norm(l.title) === norm(input.title))
  const lesson: Lesson = existing
    ? { ...existing, ...input, source, enabled: true, updatedAt: now }
    : { id: randomUUID(), owner, ...input, source, enabled: true, createdAt: now, updatedAt: now }
  saveLesson(lesson)
  return { lesson, updated: !!existing }
}

/** Bloco compacto para o prompt de sistema: só título, quando e passos (o "por quê" fica de fora). */
export function memoryPrompt(owner?: MemoryOwner): string[] {
  const intro = [
    'Memória: quando uma tentativa falhar e você descobrir o jeito certo (ou um cuidado que evita o erro), registre com',
    'a ferramenta save_lesson: título curto, quando usar, passos objetivos (até 5 linhas curtas) e por quê.',
    'Registre só o que vale para próximas vezes; nada óbvio, nada de dados pessoais ou senhas.'
  ].join(' ')
  if (!owner) return []
  const lessons = listLessons(owner)
    .filter((l) => l.enabled)
    .slice(0, MAX_IN_PROMPT)
  if (!lessons.length) return [intro]
  return [
    intro,
    'Procedimentos que você já aprendeu (siga-os quando a situação combinar):',
    '<memoria>',
    ...lessons.map((l) => `- ${l.title} | quando: ${l.when} | passos: ${l.steps.replace(/\n+/g, ' / ')}`),
    '</memoria>'
  ]
}
