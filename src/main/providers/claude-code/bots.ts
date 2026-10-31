import type { Bot, ChatEvent } from '@shared/types'
import type { Lesson } from '@shared/types'
import { memoryPrompt } from '../../memory'
import { reflectIfNeeded } from './reflect'
import { listBots } from '../../store'
import { GBOT_TOOLS, mcpConfigFor, setBotHandlers, type CallerContext } from './mcp'
import { getSession, stableUuid, workContext, type WorkContext } from './sessions'

/** Profundidade máxima de consultas encadeadas (usuário → A → B → C). */
const MAX_DEPTH = 3
/** Tempo máximo de uma consulta a um bot. */
const ASK_TIMEOUT_MS = 10 * 60_000

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase()

/** Bots que uma conversa enxerga: os soltos e os do projeto dela. */
export function visibleBots(projectId?: string): Bot[] {
  return listBots().filter((b) => !b.projectId || b.projectId === projectId)
}

export function findBot(ref: string, projectId?: string): Bot | undefined {
  const bots = visibleBots(projectId)
  const key = normalize(ref)
  return bots.find((b) => b.id === ref) ?? bots.find((b) => normalize(b.name) === key)
}

export const TOOLS_HINT = [
  'Ferramentas do gBot: `list_bots` mostra os bots especializados do usuário e `ask_bot` envia uma pergunta a um deles.',
  'Consulte um bot quando o pedido combinar com a especialidade dele ou quando o usuário pedir; não consulte sem necessidade.',
  'Ao usar a resposta de um bot, diga de qual bot ela veio.',
  'Você também controla o navegador do gBot (Edge/Chrome com perfil próprio, onde o usuário pode estar logado) com as ferramentas browser_*:',
  'abra endereços com browser_navigate, leia com browser_read e use os números [n] para clicar (browser_click) e digitar (browser_type).',
  'Se o usuário ativou a aprovação de sites, uma ação pode ser negada; nesse caso não insista.',
  'Nunca digite senhas nem códigos de verificação: se aparecer login, MFA ou CAPTCHA, peça ao usuário para concluir na janela do navegador e continue quando ele avisar.'
].join(' ')

function baseLines(work: WorkContext): string[] {
  return [
    'Você está no gBot, um aplicativo de chat para desktop.',
    'Responda no idioma do usuário, de forma direta e amigável. Use Markdown quando ajudar a leitura.',
    ...work.promptLines,
    'O gBot ainda não consegue mostrar pedidos de permissão: ações que precisam de aprovação serão negadas. Se precisar de uma, explique o que faria.',
    TOOLS_HINT
  ]
}

/** Prompt de sistema de um bot consultado ou @mencionado, numa sessão própria dentro de uma conversa. */
function botSystemPrompt(bot: Bot, work: WorkContext): string {
  return [
    ...baseLines(work),
    `Você é o bot "${bot.name}"${bot.description ? `: ${bot.description}` : ''}.`,
    'Siga estas instruções definidas pelo usuário para você:',
    '<instrucoes_do_bot>',
    bot.instructions.trim(),
    '</instrucoes_do_bot>',
    'Nesta sessão você recebe mensagens de duas origens: do usuário, que chama você com @menção numa conversa, e de outros ' +
      'assistentes do gBot, que consultam você em nome do usuário (essas começam com "Mensagem de <nome>:"). ' +
      'Para consultas de outros assistentes, responda de forma completa e objetiva: sua resposta será repassada.',
    ...memoryPrompt({ kind: 'bot', id: bot.id })
  ].join('\n')
}

/** Uma fila por sessão de bot: consultas ao mesmo bot na mesma conversa rodam uma de cada vez. */
const queues = new Map<string, Promise<unknown>>()
function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(task)
  queues.set(key, next)
  return next
}

/** Contextos MCP das sessões de bot (um por sessão; a cadeia muda a cada consulta). */
const botContexts = new Map<string, { ctx: CallerContext; config: string }>()

/** Uma sessão por bot dentro de cada conversa: ele lembra das consultas e @menções daquela conversa. */
async function botSession(conversationId: string, projectId: string | undefined, bot: Bot, source?: Lesson['source']) {
  const key = `${conversationId}:${bot.id}`
  let entry = botContexts.get(key)
  if (!entry) {
    const ctx: CallerContext = {
      conversationId,
      projectId,
      callerName: bot.name,
      chain: [bot.id],
      depth: 1,
      memory: { kind: 'bot', id: bot.id }
    }
    entry = { ctx, config: (await mcpConfigFor(ctx)).config }
    botContexts.set(key, entry)
  }
  entry.ctx.projectId = projectId
  entry.ctx.memorySource = source ?? { kind: 'conversation', id: conversationId }
  const work = workContext(projectId)
  const session = await getSession({
    key,
    sessionId: stableUuid(key),
    cwd: work.cwd,
    systemPrompt: botSystemPrompt(bot, work),
    mcpConfig: entry.config,
    allowedTools: GBOT_TOOLS,
    model: bot.model
  })
  return { key, session, ctx: entry.ctx }
}

/** Consulta feita por outro assistente (ferramenta `ask_bot`): devolve o texto da resposta. */
async function askBot(caller: CallerContext, ref: string, message: string, signal: AbortSignal): Promise<string> {
  const bot = findBot(ref, caller.projectId)
  if (!bot) {
    const names = visibleBots(caller.projectId).map((b) => b.name)
    throw new Error(`Não existe bot "${ref}". Bots disponíveis: ${names.length ? names.join(', ') : 'nenhum'}.`)
  }
  if (caller.chain.includes(bot.id)) {
    throw new Error(`${bot.name} já participa desta cadeia de consultas; perguntar de novo criaria um ciclo. Responda com o que você já tem.`)
  }
  if (caller.depth >= MAX_DEPTH) {
    throw new Error(`Limite de ${MAX_DEPTH} consultas encadeadas atingido. Responda com o que você já tem.`)
  }

  const { key, session, ctx } = await botSession(caller.conversationId, caller.projectId, bot, caller.memorySource)
  return enqueue(key, async () => {
    ctx.chain = [...caller.chain, bot.id]
    ctx.depth = caller.depth + 1
    let text = ''
    let error: string | undefined
    const collect = (ev: ChatEvent) => {
      if (ev.type === 'delta') text += ev.text
      if (ev.type === 'error') error = ev.message
    }
    const timeout = AbortSignal.timeout(ASK_TIMEOUT_MS)
    const from = caller.callerName || 'o assistente da conversa'
    await session.send(`Mensagem de ${from}:\n\n${message}`, collect, AbortSignal.any([signal, timeout]))
    reflectIfNeeded(session, ctx.memory)
    if (error) throw new Error(`${bot.name} não conseguiu responder: ${error}`)
    if (timeout.aborted) throw new Error(`${bot.name} demorou demais para responder.`)
    return text.trim() || `${bot.name} não respondeu nada.`
  })
}

/** Mensagem enviada pelo usuário direto a um bot com @menção: a resposta vai para o chat. */
export async function sendToBot(
  conversationId: string,
  projectId: string | undefined,
  botId: string,
  text: string,
  emit: (ev: ChatEvent) => void,
  signal: AbortSignal,
  origin?: Lesson['source']
) {
  const bot = findBot(botId, projectId)
  if (!bot) {
    emit({ type: 'error', message: 'Esse bot não existe mais ou não está disponível neste projeto.' })
    return
  }
  const { key, session, ctx } = await botSession(conversationId, projectId, bot, origin)
  await enqueue(key, () => {
    ctx.chain = [bot.id]
    ctx.depth = 1
    return session.send(text, emit, signal).then(() => reflectIfNeeded(session, ctx.memory))
  })
}

setBotHandlers({
  list(ctx) {
    const bots = visibleBots(ctx.projectId)
    if (!bots.length) return 'Não há bots disponíveis aqui.'
    return bots
      .map((b) => `- ${b.name}${ctx.chain.includes(b.id) ? ' (você)' : ''}: ${b.description || 'sem descrição'}`)
      .join('\n')
  },
  ask: askBot
})
