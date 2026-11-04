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

/** Um limite de uso da assinatura (ex.: a janela de 5 horas, o semanal). */
export interface UsageLimit {
  id: string
  label: string
  /** Quanto já foi usado, de 0 a 100. */
  percent: number
  /** Quando zera (ISO). */
  resetsAt?: string
}

/** Uma conta conectada a um provedor (ex.: uma conta Claude). A ativa atende conversas, bots e fluxos. */
export interface ProviderAccount {
  id: string
  providerId: string
  /** Apelido dado pelo usuário, senão o e-mail. */
  label: string
  /** Apelido dado pelo usuário (vazio = mostra o e-mail). */
  name?: string
  email?: string
  organization?: string
  /** Plano da assinatura (ex.: pro, max, team). */
  plan?: string
  active: boolean
  loggedIn: boolean
  limits: UsageLimit[]
  /** Quando os limites foram lidos (ms); ausente = ainda não leu. */
  limitsAt?: number
  /** Por que a última leitura dos limites falhou (os mostrados podem estar desatualizados). */
  limitsError?: string
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
  /** Tokens que esta resposta gastou (sem as consultas a outros bots, que têm sessão própria). */
  usage?: TokenUsage
  /**
   * Na resposta: arquivos criados ou alterados na pasta de trabalho durante ela.
   * Na mensagem do usuário: os anexos que ele mandou.
   */
  files?: ChatFile[]
  /** Ordem em que texto e ferramentas aconteceram na resposta (mensagens antigas não têm). */
  steps?: MessageStep[]
  /** Na conversa com o arquiteto: o plano proposto nesta resposta (cartão com "Criar tudo"). */
  plan?: AutomationPlan
  /** Avatares sorteados para os bots novos do plano (para a prévia e a criação baterem). */
  planAvatars?: Record<string, AvatarDef>
  /** O que foi criado a partir do plano, depois de "Criar tudo". */
  planApplied?: { projectId?: string; specializationIds: string[]; botIds: string[]; flowIds: string[] }
}

/** Arquivo gerado numa resposta ou anexado pelo usuário (mostrado como anexo no chat). */
export interface ChatFile {
  path: string
  name: string
  size: number
  /** Miniatura (data URL) quando é uma imagem anexada. */
  thumb?: string
}

/** Um trecho da resposta, na ordem em que aconteceu: texto escrito ou uma ferramenta usada. */
export type MessageStep = { kind: 'text'; text: string } | { kind: 'tool'; id: string }

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

/**
 * Especialização: um conhecimento ou procedimento (instruções, arquivos de referência e lições aprendidas) que os bots
 * usam. Não tem vida própria: quem trabalha, conversa e roda rotinas é o bot.
 */
export interface Specialization {
  id: string
  name: string
  /** Uma frase sobre o que a especialização faz (mostrada nas listas e no prompt dos bots que a usam). */
  description: string
  /** Instruções da especialização (vão para o prompt de quem a usa). */
  instructions: string
  /** Projeto da especialização; ausente = disponível em qualquer lugar. */
  projectId?: string
  createdAt: number
  updatedAt: number
}

/**
 * Bot: membro vivo do time. Tem nome, avatar e personalidade, usa especializações, roda rotinas agendadas e conversa.
 * Faz uma tarefa por vez (rotinas, conversas e consultas de outros bots entram na fila dele).
 */
export interface Bot {
  id: string
  name: string
  avatar: AvatarDef
  /** Uma frase sobre o que o bot faz (mostrada na lista e usada por outros bots para decidir a quem perguntar). */
  description: string
  /** Personalidade e orientações gerais do bot (vão para o prompt de sistema). */
  instructions: string
  /** Especializações que o bot usa (as instruções delas vão no prompt dele). */
  specializationIds: string[]
  /** Provedor do bot; ausente = Claude Code. */
  providerId?: string
  /** Modelo do bot (conversas, rotinas e consultas de outros bots). Ausente = padrão. */
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
  /** `architect`: conversa da página inicial que testa e propõe o que criar (bots, fluxos, projeto). */
  mode?: 'architect'
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
  /** Especializações chamadas com / nesta mensagem: as instruções delas vão junto só nesta mensagem. */
  specializationIds?: string[]
  /** Internal delegation chain, preserving recursion guards across providers. */
  botChain?: string[]
  /** Projeto da conversa (pasta de trabalho, instruções e bots visíveis). */
  projectId?: string
  /** Modelo da conversa (ignorado em @menções: o bot mencionado usa o modelo dele). */
  model?: string
  /** Mensagem disparada por uma rotina (para a memória e o consumo registrarem a origem). */
  origin?: { kind: 'flow'; id: string }
  /** Arquivos que o usuário anexou nesta mensagem (já copiados para a pasta de anexos da conversa). */
  attachments?: ChatFile[]
  /** Conversa com o arquiteto (testa e propõe o que criar). */
  architect?: boolean
}

// ── Consumo de tokens ───────────────────────────────────────────────

/**
 * Tokens gastos numa resposta (ou a soma de várias). `cost` é o preço equivalente na API, em US$: na assinatura
 * nada é cobrado, mas é a melhor medida do peso no limite (ler do cache custa bem menos que tokens novos).
 */
export interface TokenUsage {
  /** Tokens novos de entrada (fora do cache). */
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
}

/** Um gasto registrado, com quem gastou. */
export interface UsageRecord extends TokenUsage {
  at: number
  /**
   * `conversation`: resposta numa conversa · `mention`: bot chamado com @ · `consult`: bot consultado por outro ·
   * `flow`: caixinha de uma rotina · `reflection`: registro automático de lição · `suggest`: sugestão de nome do bot ·
   * `plan`: sugestão do que criar, na página inicial
   */
  kind: 'conversation' | 'mention' | 'consult' | 'flow' | 'reflection' | 'suggest' | 'plan'
  conversationId?: string
  botId?: string
  flowId?: string
  /** Modelo que gastou (ex.: claude-sonnet-4-5-20250929). */
  model?: string
}

export interface UsageSummary {
  today: TokenUsage
  /** Últimos 7 dias. */
  week: TokenUsage
  /** O que mais gastou nos últimos 7 dias (rotina, senão bot, senão conversa), do maior para o menor. */
  top: { kind: 'flow' | 'bot' | 'conversation'; id: string; usage: TokenUsage }[]
}

/** Eventos que um provedor emite enquanto responde. */
export type ChatEvent =
  | { type: 'mood'; mood: AvatarMood }
  | { type: 'delta'; text: string }
  | { type: 'tool'; tool: ToolActivity }
  | { type: 'notice'; text: string }
  | { type: 'files'; files: ChatFile[] }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'plan'; plan: AutomationPlan }
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
  /** Defaults to the OS language; unsupported OS languages use English. */
  language?: 'system' | 'en' | 'pt-BR'
  /** Download new releases in the background. Installing always waits for an explicit restart. */
  autoDownloadUpdates?: boolean
  /** Version the user chose to skip; updates never gate access to the application. */
  ignoredUpdateVersion?: string
  /** Navegador usado pelas ferramentas de navegação. Ausente = o primeiro instalado (Edge, depois Chrome). */
  browserId?: string
  /** Pedir aprovação antes de o navegador agir num site (desligado por padrão). */
  browserApprovals?: boolean
  /** Sites em que o usuário escolheu "Permitir sempre" (só usado com a aprovação ligada). */
  allowedSites: string[]
  /**
   * Liberar sem perguntar os comandos e ações do Claude Code que pedem permissão (desligado por padrão).
   * Criar e editar arquivos na pasta de trabalho nunca pergunta.
   */
  autoApproveTools?: boolean
  /** Ações liberadas com "Sempre permitir" (ex.: `Bash:textutil`, `Write:/Users/x/Documentos`). */
  allowedTools?: string[]
}

/** `conversation`: vale para o site nesta conversa; `always`: vale para o site em qualquer conversa. */
export type ApprovalDecision = 'conversation' | 'always' | 'deny'

/** Pedido de aprovação de uma ação (ex.: o navegador abrir ou clicar num site). */
export interface ApprovalRequest {
  id: string
  /** `site`: o navegador num site; `tool`: um comando ou outra ação do Claude Code fora da pasta de trabalho. */
  kind?: 'site' | 'tool'
  conversationId?: string
  /** Bot que pediu; vazio quando é o assistente de uma conversa normal. */
  requester: string
  /** O que "Sempre" libera: o site (ex.: github.com) ou a regra da ação (ex.: `Bash:textutil`). */
  host: string
  /** Descrição curta da ação (ex.: "Abrir https://github.com/login" ou o comando). */
  action: string
  /** Texto do botão "Sempre" quando é uma ação (ex.: "Sempre permitir textutil"). */
  alwaysLabel?: string
}

// ── Memória (procedimentos aprendidos) ──────────────────────────────

/**
 * Dono de uma memória: uma especialização (o "como fazer X") ou um bot (como as rotinas e o trabalho dele funcionam).
 */
export interface MemoryOwner {
  kind: 'specialization' | 'bot'
  id: string
}

/**
 * Procedimento aprendido: curto e objetivo, porque vai inteiro no prompt de sistema do dono.
 * O próprio bot registra (ferramenta save_lesson), na memória dele ou na de uma especialização que usa; quando descobre como fazer algo que falhou;
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
  /** De onde veio: conversa, execução de rotina ou manual. */
  source: { kind: 'conversation' | 'flow' | 'manual'; id?: string }
  enabled: boolean
  createdAt: number
  updatedAt: number
}

/** Nota da memória automática do Claude Code (desligada no gBot; mostrada para apagar ou trazer para um bot). */
export interface AutoMemoryNote {
  path: string
  name: string
  description: string
  body: string
  /** Pasta de trabalho em que foi criada, como o Claude Code codifica (tudo que não é letra ou número vira "-"). */
  folder: string
}

// ── Rotinas dos bots (canvas de automações) ─────────────────────────

/**
 * Agenda do gatilho:
 *   `times`: nos dias da semana escolhidos (0 = domingo), em cada horário "HH:MM"
 *   `interval`: a cada N minutos
 */
export type FlowSchedule =
  | { mode: 'times'; days: number[]; times: string[] }
  | { mode: 'interval'; everyMinutes: number }

/** Arquivo de referência de uma especialização: quem a usa vê a lista no prompt e lê o conteúdo quando precisar. */
export interface SpecializationFile {
  name: string
  size: number
  addedAt: number
  /** Nota curta do usuário sobre o arquivo (vai no prompt junto com o nome). */
  note?: string
}

/** Tarefa de um bot: ele faz uma por vez (rotinas, conversas e consultas de outros bots); as outras esperam na fila. */
export interface BotTask {
  id: string
  botId: string
  /** Ex.: 'Rotina "Resumo" · Escrever post' ou 'Conversa "Ideias"'. */
  label: string
  origin: 'flow' | 'chat' | 'consult'
  /** Rotina ou conversa de onde veio. */
  originId?: string
  status: 'running' | 'waiting'
  queuedAt: number
  startedAt?: number
}

/**
 * `task`: o bot da rotina faz uma tarefa (opcionalmente com uma especialização) · `decision`: o modelo escolhe um caminho ·
 * `confirm`: pausa a rotina e pede ao usuário para escolher uma das opções (notificação do sistema + pendências).
 */
export type FlowNodeType = 'trigger' | 'task' | 'decision' | 'confirm'

/** Uma saída da caixinha de decisão: "quando acontecer X" → segue pela ligação desta opção. */
export interface FlowDecisionOption {
  id: string
  label: string
}

export interface FlowNodeData {
  /** Nome da caixinha no canvas (opcional; senão usa o padrão do tipo). */
  label?: string
  // gatilho: agenda (ausente = só roda quando o usuário mandar) e se dispara sozinho pela agenda
  schedule?: FlowSchedule
  enabled?: boolean
  // tarefa: especialização usada nesta etapa (ausente = o bot faz com o que já sabe)
  specializationId?: string
  // tarefa: texto enviado (o resultado das caixinhas anteriores vai junto; {{anterior}} posiciona)
  message?: string
  // tarefa e decisão: modelo próprio da caixinha (ausente = o do bot; na decisão, um rápido)
  providerId?: string
  model?: string
  // decisão e confirmação: as opções (cada uma com sua bolinha de saída). Na decisão, `message` vira o critério
  // extra; na confirmação, é o que o usuário precisa confirmar.
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

/**
 * Fluxo de um bot (um por bot): o canvas com as caixinhas e um ou mais gatilhos. Cada gatilho é uma rotina: tem agenda
 * e liga/desliga próprios e, quando dispara, roda só as caixinhas ligadas a ele. O bot executa as tarefas; a pasta e as
 * instruções vêm do projeto dele.
 */
export interface Flow {
  id: string
  /** Bot dono do fluxo. */
  botId: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  createdAt: number
  updatedAt: number
}

/** `waiting`: caixinha de confirmação esperando a escolha do usuário · `stopped`: o usuário parou a rotina. */
export type FlowStepStatus = 'pending' | 'running' | 'waiting' | 'done' | 'error' | 'skipped' | 'stopped'

export interface FlowRunStep {
  nodeId: string
  label: string
  status: FlowStepStatus
  output?: string
  error?: string
  /** Avisos da execução (ex.: uma ferramenta precisou de permissão e foi negada). */
  notices?: string[]
  /** Na decisão e na confirmação: a opção escolhida. */
  chosen?: string
  /** Na confirmação: o comentário que o usuário escreveu junto com a escolha. */
  note?: string
  /** Arquivos que a caixinha criou ou alterou na pasta de trabalho. */
  files?: ChatFile[]
  /** Tokens que a caixinha gastou. */
  usage?: TokenUsage
  startedAt?: number
  finishedAt?: number
}

export interface FlowRun {
  id: string
  flowId: string
  /** Gatilho que iniciou a execução, e o nome dele na hora (continua no histórico se o gatilho mudar). */
  triggerId: string
  triggerLabel: string
  trigger: 'schedule' | 'manual'
  /** `stopped`: o usuário parou no meio. */
  status: 'running' | 'done' | 'error' | 'stopped'
  startedAt: number
  finishedAt?: number
  steps: FlowRunStep[]
}

/**
 * Pergunta com opções que a IA faz ao usuário para entender melhor o pedido (no plano da página inicial e nas
 * conversas). O usuário escolhe uma opção (ou várias, com `multiSelect`) ou escreve outra resposta.
 */
export interface UserQuestion {
  question: string
  /** Rótulo curto da pergunta (ex.: "Envio", "Frequência"). */
  header: string
  options: { label: string; description?: string }[]
  multiSelect?: boolean
}

export interface QuestionAnswer {
  question: string
  answer: string
}

/** Perguntas da IA esperando resposta numa conversa. */
export interface QuestionRequest {
  id: string
  conversationId: string
  /** Quem pergunta (nome do bot; vazio = o assistente da conversa). */
  requester: string
  questions: UserQuestion[]
}

/** Uma especialização do plano: nova, ou uma que já existe (`existingId`) sendo reaproveitada. */
export interface PlanSpecialization {
  /** Apelido usado pelos bots e etapas do plano para apontar para esta especialização. */
  ref: string
  existingId?: string
  /** Com `existingId`: a existente é atualizada com os campos do plano (sem isso, só é reaproveitada). */
  edit?: boolean
  name: string
  description: string
  instructions: string
  /** Por que esta especialização entra no plano. */
  why: string
}

/**
 * Etapa de uma rotina do plano. Na decisão e na confirmação, a primeira opção segue para as próximas etapas; as outras
 * encerram.
 */
export type PlanStep =
  | { type: 'task'; label?: string; specialization?: string; message: string }
  | { type: 'decision'; label?: string; message: string; options: string[] }
  | { type: 'confirm'; label?: string; message: string; options: string[] }

export interface PlanRoutine {
  /** Rotina existente do bot que é refeita com estas etapas (mantém o id e se está ligada). */
  existingId?: string
  name: string
  why: string
  /** Ausente = só roda quando o usuário mandar. */
  schedule?: FlowSchedule
  steps: PlanStep[]
}

/** Um bot do plano: novo, ou um que já existe (`existingId`). */
export interface PlanBot {
  /** Apelido do bot no plano. */
  ref: string
  existingId?: string
  /** Com `existingId`: o bot existente é atualizado com os campos do plano (sem isso, só ganha as rotinas). */
  edit?: boolean
  name: string
  description: string
  /** Personalidade e orientações gerais. */
  instructions: string
  /** Refs das especializações que o bot usa (somadas às que ele já tem). */
  specializations: string[]
  /** Alias do modelo (ex.: sonnet); ausente = padrão. */
  model?: string
  routines: PlanRoutine[]
  /** Por que este bot entra no plano. */
  why: string
}

/** O que o gBot sugere criar para atender um pedido do usuário (página inicial). */
export interface AutomationPlan {
  title: string
  summary: string
  /** Projeto que reúne tudo: um existente ou um novo. */
  project?:
    | { existingId: string; edit?: boolean; name?: string; description?: string; instructions?: string }
    | { name: string; description: string; instructions: string }
  specializations: PlanSpecialization[]
  bots: PlanBot[]
  /** O que o usuário precisa fazer antes de ligar (ex.: entrar no WhatsApp Web no navegador do gBot). */
  setup: string[]
  /** O que o arquiteto testou de verdade antes de propor, com o que encontrou. */
  tested?: string[]
  /** Riscos, limitações e casos que o usuário precisa saber (o que pode dar errado e como o plano lida com isso). */
  attention?: string[]
  /** Melhorias opcionais fora do plano: o usuário escolhe no cartão e pede para incluir. */
  suggestions?: PlanSuggestion[]
}

/** Uma melhoria que o usuário não pediu, mas provavelmente quer. Não entra no plano até ele pedir. */
export interface PlanSuggestion {
  title: string
  detail: string
}

/** Um arquivo que uma conversa, bot ou rotina mexeu (painel de arquivos). */
export interface TouchedFile {
  path: string
  name: string
  /** O mais forte que aconteceu com ele no contexto: criado > alterado > anexado > lido. */
  action: 'created' | 'modified' | 'read' | 'attached'
  /** Última vez que foi mexido. */
  at: number
  /** Onde foi mexido (para abrir a conversa ou a rotina de origem). */
  conversationId?: string
  flowId?: string
  size?: number
  /** false quando o arquivo não existe mais. */
  exists?: boolean
}

/** De quem são os arquivos pedidos: uma conversa (inclui bots chamados nela), uma rotina ou um bot. */
export interface FilesFilter {
  conversationId?: string
  flowId?: string
  botId?: string
}

/** Uma caixinha de confirmação esperando o usuário (aparece na notificação do sistema e nas pendências do app). */
export interface PendingConfirmation {
  id: string
  flowId: string
  flowName: string
  runId: string
  nodeId: string
  /** Nome da caixinha. */
  title: string
  /** O que o usuário precisa confirmar. */
  message: string
  /** Resultado das caixinhas anteriores (o que está sendo confirmado). */
  detail?: string
  /** Arquivos das caixinhas anteriores (imagens vêm com miniatura). */
  files: ChatFile[]
  options: FlowDecisionOption[]
  createdAt: number
}

export interface AppUpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error' | 'development' | 'manual'
  currentVersion: string
  version?: string
  percent?: number
  error?: string
  dismissed?: boolean
}

/** API exposta pelo preload em `window.gbot`. */
export interface GbotApi {
  systemLocale(): Promise<string>
  updates: {
    get(): Promise<AppUpdateState>
    check(): Promise<void>
    download(): Promise<void>
    install(): Promise<void>
    dismiss(): Promise<void>
    openRelease(): Promise<void>
    onChanged(listener: (state: AppUpdateState) => void): () => void
  }
  platform: string
  versions: { app: string; electron: string }
  providers: {
    list(): Promise<ProviderInfo[]>
    /** Executa uma ação do provedor; resolve com uma mensagem final ou rejeita com o erro. */
    runAction(providerId: string, actionId: string): Promise<string | undefined>
    onActionProgress(listener: (progress: ProviderActionProgress) => void): () => void
  }
  /** Contas dos provedores que aceitam mais de uma (conectar uma nova é a ação `login` do provedor). */
  accounts: {
    /** Contas com os últimos limites lidos. */
    list(): Promise<ProviderAccount[]>
    /** Lê de novo os limites desatualizados (`force`: todos); avisa por `onChanged` quando terminar. */
    refreshLimits(force?: boolean): Promise<void>
    setActive(providerId: string, accountId: string): Promise<void>
    rename(providerId: string, accountId: string, name: string): Promise<void>
    /** Sai da conta e tira da lista. */
    remove(providerId: string, accountId: string): Promise<void>
    /** Avisa quando a lista, a conta ativa ou os limites mudaram. */
    onChanged(listener: () => void): () => void
  }
  projects: {
    list(): Promise<Project[]>
    save(project: Project): Promise<void>
    /** Remove o projeto; bots, conversas e fluxos dele continuam existindo, soltos. */
    remove(id: string): Promise<void>
    /** Abre o seletor de pastas do sistema; undefined se o usuário cancelar. */
    pickFolder(current?: string): Promise<string | undefined>
  }
  specializations: {
    list(): Promise<Specialization[]>
    save(specialization: Specialization): Promise<void>
    /** Remove a especialização (e tira dos bots que a usavam). */
    remove(id: string): Promise<void>
    /** Sugere nome e descrição a partir das instruções (usa o Claude Code se estiver conectado). */
    suggest(instructions: string): Promise<{ name: string; description: string }>
    files(specializationId: string): Promise<SpecializationFile[]>
    /** Copia os arquivos para a pasta da especialização; sem `files`, abre o seletor do sistema. */
    addFiles(specializationId: string, files?: File[]): Promise<SpecializationFile[]>
    removeFile(specializationId: string, name: string): Promise<void>
    setFileNote(specializationId: string, name: string, note: string): Promise<void>
    /** Mostra o arquivo no Finder/Explorer. */
    revealFile(specializationId: string, name: string): Promise<void>
  }
  bots: {
    list(): Promise<Bot[]>
    save(bot: Bot): Promise<void>
    /** Remove o bot com as rotinas, conversas e memória dele. */
    remove(id: string): Promise<void>
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
  files: {
    /** Abre um arquivo gerado no app padrão (executáveis só são mostrados na pasta). */
    open(path: string): Promise<void>
    reveal(path: string): Promise<void>
    /** Arquivos mexidos numa conversa, fluxo ou bot, do mais recente ao mais antigo. */
    touched(filter: FilesFilter): Promise<TouchedFile[]>
    /** Avisa quando arquivos novos foram mexidos (com o contexto onde aconteceu). */
    onTouched(listener: (ctx: FilesFilter) => void): () => void
  }
  attachments: {
    /** Copia arquivos (arrastados, colados ou escolhidos) para a pasta de anexos da conversa. */
    add(conversationId: string, files: File[]): Promise<ChatFile[]>
    /** Grava dados colados sem arquivo de origem (ex.: print copiado). */
    addData(conversationId: string, name: string, data: Uint8Array): Promise<ChatFile[]>
    /** Abre o seletor do sistema e copia o que for escolhido. */
    pick(conversationId: string): Promise<ChatFile[]>
  }
  browser: {
    list(): Promise<BrowserInfo[]>
    /** Abre (ou traz para frente) a janela do navegador do gBot. */
    open(): Promise<void>
  }
  confirmations: {
    list(): Promise<PendingConfirmation[]>
    /** Escolhe uma opção (com um comentário opcional, que vai junto para as próximas caixinhas). */
    respond(id: string, optionId: string, note?: string): Promise<void>
    /** Avisa quando entra ou sai uma pendência. */
    onChanged(listener: () => void): () => void
    /** Pedido para mostrar uma pendência (ex.: o usuário clicou na notificação). */
    onOpen(listener: (id: string) => void): () => void
  }
  questions: {
    onRequest(listener: (req: QuestionRequest) => void): () => void
    /** Avisa que as perguntas foram respondidas, expiraram ou o turno foi cancelado. */
    onResolved(listener: (id: string) => void): () => void
    /** Responde (sem respostas = deixa a IA decidir). */
    respond(id: string, answers?: QuestionAnswer[]): Promise<void>
  }
  approvals: {
    onRequest(listener: (req: ApprovalRequest) => void): () => void
    /** Avisa que um pedido foi respondido (aqui ou expirou), para tirar o cartão da tela. */
    onResolved(listener: (id: string) => void): () => void
    respond(id: string, decision: ApprovalDecision): Promise<void>
  }
  memory: {
    list(owner: MemoryOwner): Promise<Lesson[]>
    /** Lições de todos os bots e especializações. */
    all(): Promise<Lesson[]>
    /** Notas antigas da memória automática do Claude Code. */
    autoNotes(): Promise<AutoMemoryNote[]>
    removeAutoNote(path: string): Promise<void>
    save(lesson: Lesson): Promise<void>
    remove(owner: MemoryOwner, id: string): Promise<void>
    /** Avisa quando a memória de alguém mudou (ex.: um bot aprendeu algo durante uma conversa). */
    onChanged(listener: (owner: MemoryOwner) => void): () => void
  }
  usage: {
    summary(): Promise<UsageSummary>
    /** Total de uma conversa, incluindo bots consultados e chamados com @ nela. */
    conversation(id: string): Promise<TokenUsage>
    /** Registros desde `since` (ms), para a página de consumo. */
    records(since: number): Promise<UsageRecord[]>
    /** Avisa quando um gasto novo foi registrado. */
    onChanged(listener: () => void): () => void
  }
  /** Rotinas dos bots. */
  flows: {
    list(): Promise<Flow[]>
    save(flow: Flow): Promise<void>
    remove(id: string): Promise<void>
    /** Roda agora a partir de um gatilho (sem esperar a agenda); resolve com o id da execução. */
    run(id: string, triggerId: string): Promise<string>
    /**
     * Para na hora (sessões, processos, decisões e confirmações pendentes) a execução de um gatilho, ou todas do fluxo
     * sem `triggerId`.
     */
    stop(id: string, triggerId?: string): Promise<void>
    /** Liga ou desliga a agenda de um gatilho (vale mesmo com o fluxo rodando). */
    setTriggerEnabled(id: string, triggerId: string, enabled: boolean): Promise<void>
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
