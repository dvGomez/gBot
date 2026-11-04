import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { Lesson, MemoryOwner } from '@shared/types'
import { BROWSER_TOOL_NAMES, registerBrowserTools } from '../../browser/tools'
import { learn } from '../../memory'
import { listSpecializations } from '../../store'
import { routineRunText, routineRunsText } from '../../flows/history'
import { answersText, askUser } from '../../questions'
import { registerApprovalTool } from './permissions'
import { overviewText, planSchema, reviewPlan, sanitizePlan } from './architect'
import { ASK_BOT_TOOL, ASK_USER_TOOL, GBOT_OVERVIEW_TOOL, LIST_BOTS_TOOL, PROPOSE_PLAN_TOOL } from './tools'

/**
 * Servidor MCP local do gBot (http://127.0.0.1:<porta>/mcp). Cada sessão do Claude Code recebe um token
 * próprio; pelo token o gBot sabe quem está chamando (qual conversa, qual bot, em que profundidade).
 */

export interface CallerContext {
  conversationId: string
  /** Projeto da conversa: define a pasta, as instruções e quais bots ficam visíveis. */
  projectId?: string
  /** Quem está perguntando, para o bot consultado saber (ex.: "Brasa", "Panelinha"). */
  callerName: string
  /** Bot desta sessão: ganha as ferramentas do histórico das próprias rotinas. */
  botId?: string
  /** Bots já envolvidos nesta cadeia de consultas (evita A → B → A). */
  chain: string[]
  depth: number
  /** Memória usada por esta sessão (o bot, ou a especialização chamada); sem ela, save_lesson não é oferecida. */
  memory?: MemoryOwner
  /** Especializações em uso na sessão: save_lesson pode registrar lições nelas. */
  specializationIds?: string[]
  /** Origem registrada nas lições aprendidas. */
  memorySource?: Lesson['source']
  /** Conversa com o arquiteto: ganha a ferramenta `propose_plan`. */
  architect?: boolean
  /** Avisos da revisão de planos já devolvidos ao modelo nesta sessão: na segunda vez, não bloqueiam mais. */
  planWarnings?: Set<string>
  signal?: AbortSignal
}

export interface BotHandlers {
  list(ctx: CallerContext): string
  ask(ctx: CallerContext, bot: string, message: string, signal: AbortSignal): Promise<string>
}

/**
 * Ferramentas liberadas sem pedir permissão em toda sessão aberta pelo gBot: as do próprio gBot e a busca /
 * leitura de páginas do Claude Code (só leitura; sem elas o Claude Code nega e fluxos automáticos param).
 */
export const GBOT_TOOLS = [
  LIST_BOTS_TOOL,
  ASK_BOT_TOOL,
  ASK_USER_TOOL,
  PROPOSE_PLAN_TOOL,
  GBOT_OVERVIEW_TOOL,
  ...BROWSER_TOOL_NAMES.map((n) => `mcp__gbot__${n}`),
  'mcp__gbot__save_lesson',
  'mcp__gbot__routine_history',
  'mcp__gbot__routine_run',
  'WebSearch',
  'WebFetch'
]

const contexts = new Map<string, CallerContext>()
let handlers: BotHandlers | undefined
let serverPromise: Promise<{ server: Server; port: number }> | undefined

export function setBotHandlers(h: BotHandlers) {
  handlers = h
}

function buildServer(ctx: CallerContext): McpServer {
  const server = new McpServer({ name: 'gbot', version: '1.0.0' })

  server.registerTool(
    'list_bots',
    {
      description:
        'Lista os bots do time do gBot (nome, o que cada um faz e as especializações). Use antes de ask_bot se não souber quais bots existem.',
      inputSchema: {}
    },
    async () => ({ content: [{ type: 'text', text: handlers?.list(ctx) ?? 'Nenhum bot disponível.' }] })
  )

  server.registerTool(
    'ask_bot',
    {
      description:
        'Envia uma pergunta ou tarefa a outro bot do time do gBot e devolve a resposta dele. Use quando o pedido do usuário ' +
        'combinar com as especializações de um bot, ou quando o usuário pedir para consultar um bot. Escreva a mensagem completa, ' +
        'com o contexto necessário: o bot não vê esta conversa.',
      inputSchema: {
        bot: z.string().describe('Nome (ou id) do bot, como aparece em list_bots'),
        message: z.string().describe('A pergunta ou tarefa para o bot, com todo o contexto necessário')
      }
    },
    async ({ bot, message }, extra) => {
      if (!handlers) return { content: [{ type: 'text', text: 'Bots indisponíveis.' }], isError: true }
      try {
        const signal = ctx.signal ? AbortSignal.any([extra.signal, ctx.signal]) : extra.signal
        signal.throwIfAborted()
        const answer = await handlers.ask(ctx, bot, message, signal)
        return { content: [{ type: 'text', text: answer }] }
      } catch (e) {
        return { content: [{ type: 'text', text: (e as Error).message }], isError: true }
      }
    }
  )

  if (ctx.memory) {
    server.registerTool(
      'save_lesson',
      {
        description:
          'Registra na sua memória um procedimento aprendido, para acertar de primeira nas próximas vezes. Use quando uma ' +
          'tentativa falhar e você descobrir o jeito certo ou um cuidado importante. Seja curto: cada lição vai no seu prompt. ' +
          'Mesmo título atualiza a lição existente.',
        inputSchema: {
          title: z.string().describe('Nome curto do procedimento, ex.: "Enviar mensagem no WhatsApp Web"'),
          when: z.string().describe('Quando usar, em poucas palavras'),
          steps: z.string().describe('Passos ou cuidados objetivos, até 5 linhas curtas'),
          why: z.string().describe('O que deu errado antes (uma frase)'),
          specialization: z
            .string()
            .optional()
            .describe('Nome da especialização a que a lição pertence (como executar a especialização); vazio = sua memória')
        }
      },
      async ({ specialization, ...input }) => {
        ctx.signal?.throwIfAborted()
        let owner = ctx.memory!
        if (specialization?.trim()) {
          const key = specialization.trim().toLowerCase()
          const sp = listSpecializations().find(
            (x) => ctx.specializationIds?.includes(x.id) && (x.id === specialization || x.name.toLowerCase() === key)
          )
          if (!sp) return { content: [{ type: 'text', text: `Especialização "${specialization}" não está em uso aqui. Salve sem ela ou use o nome exato.` }], isError: true }
          owner = { kind: 'specialization', id: sp.id }
        }
        const source = ctx.memorySource ?? { kind: 'conversation' as const, id: ctx.conversationId }
        const { updated } = learn(owner, input, source)
        return { content: [{ type: 'text', text: updated ? 'Lição atualizada na memória.' : 'Lição salva na memória.' }] }
      }
    )
  }

  if (ctx.botId) {
    server.registerTool(
      'routine_history',
      {
        description:
          'Lista as execuções recentes das suas rotinas (quando rodou, qual rotina, como terminou e um resumo do resultado). ' +
          'Use quando o usuário perguntar sobre algo que você fez ou encontrou numa rotina; depois veja os detalhes com routine_run.',
        inputSchema: {
          limit: z.number().int().min(1).max(30).optional().describe('Quantas execuções (padrão 10, as mais recentes primeiro)'),
          routine: z.string().optional().describe('Nome da rotina (gatilho) para filtrar; vazio = todas')
        }
      },
      async ({ limit, routine }) => ({ content: [{ type: 'text', text: routineRunsText(ctx.botId!, limit ?? 10, routine) }] })
    )
    server.registerTool(
      'routine_run',
      {
        description: 'Mostra uma execução de rotina completa: cada etapa com o que entregou, escolhas, erros e arquivos gerados.',
        inputSchema: { runId: z.string().describe('Id da execução, como aparece em routine_history') }
      },
      async ({ runId }) => ({ content: [{ type: 'text', text: routineRunText(ctx.botId!, runId) }] })
    )
  }

  server.registerTool(
    'ask_user',
    {
      description:
        'Faz ao usuário de 1 a 4 perguntas num cartão interativo no chat (uma por vez, ele clica para responder) e devolve as ' +
        'respostas. É o ÚNICO jeito de perguntar algo ao usuário: nunca pergunte por texto na resposta. Use quando faltar uma ' +
        'informação ou decisão que muda o resultado (ex.: qual formato, para quem enviar, qual das abordagens, um dado que só ' +
        'ele sabe). Dê opções prováveis sempre que der; o cartão sempre tem um campo para escrever outra resposta, e uma ' +
        'pergunta pode vir sem opções quando a resposta é livre (ex.: colar o cabeçalho de uma planilha); não crie opção ' +
        '"Outro". Não use para o que ' +
        'dá para decidir com bom senso nem para pedir permissão de ferramentas (o gBot já pergunta isso sozinho).',
      inputSchema: {
        questions: z
          .array(
            z.object({
              question: z.string().describe('A pergunta completa, terminando com "?"'),
              header: z.string().max(16).describe('Rótulo curto, até 12 letras (ex.: "Formato", "Envio")'),
              options: z
                .array(
                  z.object({
                    label: z.string().describe('Opção curta (1 a 5 palavras); a recomendada vem primeiro, com " (Recomendado)"'),
                    description: z.string().optional().describe('O que esta opção significa ou implica')
                  })
                )
                .max(4)
                .describe('De 2 a 4 opções; vazio só quando a resposta é livre'),
              multiSelect: z.boolean().optional().describe('true quando dá para escolher mais de uma opção')
            })
          )
          .min(1)
          .max(4)
      }
    },
    async ({ questions }, extra) => {
      // Rotinas e bots consultados por outros não têm ninguém olhando o chat: seguem sozinhos.
      if (ctx.depth > 0 || ctx.memorySource?.kind === 'flow') {
        return { content: [{ type: 'text', text: 'Não há ninguém para responder agora. Decida com bom senso e siga, dizendo o que escolheu.' }] }
      }
      const answers = await askUser({ conversationId: ctx.conversationId, requester: ctx.callerName, questions }, extra.signal)
      return { content: [{ type: 'text', text: answersText(questions, answers) }] }
    }
  )

  // Criar ou alterar itens do gBot: o arquiteto e o assistente principal das conversas (rotinas e bots consultados não).
  if (ctx.architect || (ctx.depth === 0 && ctx.memorySource?.kind !== 'flow')) {
    server.registerTool(
      'gbot_overview',
      {
        description:
          'Mostra os bots (com rotinas), especializações e projetos que existem no gBot e como montar um plano para criar ' +
          'ou alterar itens. Chame antes de `propose_plan`.',
        inputSchema: {}
      },
      async () => ({ content: [{ type: 'text', text: overviewText() }] })
    )
    server.registerTool(
      'propose_plan',
      {
        description:
          'Mostra ao usuário o plano do que criar ou alterar no gBot (projeto, especializações, bots e rotinas), num cartão com o botão para ' +
          'aplicar. Para mudar algo que existe, use "existingId" (edição), nunca um item novo. Quem aplica é o usuário, pelo ' +
          'cartão: não crie nem altere nada você mesmo. Antes de mostrar, o gBot revisa o plano e pode devolver pontos para ' +
          'corrigir ou justificar em "attention".',
        inputSchema: planSchema.shape
      },
      async (input) => {
        try {
          sanitizePlan(input)
          const review = reviewPlan(input)
          if (review.errors.length) {
            const text = ['O plano tem problemas e não foi mostrado. Corrija e chame `propose_plan` de novo:', ...review.errors.map((e) => `- ${e}`)]
            return { content: [{ type: 'text', text: text.join('\n') }], isError: true }
          }
          // Cada aviso volta uma vez: o modelo corrige o plano ou explica em "attention" por que está certo assim.
          const seen = (ctx.planWarnings ??= new Set())
          const fresh = review.warnings.filter((w) => !seen.has(w))
          if (fresh.length) {
            fresh.forEach((w) => seen.add(w))
            const text = [
              'Revisão do gBot: o plano ainda não foi mostrado. Para cada ponto abaixo, ajuste o plano ou, se estiver certo assim',
              '(ex.: o usuário pediu para ser automático), explique em "attention". Depois chame `propose_plan` de novo; estes',
              'mesmos pontos não bloqueiam mais. Não comente esta revisão com o usuário, só o resultado.',
              ...fresh.map((w) => `- ${w}`)
            ]
            return { content: [{ type: 'text', text: text.join('\n') }], isError: true }
          }
          return { content: [{ type: 'text', text: 'Plano mostrado ao usuário com o botão para aplicar. Aguarde a decisão dele.' }] }
        } catch (e) {
          return { content: [{ type: 'text', text: `Plano inválido, corrija e chame de novo: ${(e as Error).message}` }], isError: true }
        }
      }
    )
  }

  // O contexto é mutável (a cadeia muda a cada consulta): navegador e aprovações leem os valores na hora da chamada.
  const caller = {
    get conversationId() {
      return ctx.conversationId
    },
    get callerName() {
      return ctx.callerName
    },
    get signal() {
      return ctx.signal
    }
  }
  registerBrowserTools(server, caller)
  registerApprovalTool(server, caller)

  return server
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : undefined
}

function start(): Promise<{ server: Server; port: number }> {
  serverPromise ??= new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
      const ctx = contexts.get(token)
      if (!ctx || ctx.signal?.aborted || !req.url?.startsWith('/mcp')) {
        res.writeHead(401).end()
        return
      }
      // Modo sem estado: um servidor + transporte por requisição, já ligados ao contexto de quem chama.
      if (req.method !== 'POST') {
        res.writeHead(405).end()
        return
      }
      try {
        const body = await readBody(req)
        ctx.signal?.throwIfAborted()
        const mcp = buildServer(ctx)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
        res.on('close', () => {
          void transport.close()
          void mcp.close()
        })
        await mcp.connect(transport)
        await transport.handleRequest(req, res, body)
      } catch {
        if (!res.headersSent) res.writeHead(500).end()
      }
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port }))
  })
  return serverPromise
}

/** Registra quem vai chamar e devolve o JSON para `--mcp-config`, com um token só dessa sessão. */
/** Endereço do servidor e token próprio desta sessão (outros provedores, como o Codex, configuram assim). */
export async function mcpEndpointFor(ctx: CallerContext): Promise<{ url: string; token: string }> {
  const { port } = await start()
  const token = randomBytes(24).toString('hex')
  contexts.set(token, ctx)
  return { url: `http://127.0.0.1:${port}/mcp`, token }
}

export async function mcpConfigFor(ctx: CallerContext): Promise<{ config: string; token: string }> {
  const { url, token } = await mcpEndpointFor(ctx)
  const config = JSON.stringify({ mcpServers: { gbot: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } })
  return { config, token }
}
