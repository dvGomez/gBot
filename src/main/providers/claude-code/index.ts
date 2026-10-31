import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { SendMessageRequest } from '@shared/types'
import type { ChatProvider } from '../types'
import { profileDir, resolveClaudeEnv, runClaude } from './env'
import { ClaudeSession } from './session'

interface AuthStatus {
  loggedIn: boolean
  authMethod?: string
  subscriptionType?: string
}

/** Sessões abertas, uma por conversa. Processos parados há muito tempo são encerrados. */
const sessions = new Map<string, ClaudeSession>()
/** A conversa já tem sessão salva pelo Claude Code neste perfil? (então usa `--resume`) */
function hasSavedSession(sessionId: string): boolean {
  const projects = join(profileDir(), 'projects')
  if (!existsSync(projects)) return false
  return readdirSync(projects).some((dir) => existsSync(join(projects, dir, `${sessionId}.jsonl`)))
}
const IDLE_MS = 15 * 60_000

setInterval(() => {
  for (const [id, s] of sessions) {
    if (!s.busy && Date.now() - s.lastUsed > IDLE_MS) {
      s.kill()
      sessions.delete(id)
    }
  }
}, 60_000).unref()

function closeAllSessions() {
  sessions.forEach((s) => s.kill())
  sessions.clear()
}

app.on('before-quit', closeAllSessions)

/** Pasta onde o Claude Code trabalha. Configurável numa etapa futura. */
export function workspaceDir(): string {
  const dir = join(app.getPath('userData'), 'workspace')
  mkdirSync(dir, { recursive: true })
  return dir
}

function systemPrompt(req: SendMessageRequest, cwd: string): string {
  const { persona, bot } = req
  const lines = ['Você está conversando com o usuário pelo gBot, um aplicativo de chat para desktop.']
  if (bot) {
    lines.push(
      `Nesta conversa você é o bot "${bot.name}"${bot.description ? `: ${bot.description}` : ''}.`,
      'Siga estas instruções definidas pelo usuário para este bot:',
      '<instrucoes_do_bot>',
      bot.instructions.trim(),
      '</instrucoes_do_bot>'
    )
  } else if (persona) {
    lines.push(`Nesta conversa você se apresenta como ${persona.name} — ${persona.personality.toLowerCase()}.`)
  }
  lines.push(
    'Responda no idioma do usuário, de forma direta e amigável. Use Markdown quando ajudar a leitura.',
    `Sua pasta de trabalho é ${cwd}.`,
    'O gBot ainda não consegue mostrar pedidos de permissão: ações que precisam de aprovação serão negadas. Se precisar de uma, explique ao usuário o que faria.'
  )
  return lines.join('\n')
}

/**
 * Sugere nome e descrição para um bot a partir das instruções, com uma chamada curta ao Claude Code
 * (modelo rápido, sem ferramentas e sem salvar sessão).
 */
export async function suggestBotIdentity(instructions: string): Promise<{ name: string; description: string }> {
  const prompt = [
    'Sugira um nome curto e simpático (1 ou 2 palavras, em português) e uma descrição de uma frase',
    '(até 90 caracteres, começando com verbo, ex.: "Revisa contratos e aponta riscos") para um bot de chat com estas instruções:',
    '<instrucoes>',
    instructions.trim(),
    '</instrucoes>',
    'Responda apenas com JSON no formato {"name": "...", "description": "..."}.'
  ].join('\n')
  const out = await runClaude(['-p', prompt, '--model', 'haiku', '--tools', '', '--no-session-persistence'], 60_000)
  const json = out.match(/\{[\s\S]*\}/)?.[0]
  if (!json) throw new Error('Não consegui sugerir agora.')
  const parsed = JSON.parse(json) as { name?: string; description?: string }
  return { name: String(parsed.name ?? '').slice(0, 40), description: String(parsed.description ?? '').slice(0, 140) }
}

/** Claude Code instalado na máquina, logado na assinatura do usuário (binário oficial, sem modificações). */
export const claudeCodeProvider: ChatProvider = {
  info: {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'local-cli',
    description: 'Usa o Claude Code instalado neste computador, com os limites da sua assinatura.'
  },

  async checkStatus() {
    let version: string
    try {
      version = (await runClaude(['--version'])).split(' ')[0]
    } catch {
      return { status: 'unavailable', detail: 'Claude Code não encontrado. Instale e rode `claude` uma vez no terminal.' }
    }

    let auth: AuthStatus = { loggedIn: false }
    try {
      auth = JSON.parse(await runClaude(['auth', 'status', '--json'])) as AuthStatus
    } catch {
      // sem login ainda: `auth status` pode sair com erro
    }
    if (!auth.loggedIn) {
      return {
        status: 'not-configured',
        detail: `v${version} · entre com a sua conta Claude para usar a assinatura`,
        actions: [{ id: 'login', label: 'Entrar com conta Claude', primary: true }]
      }
    }
    const plan = auth.subscriptionType ? `plano ${auth.subscriptionType}` : auth.authMethod
    return { status: 'ready', detail: `v${version} · logado (${plan})`, actions: [{ id: 'logout', label: 'Sair' }] }
  },

  async runAction(actionId, progress) {
    const { bin, env } = await resolveClaudeEnv()

    if (actionId === 'logout') {
      closeAllSessions()
      await runClaude(['auth', 'logout'])
      return 'Você saiu da conta Claude no gBot.'
    }

    if (actionId !== 'login') throw new Error(`Ação desconhecida: ${actionId}`)

    // Login oficial do Claude Code: abre o navegador e conclui sozinho quando você autoriza.
    progress('Abrindo o navegador para você entrar na sua conta Claude…')
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, ['auth', 'login', '--claudeai'], { env })
      let output = ''
      const onOutput = (chunk: Buffer) => {
        output += chunk.toString()
        const url = output.match(/https:\/\/\S+/)?.[0]
        if (url) progress('Conclua o login no navegador. Se ele não abriu, use o link abaixo.', url)
      }
      proc.stdout.on('data', onOutput)
      proc.stderr.on('data', onOutput)
      const timer = setTimeout(() => proc.kill('SIGTERM'), 5 * 60_000)
      proc.on('error', (err) => reject(err))
      proc.on('exit', (code) => {
        clearTimeout(timer)
        closeAllSessions()
        if (code === 0) resolve('Login concluído.')
        else reject(new Error(output.trim().split('\n').at(-1) || 'O login não foi concluído.'))
      })
    })
  },

  async send(req, emit, signal) {
    const env = await resolveClaudeEnv()
    let session = sessions.get(req.conversationId)
    if (!session || session.exited) {
      const cwd = workspaceDir()
      session = new ClaudeSession({
        ...env,
        cwd,
        sessionId: req.conversationId,
        resume: hasSavedSession(req.conversationId),
        appendSystemPrompt: systemPrompt(req, cwd)
      })
      sessions.set(req.conversationId, session)
    }
    await session.send(req.text, emit, signal)
  }
}
