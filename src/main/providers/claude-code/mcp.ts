import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { ASK_BOT_TOOL, LIST_BOTS_TOOL } from './tools'

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
}

export interface BotHandlers {
  list(ctx: CallerContext): string
  ask(ctx: CallerContext, bot: string, message: string, signal: AbortSignal): Promise<string>
}

/** Ferramentas liberadas sem pedir permissão em toda sessão aberta pelo gBot. */
export const GBOT_TOOLS = [LIST_BOTS_TOOL, ASK_BOT_TOOL]

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
export async function mcpConfigFor(ctx: CallerContext): Promise<{ config: string; token: string }> {
  const { port } = await start()
  const token = randomBytes(24).toString('hex')
  contexts.set(token, ctx)
  const config = JSON.stringify({
    mcpServers: {
      gbot: { type: 'http', url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: `Bearer ${token}` } }
    }
  })
  return { config, token }
}
