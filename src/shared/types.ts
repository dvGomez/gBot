/**
 * Tipos compartilhados entre o processo principal (main), o preload e a interface (renderer).
 */

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
  chat: {
    send(req: SendMessageRequest): Promise<void>
    cancel(requestId: string): Promise<void>
    onEvent(listener: (requestId: string, event: ChatEvent) => void): () => void
  }
}
