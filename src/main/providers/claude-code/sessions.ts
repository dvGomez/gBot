import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getProject } from '../../store'
import { profileDir, resolveClaudeEnv } from './env'
import { ClaudeSession } from './session'

/**
 * Sessões abertas do Claude Code, por chave:
 *   `<conversa>`           assistente da conversa
 *   `<conversa>:<bot>`     um bot consultado (ou @mencionado) dentro daquela conversa
 * Processos parados há muito tempo são encerrados; a sessão continua salva em disco e é retomada.
 */
const sessions = new Map<string, { session: ClaudeSession; signature: string }>()
const IDLE_MS = 15 * 60_000

setInterval(() => {
  for (const [key, { session }] of sessions) {
    if (!session.busy && Date.now() - session.lastUsed > IDLE_MS) {
      session.kill()
      sessions.delete(key)
    }
  }
}, 60_000).unref()

export function closeAllSessions() {
  sessions.forEach(({ session }) => session.kill())
  sessions.clear()
}

app.on('before-quit', closeAllSessions)

/** Pasta onde o Claude Code trabalha. Configurável numa etapa futura. */
export function workspaceDir(): string {
  const dir = join(app.getPath('userData'), 'workspace')
  mkdirSync(dir, { recursive: true })
  return dir
}

export interface WorkContext {
  cwd: string
  /** Linhas do prompt de sistema sobre o projeto e a pasta de trabalho. */
  promptLines: string[]
}

/** Pasta de trabalho e instruções do projeto da conversa (ou a pasta padrão, fora de projetos). */
export function workContext(projectId?: string): WorkContext {
  const project = getProject(projectId)
  const folderOk = !!project?.folder && existsSync(project.folder)
  const cwd = folderOk ? project!.folder! : workspaceDir()
  const lines: string[] = []
  if (project) {
    lines.push(`Esta conversa faz parte do projeto "${project.name}"${project.description ? ` (${project.description})` : ''}.`)
    if (project.instructions.trim()) {
      lines.push(
        'Instruções do projeto (valem para tudo neste projeto):',
        '<instrucoes_do_projeto>',
        project.instructions.trim(),
        '</instrucoes_do_projeto>'
      )
    }
    if (project.folder && !folderOk) {
      lines.push(`A pasta do projeto (${project.folder}) não foi encontrada; por isso você está na pasta padrão do gBot.`)
    }
  }
  lines.push(`Sua pasta de trabalho é ${cwd}.`)
  return { cwd, promptLines: lines }
}

/** UUID estável derivado de um texto (o Claude Code exige UUID em `--session-id`). */
export function stableUuid(text: string): string {
  const h = createHash('sha1').update(text).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** A sessão já foi salva pelo Claude Code neste perfil? (então usa `--resume`) */
function hasSavedSession(sessionId: string): boolean {
  const projects = join(profileDir(), 'projects')
  if (!existsSync(projects)) return false
  return readdirSync(projects).some((dir) => existsSync(join(projects, dir, `${sessionId}.jsonl`)))
}

export interface SessionSpec {
  key: string
  sessionId: string
  cwd: string
  systemPrompt: string
  mcpConfig: string
  allowedTools: string[]
  /** Alias ou nome do modelo; ausente/`default` = padrão da conta. */
  model?: string
}

/**
 * Sessão aberta para a chave, criando se preciso. Se a pasta, o prompt ou as ferramentas mudaram (ex.: a conversa
 * mudou de projeto ou as instruções foram editadas), o processo é reaberto com `--resume`: a memória continua.
 */
export async function getSession(spec: SessionSpec): Promise<ClaudeSession> {
  const model = spec.model && spec.model !== 'default' ? spec.model : undefined
  const signature = JSON.stringify([spec.cwd, spec.systemPrompt, spec.mcpConfig, spec.allowedTools, model])
  const existing = sessions.get(spec.key)
  if (existing && !existing.session.exited) {
    if (existing.signature === signature || existing.session.busy) return existing.session
    existing.session.kill()
  }
  const env = await resolveClaudeEnv()
  const session = new ClaudeSession({
    ...env,
    cwd: spec.cwd,
    sessionId: spec.sessionId,
    resume: hasSavedSession(spec.sessionId),
    appendSystemPrompt: spec.systemPrompt,
    mcpConfig: spec.mcpConfig,
    allowedTools: spec.allowedTools,
    model
  })
  sessions.set(spec.key, { session, signature })
  return session
}
