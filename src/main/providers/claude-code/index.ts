import { spawn } from 'node:child_process'
import type { ProviderAccount, SendMessageRequest } from '@shared/types'
import type { ChatProvider, ProviderAccounts } from '../types'
import { languageInstructions } from '../../localization'
import { attachmentsAccess, withAttachments } from '../../attachments'
import { botEditLines, botPromptLines, memoryLines, memoryOf, specializationAccess, specializationsInUse, withSpecializations } from '../persona'
import { PERMISSIONS_HINT, sendToBot, TOOLS_HINT } from './bots'
import { withOutputFiles } from './outputs'
import { reflectIfNeeded } from './reflect'
import {
  accountDir,
  activeAccountId,
  addAccountRecord,
  discardProfile,
  getAccountRecord,
  listAccountRecords,
  newAccountId,
  profileInfo,
  removeAccountRecord,
  renameAccount,
  setActiveAccount
} from './accounts'
import { resolveClaudeEnv, runClaude } from './env'
import { cachedLimits, forgetLimits, refreshLimits } from './limits'
import { GBOT_TOOLS, mcpConfigFor, type CallerContext } from './mcp'
import { architectPrompt, GBOT_EDIT_HINT } from './architect'
import { askOnce } from './oneShot'
import { fileContext, type UsageTag } from './session'
import { closeAllSessions, getSession, workContext, type WorkContext } from './sessions'

interface AuthStatus {
  loggedIn: boolean
  authMethod?: string
  subscriptionType?: string
}

function systemPrompt(req: SendMessageRequest, work: WorkContext): string {
  if (req.architect) {
    return [...architectPrompt(), '', ...work.promptLines, PERMISSIONS_HINT, TOOLS_HINT, languageInstructions()].join('\n')
  }
  const { bot } = req
  const lines = ['Você está conversando com o usuário pelo gBot, um aplicativo de chat para desktop.']
  if (bot) lines.push(...botPromptLines(bot))
  lines.push(
    'Responda no idioma do usuário, de forma direta e amigável. Use Markdown quando ajudar a leitura.',
    ...work.promptLines,
    PERMISSIONS_HINT,
    TOOLS_HINT,
    GBOT_EDIT_HINT,
    ...(req.bot && req.origin?.kind !== 'flow' ? botEditLines(req.bot) : []),
    ...memoryLines(req)
  )
  return [...lines, languageInstructions()].join('\n')
}

/**
 * Sugere nome e descrição para uma especialização a partir das instruções, com uma chamada curta ao Claude Code
 * (modelo rápido, sem ferramentas e sem salvar sessão).
 */
export async function suggestSpecializationIdentity(instructions: string): Promise<{ name: string; description: string }> {
  const prompt = [
    'Sugira um nome curto e simpático (1 ou 2 palavras, no idioma preferido do usuário) e uma descrição de uma frase',
    '(até 90 caracteres, começando com verbo, ex.: "Revisa contratos e aponta riscos") para uma especialização (um',
    'conhecimento que assistentes de IA usam) com estas instruções:',
    '<instrucoes>',
    instructions.trim(),
    '</instrucoes>',
    'Responda apenas com JSON no formato {"name": "...", "description": "..."}.',
    languageInstructions()
  ].join('\n')
  const { text } = await askOnce(prompt, 'haiku', { kind: 'suggest' }, 60_000)
  const json = text.match(/\{[\s\S]*\}/)?.[0]
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
    description: 'Usa o Claude Code instalado neste computador, com os limites da sua assinatura.',
    // Aliases do Claude Code: sempre apontam para a versão mais recente de cada modelo.
    models: [
      { id: 'default', label: 'Padrão', description: 'O modelo padrão da sua conta' },
      { id: 'opus', label: 'Opus', description: 'O mais capaz; mais lento e gasta mais limite' },
      { id: 'sonnet', label: 'Sonnet', description: 'Equilíbrio entre qualidade e velocidade' },
      { id: 'haiku', label: 'Haiku', description: 'Rápido e econômico' },
      { id: 'fable', label: 'Fable', description: 'Exige créditos de uso extras na conta' }
    ]
  },

  async checkStatus() {
    let version: string
    try {
      version = (await runClaude(['--version'])).split(' ')[0]
    } catch {
      return { status: 'unavailable', detail: 'Claude Code não encontrado. Instale e rode `claude` uma vez no terminal.' }
    }

    let auth: AuthStatus = { loggedIn: false }
    if (listAccountRecords().length) {
      try {
        auth = JSON.parse(await runClaude(['auth', 'status', '--json'])) as AuthStatus
      } catch {
        // sem login: `auth status` pode sair com erro
      }
    }
    if (!auth.loggedIn) {
      return {
        status: 'not-configured',
        detail: `v${version} · entre com a sua conta Claude para usar a assinatura`,
        actions: [{ id: 'login', label: 'Entrar com conta Claude', primary: true }]
      }
    }
    const active = claudeAccounts.list().find((a) => a.active)
    const plan = auth.subscriptionType ? `plano ${auth.subscriptionType}` : auth.authMethod
    return {
      status: 'ready',
      detail: `v${version} · ${active?.label ?? 'logado'} (${plan})`,
      actions: [{ id: 'login', label: 'Adicionar conta' }]
    }
  },

  async runAction(actionId, progress) {
    if (actionId === 'logout') {
      await claudeAccounts.remove(activeAccountId())
      return 'Você saiu da conta Claude no gBot.'
    }
    if (actionId !== 'login') throw new Error(`Ação desconhecida: ${actionId}`)
    return addAccount(progress)
  },

  // Getter: a lista de contas é definida mais abaixo no arquivo.
  get accounts() {
    return claudeAccounts
  },

  async send(req, emit, signal) {
    const text = withSpecializations(req, withAttachments(req.text, req.attachments))
    if (req.targetBotId) {
      await sendToBot(req.conversationId, req.projectId, req.targetBotId, text, emit, signal, req.origin)
      return
    }
    let entry = mainContexts.get(req.conversationId)
    if (!entry) {
      const ctx: CallerContext = {
        conversationId: req.conversationId,
        // Conversa normal não tem nome (sem persona).
        callerName: req.bot?.name ?? '',
        chain: req.bot ? [req.bot.id] : [],
        depth: 0
      }
      entry = { ctx, config: (await mcpConfigFor(ctx)).config }
      mainContexts.set(req.conversationId, entry)
    }
    entry.ctx.chain = req.botChain ?? (req.bot ? [req.bot.id] : [])
    // Conversa direta (com ou sem bot) é com o usuário: profundidade 0. Só consultas repassadas por outro bot contam.
    entry.ctx.depth = req.botChain ? req.botChain.length : 0
    entry.ctx.projectId = req.projectId
    entry.ctx.signal = signal
    entry.ctx.architect = req.architect
    entry.ctx.botId = req.bot?.id
    entry.ctx.memory = memoryOf(req)
    entry.ctx.specializationIds = specializationsInUse(req)
    entry.ctx.memorySource = req.origin ?? { kind: 'conversation', id: req.conversationId }
    const work = workContext(req.projectId)
    // Pastas extras que a sessão pode ler: arquivos de referência das especializações e anexos da conversa.
    const files = specializationAccess(req)
    const attached = attachmentsAccess(req.conversationId)
    const session = await getSession({
      key: req.conversationId,
      signal,
      sessionId: req.conversationId,
      cwd: work.cwd,
      systemPrompt: systemPrompt(req, work),
      mcpConfig: entry.config,
      allowedTools: [...GBOT_TOOLS, ...files.allowedTools, ...attached.allowedTools],
      addDirs: [...files.addDirs, ...attached.addDirs],
      model: req.model
    })
    const tag: UsageTag =
      req.origin?.kind === 'flow'
        ? { kind: 'flow', flowId: req.origin.id, botId: req.bot?.id }
        : { kind: 'conversation', conversationId: req.conversationId, botId: req.bot?.id }
    await session.send(text, withOutputFiles(work.cwd, emit, fileContext(tag)), signal, tag)
    if (!signal.aborted) reflectIfNeeded(session, entry.ctx.memory)
  }
}

/** A conta tem login válido de verdade (o Claude Code confirma), não só o perfil salvo. */
async function hasCredentials(accountId: string): Promise<boolean> {
  try {
    return !!(JSON.parse(await runClaude(['auth', 'status', '--json'], { accountId })) as AuthStatus).loggedIn
  } catch {
    // sem login: `auth status` pode sair com erro
    return false
  }
}

/**
 * Conecta uma conta nova: login oficial do Claude Code numa pasta de perfil nova, que abre o navegador e conclui
 * sozinho quando você autoriza. A mesma conta não entra duas vezes.
 */
async function addAccount(progress: (text: string, url?: string) => void): Promise<string> {
  const id = newAccountId()
  const { bin, env } = await resolveClaudeEnv(id)
  progress('Abrindo o navegador para você entrar na sua conta Claude…')
  try {
    await new Promise<void>((resolve, reject) => {
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
        if (code === 0) resolve()
        else reject(new Error(output.trim().split('\n').at(-1) || 'O login não foi concluído.'))
      })
    })
  } catch (e) {
    discardProfile(id)
    throw e
  }

  const info = profileInfo(accountDir(id))
  if (!info) {
    discardProfile(id)
    throw new Error('O login terminou, mas a conta não apareceu no perfil. Tente de novo.')
  }
  const same = listAccountRecords().find((a) => {
    const other = profileInfo(accountDir(a.id))
    return other?.accountUuid === info.accountUuid && other.organizationUuid === info.organizationUuid
  })
  // Conta ativa sem login válido (ex.: a credencial saiu do Keychain): a conta que acabou de entrar passa a ser a ativa,
  // senão o app continua na tela de login.
  const activeOk = await hasCredentials(activeAccountId())
  // O perfil antigo pode existir sem credencial válida: aí o login novo o substitui.
  if (same && (await hasCredentials(same.id))) {
    discardProfile(id)
    if (activeOk || activeAccountId() === same.id) throw new Error('Essa conta já está conectada.')
    setActiveAccount(same.id)
    void refreshLimits(true)
    return info.email ? `Conta ${info.email} conectada.` : 'Conta conectada.'
  }
  const wasActive = !!same && activeAccountId() === same.id
  addAccountRecord(id)
  if (!activeOk && !same) setActiveAccount(id)
  // Login de novo numa conta que tinha saído: a nova entrada fica no lugar dela, com o mesmo apelido.
  if (same) {
    if (same.name) renameAccount(id, same.name)
    removeAccountRecord(same.id)
    if (wasActive) setActiveAccount(id)
  }
  void refreshLimits(true)
  return info.email ? `Conta ${info.email} conectada.` : 'Conta conectada.'
}

const claudeAccounts: ProviderAccounts = {
  list() {
    const active = activeAccountId()
    return listAccountRecords().map((r): ProviderAccount => {
      const info = profileInfo(accountDir(r.id))
      const limits = cachedLimits(r.id)
      return {
        id: r.id,
        providerId: 'claude-code',
        label: r.name || info?.email || 'Conta Claude',
        name: r.name,
        email: info?.email,
        organization: info?.organization,
        plan: info?.plan,
        active: r.id === active,
        loggedIn: !!info,
        limits: limits?.limits ?? [],
        limitsAt: limits?.at,
        limitsError: limits?.error
      }
    })
  },
  refreshLimits,
  setActive: setActiveAccount,
  rename(id, name) {
    if (!getAccountRecord(id)) throw new Error('Conta não encontrada.')
    renameAccount(id, name.slice(0, 40))
  },
  async remove(id) {
    if (!getAccountRecord(id)) throw new Error('Conta não encontrada.')
    // Processos abertos com a conta deixam de valer; as conversas reabrem com a próxima conta ativa.
    closeAllSessions()
    try {
      await runClaude(['auth', 'logout'], { accountId: id })
    } catch {
      // já estava sem login
    }
    forgetLimits(id)
    removeAccountRecord(id)
  }
}
/** Contexto MCP do assistente principal de cada conversa. */
const mainContexts = new Map<string, { ctx: CallerContext; config: string }>()
