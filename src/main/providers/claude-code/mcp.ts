import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { Lesson, MemoryOwner } from '@shared/types'
import { BROWSER_TOOL_NAMES, registerBrowserTools } from '../../browser/tools'
import { learn } from '../../memory'
import { answersText, askUser } from '../../questions'
import { registerApprovalTool } from './permissions'
import { planSchema, sanitizePlan } from './architect'
import { ASK_BOT_TOOL, ASK_USER_TOOL, LIST_BOTS_TOOL, PROPOSE_PLAN_TOOL } from './tools'

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
  /** Bots já envolvidos nesta cadeia de consultas (evita A → B → A). */
  chain: string[]
  depth: number
  /** Memória usada por esta sessão (bot ou fluxo); sem ela, save_lesson não é oferecida. */
  memory?: MemoryOwner
  /** Origem registrada nas lições aprendidas. */
  memorySource?: Lesson['source']
  /** Conversa com o arquiteto: ganha a ferramenta `propose_plan`. */
  architect?: boolean
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
  ...BROWSER_TOOL_NAMES.map((n) => `mcp__gbot__${n}`),
  'mcp__gbot__save_lesson',
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
        'Lista os bots especializados do gBot (nome e o que cada um faz). Use antes de ask_bot se não souber quais bots existem.',
      inputSchema: {}
    },
    async () => ({ content: [{ type: 'text', text: handlers?.list(ctx) ?? 'Nenhum bot disponível.' }] })
  )

  server.registerTool(
    'ask_bot',
    {
      description:
        'Envia uma pergunta ou tarefa a um bot especializado do gBot e devolve a resposta dele. Use quando o pedido do usuário ' +
        'combinar com a especialidade de um bot, ou quando o usuário pedir para consultar um bot. Escreva a mensagem completa, ' +
        'com o contexto necessário: o bot não vê esta conversa.',
      inputSchema: {
        bot: z.string().describe('Nome (ou id) do bot, como aparece em list_bots'),
        message: z.string().describe('A pergunta ou tarefa para o bot, com todo o contexto necessário')
      }
    },
    async ({ bot, message }, extra) => {
      if (!handlers) return { content: [{ type: 'text', text: 'Bots indisponíveis.' }], isError: true }
      try {
        const answer = await handlers.ask(ctx, bot, message, extra.signal)
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
          why: z.string().describe('O que deu errado antes (uma frase)')
        }
      },
      async (input) => {
        const owner = ctx.memory!
        const source = ctx.memorySource ?? { kind: 'conversation' as const, id: ctx.conversationId }
        const { updated } = learn(owner, input, source)
        return { content: [{ type: 'text', text: updated ? 'Lição atualizada na memória.' : 'Lição salva na memória.' }] }
      }
    )
  }

  server.registerTool(
    'ask_user',
    {
      description:
        'Faz ao usuário de 1 a 4 perguntas com opções, mostradas como um cartão no chat, e devolve as respostas. Use quando ' +
        'faltar uma informação ou decisão que muda o resultado (ex.: qual formato, para quem enviar, qual das abordagens). ' +
        'Não use para o que dá para decidir com bom senso nem para pedir permissão (o gBot já pergunta isso sozinho).',
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
                .min(2)
                .max(4),
              multiSelect: z.boolean().optional().describe('true quando dá para escolher mais de uma opção')
            })
          )
          .min(1)
          .max(4)
      }
    },
    async ({ questions }, extra) => {
      // Fluxos e bots consultados por outros não têm ninguém olhando o chat: seguem sozinhos.
      if (ctx.depth > 0 || ctx.memorySource?.kind === 'flow') {
        return { content: [{ type: 'text', text: 'Não há ninguém para responder agora. Decida com bom senso e siga, dizendo o que escolheu.' }] }
      }
      const answers = await askUser({ conversationId: ctx.conversationId, requester: ctx.callerName, questions }, extra.signal)
      return { content: [{ type: 'text', text: answersText(questions, answers) }] }
    }
  )

  if (ctx.architect) {
    server.registerTool(
      'propose_plan',
      {
        description:
          'Mostra ao usuário o plano do que criar no gBot (projeto, bots e fluxos), num cartão com o botão "Criar tudo". ' +
          'Chame depois de testar o que for incerto. Quem cria é o usuário, pelo cartão: não crie nada você mesmo.',
        inputSchema: planSchema.shape
      },
      async (input) => {
        try {
          sanitizePlan(input)
          return { content: [{ type: 'text', text: 'Plano mostrado ao usuário com o botão "Criar tudo". Aguarde a decisão dele.' }] }
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
      if (!ctx || !req.url?.startsWith('/mcp')) {
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
