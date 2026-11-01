import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MemoryOwner, ProviderAccount, ProviderModel, SendMessageRequest } from '@shared/types'
import type { ChatProvider, ProviderAccounts } from '../types'
import { withAttachments } from '../../attachments'
import { botFilesPrompt } from '../../botFiles'
import { memoryPrompt } from '../../memory'
import { languageInstructions } from '../../localization'
import { getSettings } from '../../settings'
import { architectPrompt, GBOT_EDIT_HINT } from '../claude-code/architect'
import { sendToBot, TOOLS_HINT } from '../claude-code/bots'
import { mcpEndpointFor, type CallerContext } from '../claude-code/mcp'
import { withOutputFiles } from '../claude-code/outputs'
import { fileContext, type UsageTag } from '../claude-code/session'
import { workContext, type WorkContext } from '../claude-code/sessions'
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
import { resolveCodexEnv, runCodex } from './env'
import { cachedLimits, forgetLimits, refreshLimits } from './limits'
import { runCodexTurn } from './turn'

const IMAGE = /\.(png|jpe?g|gif|webp)$/i

/** Modelos que o Codex oferece à conta ativa (lista que ele mesmo guarda no perfil depois do primeiro uso). */
function codexModels(): ProviderModel[] {
  const models: ProviderModel[] = [{ id: 'default', label: 'Padrão', description: 'O modelo padrão do Codex para a sua conta' }]
  if (!listAccountRecords().length) return models
  try {
    const cache = JSON.parse(readFileSync(join(accountDir(activeAccountId()), 'models_cache.json'), 'utf8')) as {
      models?: { slug?: string; display_name?: string; description?: string; visibility?: string }[]
    }
    for (const m of cache.models ?? []) {
      if (m.slug && m.visibility === 'list') models.push({ id: m.slug, label: m.display_name || m.slug, description: m.description })
    }
  } catch {
    // ainda sem a lista: só o padrão
  }
  return models
}

const memoryOf = (req: SendMessageRequest): MemoryOwner | undefined =>
  req.memory ?? (req.bot ? { kind: 'bot', id: req.bot.id } : undefined)

function instructions(req: SendMessageRequest, work: WorkContext, fullAccess: boolean): string {
  if (req.architect) return [...architectPrompt(), ...work.promptLines, TOOLS_HINT, languageInstructions()].join('\n')
  const { bot } = req
  const lines = ['Você está conversando com o usuário pelo gBot, um aplicativo de chat para desktop.']
  if (bot) {
    lines.push(
      `Nesta conversa você é o bot "${bot.name}"${bot.description ? `: ${bot.description}` : ''}.`,
      'Siga estas instruções definidas pelo usuário para este bot:',
      '<instrucoes_do_bot>',
      bot.instructions.trim(),
      '</instrucoes_do_bot>',
      ...botFilesPrompt(bot.id)
    )
  }
  lines.push(
    'Responda no idioma do usuário, de forma direta e amigável. Use Markdown quando ajudar a leitura.',
    ...work.promptLines,
    fullAccess
      ? 'Seus comandos rodam direto no computador do usuário, sem sandbox: cuidado com ações irreversíveis.'
      : 'Seus comandos rodam numa sandbox: você cria e edita arquivos na pasta de trabalho e lê o resto do disco.',
    TOOLS_HINT,
    GBOT_EDIT_HINT,
    ...memoryPrompt(memoryOf(req))
  )
  return [...lines, languageInstructions()].join('\n')
}

/** Contexto MCP do assistente principal de cada conversa (ferramentas do gBot: navegador, bots, perguntas). */
const contexts = new Map<string, { ctx: CallerContext; mcp: { url: string; token: string } }>()

/**
 * Conecta uma conta ChatGPT: login oficial do Codex numa pasta de perfil nova (abre o navegador e conclui sozinho).
 * A mesma conta não entra duas vezes.
 */
async function addAccount(progress: (text: string, url?: string) => void): Promise<string> {
  const id = newAccountId()
  const { bin, env } = await resolveCodexEnv(id)
  progress('Abrindo o navegador para você entrar na sua conta ChatGPT…')
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, ['login'], { env, windowsHide: true })
      let output = ''
      const onOutput = (chunk: Buffer) => {
        output += chunk.toString()
        const url = output.match(/https:\/\/auth\.openai\.com\S+/)?.[0]
        if (url) progress('Conclua o login no navegador. Se ele não abriu, use o link abaixo.', url)
      }
      proc.stdout.on('data', onOutput)
      proc.stderr.on('data', onOutput)
      const timer = setTimeout(() => proc.kill(), 5 * 60_000)
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
    throw new Error('O login terminou, mas não foi com uma conta ChatGPT. Tente de novo.')
  }
  const same = listAccountRecords().find((a) => {
    const other = profileInfo(accountDir(a.id))
    return other?.userId === info.userId && other.accountId === info.accountId
  })
  if (same) {
    discardProfile(id)
    throw new Error('Essa conta já está conectada.')
  }
  addAccountRecord(id)
  void refreshLimits(true)
  return info.email ? `Conta ${info.email} conectada.` : 'Conta conectada.'
}

const codexAccounts: ProviderAccounts = {
  list() {
    const active = activeAccountId()
    return listAccountRecords().map((r): ProviderAccount => {
      const info = profileInfo(accountDir(r.id))
      const limits = cachedLimits(r.id)
      return {
        id: r.id,
        providerId: 'codex',
        label: r.name || info?.email || 'Conta ChatGPT',
        name: r.name,
        email: info?.email,
        organization: 'ChatGPT',
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
    try {
      await runCodex(['logout'], { accountId: id })
    } catch {
      // já estava sem login
    }
    forgetLimits(id)
    removeAccountRecord(id)
  }
}

/** Codex instalado na máquina, logado com a conta ChatGPT do usuário (binário oficial, sem modificações). */
export const codexProvider: ChatProvider = {
  get info() {
    return {
      id: 'codex',
      name: 'Codex (ChatGPT)',
      kind: 'local-cli' as const,
      description: 'Usa o Codex instalado neste computador, com os limites do seu plano ChatGPT.',
      models: codexModels()
    }
  },

  async checkStatus() {
    let version: string
    try {
      version = (await runCodex(['--version'])).split(/\s+/)[1] ?? ''
    } catch {
      return { status: 'unavailable', detail: 'Codex não encontrado. Instale com `npm i -g @openai/codex` ou o app do Codex.' }
    }
    const records = listAccountRecords()
    const active = records.length ? codexAccounts.list().find((a) => a.active) : undefined
    if (!active?.loggedIn) {
      return {
        status: 'not-configured',
        detail: `v${version} · entre com a sua conta ChatGPT para usar o plano`,
        actions: [{ id: 'login', label: 'Entrar com conta ChatGPT', primary: true }]
      }
    }
    return {
      status: 'ready',
      detail: `v${version} · ${active.label}${active.plan ? ` (plano ${active.plan})` : ''}`,
      actions: [{ id: 'login', label: 'Adicionar conta' }]
    }
  },

  async runAction(actionId, progress) {
    if (actionId === 'logout') {
      await codexAccounts.remove(activeAccountId())
      return 'Você saiu da conta ChatGPT no gBot.'
    }
    if (actionId !== 'login') throw new Error(`Ação desconhecida: ${actionId}`)
    return addAccount(progress)
  },

  accounts: codexAccounts,

  async send(req, emit, signal) {
    const text = withAttachments(req.text, req.attachments)
    // @menção a um bot: os bots trabalham no Claude Code.
    if (req.targetBotId) {
      await sendToBot(req.conversationId, req.projectId, req.targetBotId, text, emit, signal, req.origin)
      return
    }
    let entry = contexts.get(req.conversationId)
    if (!entry) {
      const ctx: CallerContext = {
        conversationId: req.conversationId,
        callerName: req.bot?.name ?? '',
        chain: req.bot ? [req.bot.id] : [],
        depth: 0
      }
      entry = { ctx, mcp: await mcpEndpointFor(ctx) }
      contexts.set(req.conversationId, entry)
    }
    entry.ctx.architect = req.architect
    entry.ctx.projectId = req.projectId
    entry.ctx.signal = signal
    entry.ctx.memory = memoryOf(req)
    entry.ctx.memorySource = req.origin ?? { kind: 'conversation', id: req.conversationId }
    const work = workContext(req.projectId)
    const fullAccess = !!getSettings().autoApproveTools
    const tag: UsageTag =
      req.origin?.kind === 'flow'
        ? { kind: 'flow', flowId: req.origin.id, botId: req.bot?.id }
        : { kind: 'conversation', conversationId: req.conversationId, botId: req.bot?.id }
    await runCodexTurn(
      {
        conversationId: req.conversationId,
        cwd: work.cwd,
        instructions: instructions(req, work, fullAccess),
        prompt: text,
        history: req.history,
        model: req.model,
        images: (req.attachments ?? []).filter((f) => IMAGE.test(f.name)).map((f) => f.path),
        mcp: entry.mcp,
        sandbox: fullAccess ? 'danger-full-access' : 'workspace-write',
        tag
      },
      withOutputFiles(work.cwd, emit, fileContext(tag)),
      signal
    )
  }
}
