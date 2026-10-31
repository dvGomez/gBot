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

/** Modelo oferecido por um provedor. `id` é o que vai para o provedor (ex.: alias `opus` do Claude Code). */
export interface ProviderModel {
  id: string
  label: string
  description?: string
}

/** Valor de modelo que significa "o padrão do provedor/conta". */
export const DEFAULT_MODEL = 'default'

export interface ProviderInfo {
  id: string
  name: string
  kind: ProviderKind
  description: string
  /** Modelos que dá para escolher por conversa ou bot (o primeiro é o padrão). */
  models?: ProviderModel[]
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
  /** Quando a ferramenta é uma consulta a outro bot: o nome pedido e a resposta recebida. */
  botName?: string
  detail?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
  providerId?: string
  /** Modelo usado nesta resposta. */
  model?: string
  /** Bot que respondeu, quando não é o da conversa (ex.: chamado com @menção). */
  botId?: string
  error?: boolean
  tools?: ToolActivity[]
  /** Avisos curtos sobre a resposta (permissão negada, nova tentativa...). */
  notices?: string[]
}

/** Agrupa bots e conversas. Pasta e instruções são opcionais e podem ser definidas depois. */
export interface Project {
  id: string
  name: string
  description: string
  /** Instruções que valem para todas as conversas e bots do projeto. */
  instructions: string
  /** Pasta de trabalho do Claude nas conversas do projeto (ausente = pasta padrão do gBot). */
  folder?: string
  /** Cor do projeto no app. */
  color: string
  createdAt: number
  updatedAt: number
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
  /** Modelo do bot (conversas com ele e consultas de outros bots). Ausente = padrão. */
  model?: string
  /** Projeto do bot; ausente = bot solto, disponível em qualquer lugar. */
  projectId?: string
  createdAt: number
  updatedAt: number
}

export interface ConversationMeta {
  id: string
  title: string
  /** Bot desta conversa; ausente numa conversa normal. */
  botId?: string
  /** Projeto da conversa; ausente = conversa solta. */
  projectId?: string
  /** Modelo escolhido para a conversa. Ausente = padrão. */
  model?: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface Conversation extends ConversationMeta {
  messages: ChatMessage[]
}

export interface SendMessageRequest {
  requestId: string
  providerId: string
  conversationId: string
  text: string
  history: Pick<ChatMessage, 'role' | 'text'>[]
  /** Quando a conversa é com um bot: as instruções dele. */
  bot?: Pick<Bot, 'id' | 'name' | 'description' | 'instructions'>
  /** Bot chamado diretamente com @menção: a mensagem vai para ele, não para o assistente da conversa. */
  targetBotId?: string
  /** Projeto da conversa (pasta de trabalho, instruções e bots visíveis). */
  projectId?: string
  /** Modelo da conversa (ignorado em @menções: o bot mencionado usa o modelo dele). */
  model?: string
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
  projects: {
    list(): Promise<Project[]>
    save(project: Project): Promise<void>
    /** Remove o projeto; bots e conversas dele continuam existindo, soltos. */
    remove(id: string): Promise<void>
    /** Abre o seletor de pastas do sistema; undefined se o usuário cancelar. */
    pickFolder(current?: string): Promise<string | undefined>
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
