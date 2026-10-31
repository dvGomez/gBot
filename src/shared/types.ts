/**
 * Tipos compartilhados entre o processo principal (main), o preload e a interface (renderer).
 */

/**
 * Avatar em pixel art, desenhado como texto numa grade 12×12:
 *   `.` vazio · `b` corpo · `d` sombra · `x` detalhe (antena, chifre, coroa...)
 * Olhos e boca são desenhados por cima, de acordo com o humor.
 */
export interface AvatarDef {
  id: string
  name: string
  personality: string
  color: string
  shade: string
  accent?: string
  /** Linha dos olhos e da boca dentro da grade. */
  eyeRow: number
  mouthRow: number
  sprite: string[]
}

/** Humor do avatar — reflete o que o provedor está fazendo. */
export type AvatarMood = 'idle' | 'thinking' | 'talking' | 'happy' | 'attention'

/**
 * Como o provedor fala com o modelo:
 * - `local-cli`: um programa instalado na máquina (ex.: Claude Code, logado na sua assinatura)
 * - `api`: chamada direta a uma API com chave (ex.: Anthropic API, OpenAI...)
 * - `dev`: provedor de teste, sem modelo real
 */
export type ProviderKind = 'local-cli' | 'api' | 'dev'

export type ProviderStatus = 'ready' | 'not-configured' | 'unavailable' | 'coming-soon'

export interface ProviderInfo {
  id: string
  name: string
  kind: ProviderKind
  description: string
  status: ProviderStatus
  /** Texto curto explicando o status (versão encontrada, plano, motivo do erro...). */
  statusDetail?: string
  /** Ações disponíveis agora (ex.: entrar, sair). */
  actions?: ProviderAction[]
}

export interface ProviderAction {
  id: string
  label: string
  primary?: boolean
}

/** Progresso de uma ação demorada (ex.: login no navegador). */
export interface ProviderActionProgress {
  providerId: string
  actionId: string
  text: string
  /** Link para o usuário abrir, se o navegador não abriu sozinho. */
  url?: string
}

/** Uma ferramenta que o assistente usou durante a resposta (ler arquivo, rodar comando...). */
export interface ToolActivity {
  id: string
  name: string
  summary: string
  status: 'running' | 'done' | 'error'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
  providerId?: string
  error?: boolean
  tools?: ToolActivity[]
  /** Avisos curtos sobre a resposta (permissão negada, nova tentativa...). */
  notices?: string[]
}

/** Agente especializado: nome, avatar e instruções próprias. */
export interface Bot {
  id: string
  name: string
  avatar: AvatarDef
  /** Uma frase sobre o que o bot faz (mostrada na lista e usada por outros bots para decidir a quem perguntar). */
  description: string
  /** Instruções que especializam o bot (vão para o prompt de sistema). */
  instructions: string
  createdAt: number
  updatedAt: number
}

export interface ConversationMeta {
  id: string
  title: string
  /** Bot desta conversa; ausente numa conversa normal. */
  botId?: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface Conversation extends ConversationMeta {
  messages: ChatMessage[]
}

/** Como o assistente se apresenta na conversa (vem do avatar escolhido). */
export interface Persona {
  name: string
  personality: string
}

export interface SendMessageRequest {
  requestId: string
  providerId: string
  conversationId: string
  text: string
  history: Pick<ChatMessage, 'role' | 'text'>[]
  persona?: Persona
  /** Quando a conversa é com um bot: as instruções dele. */
  bot?: Pick<Bot, 'id' | 'name' | 'description' | 'instructions'>
}

/** Eventos que um provedor emite enquanto responde. */
export type ChatEvent =
  | { type: 'mood'; mood: AvatarMood }
  | { type: 'delta'; text: string }
  | { type: 'tool'; tool: ToolActivity }
  | { type: 'notice'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** API exposta pelo preload em `window.gbot`. */
export interface GbotApi {
  platform: string
  versions: { app: string; electron: string }
  providers: {
    list(): Promise<ProviderInfo[]>
    /** Executa uma ação do provedor; resolve com uma mensagem final ou rejeita com o erro. */
    runAction(providerId: string, actionId: string): Promise<string | undefined>
    onActionProgress(listener: (progress: ProviderActionProgress) => void): () => void
  }
  bots: {
    list(): Promise<Bot[]>
    save(bot: Bot): Promise<void>
    remove(id: string): Promise<void>
    /** Sugere nome e descrição a partir das instruções (usa o Claude Code se estiver conectado). */
    suggest(instructions: string): Promise<{ name: string; description: string }>
  }
  conversations: {
    list(): Promise<ConversationMeta[]>
    get(id: string): Promise<Conversation | undefined>
    save(conversation: Conversation): Promise<void>
    remove(id: string): Promise<void>
  }
  chat: {
    send(req: SendMessageRequest): Promise<void>
    cancel(requestId: string): Promise<void>
    onEvent(listener: (requestId: string, event: ChatEvent) => void): () => void
  }
}
