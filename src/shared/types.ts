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
export type AvatarMood = 'idle' | 'thinking' | 'talking' | 'happy' | 'attention' | 'sleeping'

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
  /** De quem é a memória usada e preenchida nesta mensagem (bot da conversa ou fluxo). */
  memory?: MemoryOwner
  /** Mensagem disparada por um fluxo (para a memória registrar a origem). */
  origin?: { kind: 'flow'; id: string }
}

/** Eventos que um provedor emite enquanto responde. */
export type ChatEvent =
  | { type: 'mood'; mood: AvatarMood }
  | { type: 'delta'; text: string }
  | { type: 'tool'; tool: ToolActivity }
  | { type: 'notice'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** Navegador que o gBot pode abrir (Edge, Chrome...), com perfil próprio. */
export interface BrowserInfo {
  id: string
  name: string
  installed: boolean
}

/** Configurações do app guardadas no processo principal. */
export interface AppSettings {
  /** Navegador usado pelas ferramentas de navegação. Ausente = o primeiro instalado (Edge, depois Chrome). */
  browserId?: string
  /** Pedir aprovação antes de o navegador agir num site (desligado por padrão). */
  browserApprovals?: boolean
  /** Sites em que o usuário escolheu "Permitir sempre" (só usado com a aprovação ligada). */
  allowedSites: string[]
}

/** `conversation`: vale para o site nesta conversa; `always`: vale para o site em qualquer conversa. */
export type ApprovalDecision = 'conversation' | 'always' | 'deny'

/** Pedido de aprovação de uma ação (ex.: o navegador abrir ou clicar num site). */
export interface ApprovalRequest {
  id: string
  conversationId?: string
  /** Bot que pediu; vazio quando é o assistente de uma conversa normal. */
  requester: string
  /** Site afetado (ex.: github.com). */
  host: string
  /** Descrição curta da ação (ex.: "Abrir https://github.com/login"). */
  action: string
}

// ── Memória (procedimentos aprendidos) ──────────────────────────────

/** Dono de uma memória: um bot ou um fluxo. */
export interface MemoryOwner {
  kind: 'bot' | 'flow'
  id: string
}

/**
 * Procedimento aprendido: curto e objetivo, porque vai inteiro no prompt de sistema do dono.
 * O próprio bot/fluxo registra (ferramenta save_lesson) quando descobre como fazer algo que falhou;
 * o usuário pode ver, editar, desligar e apagar.
 */
export interface Lesson {
  id: string
  owner: MemoryOwner
  /** Nome curto do procedimento (ex.: "Enviar mensagem no WhatsApp Web"). */
  title: string
  /** Quando usar (ex.: "ao mandar texto longo num grupo"). */
  when: string
  /** Passos ou cuidados, em poucas linhas. */
  steps: string
  /** Por que foi registrado (o que deu errado antes). Não vai para o prompt. */
  why: string
  /** De onde veio: conversa, execução de fluxo ou manual. */
  source: { kind: 'conversation' | 'flow' | 'manual'; id?: string }
  enabled: boolean
  createdAt: number
  updatedAt: number
}

// ── Fluxos (canvas de automações) ───────────────────────────────────

/**
 * Agenda do gatilho:
 *   `times`: nos dias da semana escolhidos (0 = domingo), em cada horário "HH:MM"
 *   `interval`: a cada N minutos
 */
export type FlowSchedule =
  | { mode: 'times'; days: number[]; times: string[] }
  | { mode: 'interval'; everyMinutes: number }

/** Tarefa de um bot: ele faz uma por vez (fluxos, conversas e consultas de outros bots); as outras esperam na fila. */
export interface BotTask {
  id: string
  botId: string
  /** Ex.: 'Fluxo "Resumo" · Escrever post' ou 'Conversa "Ideias"'. */
  label: string
  origin: 'flow' | 'chat' | 'consult'
  /** Fluxo ou conversa de onde veio. */
  originId?: string
  status: 'running' | 'waiting'
  queuedAt: number
  startedAt?: number
}

export type FlowNodeType = 'trigger' | 'bot' | 'prompt' | 'decision'

/** Uma saída da caixinha de decisão: "quando acontecer X" → segue pela ligação desta opção. */
export interface FlowDecisionOption {
  id: string
  label: string
}

export interface FlowNodeData {
  /** Nome da caixinha no canvas (opcional; senão usa o padrão do tipo). */
  label?: string
  // gatilho
  schedule?: FlowSchedule
  // bot
  botId?: string
  // bot e prompt: texto enviado (o resultado das caixinhas anteriores vai junto; {{anterior}} posiciona)
  message?: string
  // prompt e decisão
  providerId?: string
  model?: string
  // decisão: as opções (cada uma com sua bolinha de saída); `message` vira o critério extra
  options?: FlowDecisionOption[]
}

export interface FlowNode {
  id: string
  type: FlowNodeType
  position: { x: number; y: number }
  data: FlowNodeData
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  /** Bolinha de saída usada (na decisão, o id da opção). */
  sourceHandle?: string
}

export interface Flow {
  id: string
  name: string
  /** Só fluxos ativos disparam pelo gatilho (o "Rodar agora" funciona sempre). */
  enabled: boolean
  /** Projeto do fluxo; ausente = fluxo solto. Caixinhas de prompt usam a pasta e as instruções dele. */
  projectId?: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  createdAt: number
  updatedAt: number
}

export type FlowStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface FlowRunStep {
  nodeId: string
  label: string
  status: FlowStepStatus
  output?: string
  error?: string
  /** Avisos da execução (ex.: uma ferramenta precisou de permissão e foi negada). */
  notices?: string[]
  /** Na decisão: a opção escolhida. */
  chosen?: string
  startedAt?: number
  finishedAt?: number
}

export interface FlowRun {
  id: string
  flowId: string
  trigger: 'schedule' | 'manual'
  status: 'running' | 'done' | 'error'
  startedAt: number
  finishedAt?: number
  steps: FlowRunStep[]
}

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
    /** Remove o projeto; bots, conversas e fluxos dele continuam existindo, soltos. */
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
    /** Tarefas rodando e na fila de todos os bots. */
    tasks(): Promise<BotTask[]>
    cancelTask(id: string): Promise<void>
    onTasks(cb: (tasks: BotTask[]) => void): () => void
  }
  conversations: {
    list(): Promise<ConversationMeta[]>
    get(id: string): Promise<Conversation | undefined>
    save(conversation: Conversation): Promise<void>
    remove(id: string): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  browser: {
    list(): Promise<BrowserInfo[]>
    /** Abre (ou traz para frente) a janela do navegador do gBot. */
    open(): Promise<void>
  }
  approvals: {
    onRequest(listener: (req: ApprovalRequest) => void): () => void
    /** Avisa que um pedido foi respondido (aqui ou expirou), para tirar o cartão da tela. */
    onResolved(listener: (id: string) => void): () => void
    respond(id: string, decision: ApprovalDecision): Promise<void>
  }
  memory: {
    list(owner: MemoryOwner): Promise<Lesson[]>
    save(lesson: Lesson): Promise<void>
    remove(owner: MemoryOwner, id: string): Promise<void>
    /** Avisa quando a memória de alguém mudou (ex.: um bot aprendeu algo durante uma conversa). */
    onChanged(listener: (owner: MemoryOwner) => void): () => void
  }
  flows: {
    list(): Promise<Flow[]>
    save(flow: Flow): Promise<void>
    remove(id: string): Promise<void>
    /** Roda o fluxo agora (sem esperar o gatilho); resolve com o id da execução. */
    run(id: string): Promise<string>
    runs(flowId: string): Promise<FlowRun[]>
    /** Atualizações ao vivo das execuções (início, cada caixinha, fim). */
    onRunUpdate(listener: (run: FlowRun) => void): () => void
  }
  chat: {
    send(req: SendMessageRequest): Promise<void>
    cancel(requestId: string): Promise<void>
    onEvent(listener: (requestId: string, event: ChatEvent) => void): () => void
  }
}
