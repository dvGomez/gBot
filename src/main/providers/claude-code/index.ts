import { spawn } from 'node:child_process'
import type { SendMessageRequest } from '@shared/types'
import type { ChatProvider } from '../types'
import { sendToBot, TOOLS_HINT } from './bots'
import { resolveClaudeEnv, runClaude } from './env'
import { GBOT_TOOLS, mcpConfigFor, type CallerContext } from './mcp'
import { closeAllSessions, getSession, workContext, type WorkContext } from './sessions'

interface AuthStatus {
  loggedIn: boolean
  authMethod?: string
  subscriptionType?: string
}

function systemPrompt(req: SendMessageRequest, work: WorkContext): string {
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
    ...work.promptLines,
    'O gBot ainda não consegue mostrar pedidos de permissão: ações que precisam de aprovação serão negadas. Se precisar de uma, explique ao usuário o que faria.',
    TOOLS_HINT
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
    if (req.targetBotId) {
      await sendToBot(req.conversationId, req.projectId, req.targetBotId, req.text, emit, signal)
      return
    }
    let entry = mainContexts.get(req.conversationId)
    if (!entry) {
      const ctx: CallerContext = {
        conversationId: req.conversationId,
        callerName: req.bot?.name ?? req.persona?.name ?? 'Assistente',
        chain: req.bot ? [req.bot.id] : [],
        depth: 0
      }
      entry = { ctx, config: (await mcpConfigFor(ctx)).config }
      mainContexts.set(req.conversationId, entry)
    }
    entry.ctx.projectId = req.projectId
    const work = workContext(req.projectId)
    const session = await getSession({
      key: req.conversationId,
      sessionId: req.conversationId,
      cwd: work.cwd,
      systemPrompt: systemPrompt(req, work),
      mcpConfig: entry.config,
      allowedTools: GBOT_TOOLS
    })
    await session.send(req.text, emit, signal)
  }
}

/** Contexto MCP do assistente principal de cada conversa. */
const mainContexts = new Map<string, { ctx: CallerContext; config: string }>()
