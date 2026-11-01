import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  ApprovalDecision,
  ApprovalRequest,
  AvatarDef,
  AvatarMood,
  Bot,
  ChatMessage,
  Conversation,
  ConversationMeta,
  Flow,
  Project,
  ProviderInfo,
  ProviderModel
} from '@shared/types'
import type { ItemRef } from '@/lib/dnd'
import { uid } from '@/lib/format'
import { findMention } from '@/lib/mentions'
import { load, save } from './storage'

export type View =
  | 'home'
  | 'chat'
  | 'bot'
  | 'bot-editor'
  | 'project'
  | 'project-editor'
  | 'flow-editor'
  | 'providers'
  | 'settings'

interface Pending {
  requestId: string
  conversationId: string
  messageId: string
}

interface AppState {
  view: View
  setView(v: View): void
  /** Provedor em uso (o escolhido, ou o primeiro pronto se o escolhido não estiver). */
  providerId: string
  /** Provedor que o usuário escolheu, mesmo que ainda não esteja pronto. */
  preferredProviderId: string
  setProviderId(id: string): void
  providers: ProviderInfo[]
  /** true depois da primeira verificação de provedores. */
  providersLoaded: boolean
  /** Há pelo menos um provedor real (não de teste) pronto para uso. */
  connected: boolean
  refreshProviders(): Promise<void>

  flows: Flow[]
  /** Fluxo aberto no canvas. */
  selectedFlow?: Flow
  openFlow(id: string): void
  /** Cria um fluxo novo (com o gatilho) e abre no canvas; com `projectId`, dentro do projeto. */
  newFlow(projectId?: string): Promise<void>
  saveFlow(flow: Flow): Promise<void>
  removeFlow(id: string): Promise<void>

  projects: Project[]
  /** Projeto aberto na página do projeto ou no editor (ausente no editor = criando um novo). */
  selectedProject?: Project
  openProject(id: string): void
  editProject(id?: string): void
  saveProject(project: Project): Promise<void>
  removeProject(id: string): Promise<void>
  getProject(id?: string): Project | undefined

  bots: Bot[]
  /** Bot aberto na página do bot ou no editor (ausente no editor = criando um novo). */
  selectedBot?: Bot
  openBot(id: string): void
  /** Abre o editor; sem `id` cria um bot novo, já dentro de `projectId` se informado. */
  editBot(id?: string, projectId?: string): void
  /** Projeto sugerido para o bot novo que está sendo criado. */
  botDraftProjectId?: string
  saveBot(bot: Bot): Promise<void>
  removeBot(id: string): Promise<void>
  getBot(id?: string): Bot | undefined

  conversations: ConversationMeta[]
  activeConversation?: Conversation
  /** Bot da conversa ativa (ou do rascunho de nova conversa). */
  activeBot?: Bot
  /** Projeto da conversa ativa (ou do rascunho). */
  activeProject?: Project
  /** Bots que a conversa ativa pode chamar: os soltos e os do projeto dela. */
  visibleBots: Bot[]
  /** Modelos do provedor em uso (vazio se o provedor não oferece escolha). */
  models: ProviderModel[]
  /** Modelo da conversa ativa (ou do rascunho); undefined = padrão. */
  activeModel?: string
  setActiveModel(model?: string): void
  openConversation(id: string): void
  /** Abre um chat vazio; com `botId`, a conversa será com aquele bot; com `projectId`, dentro do projeto. */
  newConversation(botId?: string, projectId?: string): void
  /** Move a conversa para um projeto (ou para fora de projetos, com undefined). */
  moveConversation(id: string, projectId?: string): Promise<void>
  /** Move uma conversa, bot ou fluxo para um projeto (ou para fora, com undefined). */
  moveItem(item: ItemRef, projectId?: string): Promise<void>
  removeConversation(id: string): Promise<void>

  /** Avatar do bot da conversa ativa; ausente numa conversa normal (sem personagem). */
  activeAvatar?: AvatarDef
  /** Pedidos de aprovação esperando resposta (ex.: navegador abrir um site). */
  approvals: ApprovalRequest[]
  respondApproval(id: string, decision: ApprovalDecision): void
  mood: AvatarMood
  busy: boolean
  send(text: string): void
  cancel(): void
}

const Ctx = createContext<AppState | null>(null)

const toMeta = ({ messages, ...meta }: Conversation): ConversationMeta => ({ ...meta, messageCount: messages.length })

/**
 * O assistente da conversa não vê as trocas com bots chamados por @menção. Antes da próxima mensagem
 * normal, essas trocas (desde a última resposta dele) vão junto como contexto.
 */
function withMentionContext(conversation: Conversation, text: string, bots: Bot[]): string {
  const lines: string[] = []
  const msgs = conversation.messages
  for (let i = msgs.length - 1; i > 0; i--) {
    const m = msgs[i]
    if (m.role !== 'assistant') continue
    if (!m.botId || m.botId === conversation.botId) break
    const name = bots.find((b) => b.id === m.botId)?.name ?? 'um bot'
    lines.unshift(`Usuário para @${name}: ${msgs[i - 1].text}`, `${name} respondeu: ${m.error ? '(erro)' : m.text}`)
  }
  if (!lines.length) return text
  return `[Contexto do gBot — o usuário conversou com outros bots desde a sua última resposta:\n${lines.join('\n')}]\n\n${text}`
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('home')
  const [providerId, setProviderIdState] = useState(() => load('providerId', 'claude-code'))
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)

  const [flows, setFlows] = useState<Flow[]>([])
  const [selectedFlowId, setSelectedFlowId] = useState<string>()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>()
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string>()
  const [botDraftProjectId, setBotDraftProjectId] = useState<string>()
  const [metas, setMetas] = useState<ConversationMeta[]>([])
  /** Conversas carregadas por completo (com mensagens), por id. */
  const [loaded, setLoaded] = useState<Record<string, Conversation>>({})
  const [activeId, setActiveId] = useState<string>()
  /** Bot e projeto do rascunho: chat aberto mas ainda sem mensagens. */
  const [draftBotId, setDraftBotId] = useState<string>()
  const [draftProjectId, setDraftProjectId] = useState<string>()
  const [draftModel, setDraftModel] = useState<string>()

  const [mood, setMood] = useState<AvatarMood>('idle')
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [pending, setPending] = useState<Pending>()
  const pendingRef = useRef<Pending>(undefined)
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const noticed = useRef(false)
  const cancelled = useRef(false)
  /** Conversas alteradas que precisam ser gravadas em disco. */
  const toSave = useRef(new Set<string>())

  const connected = providers.some((p) => p.kind !== 'dev' && p.status === 'ready')

  // Se o provedor escolhido não estiver pronto, usa o primeiro que estiver.
  const chosen = providers.find((p) => p.id === providerId)
  const activeProviderId =
    chosen?.status === 'ready' ? providerId : (providers.find((p) => p.status === 'ready')?.id ?? providerId)

  const refreshProviders = useCallback(async () => {
    setProviders(await window.gbot.providers.list())
    setProvidersLoaded(true)
  }, [])

  useEffect(() => {
    void refreshProviders()
    void window.gbot.projects.list().then(setProjects)
    void window.gbot.flows.list().then(setFlows)
    void window.gbot.bots.list().then(setBots)
    void window.gbot.conversations.list().then(setMetas)
  }, [refreshProviders])

  // Grava em disco as conversas marcadas como alteradas.
  useEffect(() => {
    for (const id of toSave.current) {
      const conv = loaded[id]
      if (!conv) continue
      toSave.current.delete(id)
      void window.gbot.conversations.save(conv)
      setMetas((ms) => [toMeta(conv), ...ms.filter((m) => m.id !== id)])
    }
  }, [loaded])

  const getBot = useCallback((id?: string) => (id ? bots.find((b) => b.id === id) : undefined), [bots])
  const getProject = useCallback((id?: string) => (id ? projects.find((p) => p.id === id) : undefined), [projects])

  const activeConversation = activeId ? loaded[activeId] : undefined
  const activeBot = getBot(activeConversation ? activeConversation.botId : draftBotId)
  const activeProject = getProject(activeConversation ? activeConversation.projectId : draftProjectId)
  const activeModel = activeConversation ? activeConversation.model : draftModel
  const models = providers.find((p) => p.id === activeProviderId)?.models ?? []
  const visibleBots = useMemo(
    () => bots.filter((b) => !b.projectId || b.projectId === activeProject?.id),
    [bots, activeProject?.id]
  )
  const activeAvatar = activeBot?.avatar

  const settleMood = useCallback((m: AvatarMood, ms: number) => {
    clearTimeout(moodTimer.current)
    setMood(m)
    moodTimer.current = setTimeout(() => setMood('idle'), ms)
  }, [])

  const patchMessage = useCallback(
    (conversationId: string, messageId: string, fn: (m: ChatMessage) => ChatMessage, persist = false) => {
      if (persist) toSave.current.add(conversationId)
      setLoaded((all) => {
        const c = all[conversationId]
        if (!c) return all
        const messages = c.messages.map((m) => (m.id === messageId ? fn(m) : m))
        return { ...all, [conversationId]: { ...c, messages, updatedAt: persist ? Date.now() : c.updatedAt } }
      })
    },
    []
  )

  // Pedidos de aprovação vindos do processo principal
  useEffect(() => {
    const offReq = window.gbot.approvals.onRequest((req) => {
      setApprovals((list) => [...list, req])
      clearTimeout(moodTimer.current)
      setMood('attention')
    })
    const offRes = window.gbot.approvals.onResolved((id) => setApprovals((list) => list.filter((a) => a.id !== id)))
    return () => {
      offReq()
      offRes()
    }
  }, [])

  // Eventos de streaming vindos do provedor
  useEffect(() => {
    return window.gbot.chat.onEvent((requestId, event) => {
      const p = pendingRef.current
      if (!p || p.requestId !== requestId) return
      switch (event.type) {
        case 'mood':
          clearTimeout(moodTimer.current)
          setMood(event.mood)
          break
        case 'delta':
          patchMessage(p.conversationId, p.messageId, (m) => ({ ...m, text: m.text + event.text }))
          break
        case 'tool':
          patchMessage(p.conversationId, p.messageId, (m) => {
            const tools = m.tools ?? []
            const i = tools.findIndex((t) => t.id === event.tool.id)
            return { ...m, tools: i < 0 ? [...tools, event.tool] : tools.map((t, j) => (j === i ? event.tool : t)) }
          })
          break
        case 'files':
          patchMessage(p.conversationId, p.messageId, (m) => {
            const known = new Set(event.files.map((f) => f.path))
            return { ...m, files: [...(m.files ?? []).filter((f) => !known.has(f.path)), ...event.files] }
          })
          break
        case 'notice':
          noticed.current = true
          patchMessage(p.conversationId, p.messageId, (m) => ({ ...m, notices: [...(m.notices ?? []), event.text] }))
          break
        case 'done':
          pendingRef.current = undefined
          setPending(undefined)
          if (cancelled.current) {
            patchMessage(
              p.conversationId,
              p.messageId,
              (m) => ({ ...m, notices: [...(m.notices ?? []), 'Você interrompeu a resposta.'] }),
              true
            )
            settleMood('idle', 0)
          } else {
            patchMessage(p.conversationId, p.messageId, (m) => m, true)
            if (noticed.current) settleMood('attention', 2400)
            else settleMood('happy', 1600)
          }
          break
        case 'error':
          patchMessage(p.conversationId, p.messageId, (m) => ({ ...m, text: event.message, error: true }), true)
          pendingRef.current = undefined
          setPending(undefined)
          settleMood('attention', 2400)
          break
      }
    })
  }, [patchMessage, settleMood])

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text || pendingRef.current) return

      const now = Date.now()
      const conversation: Conversation = activeConversation ?? {
        id: uid(),
        title: text.slice(0, 48),
        botId: draftBotId,
        projectId: draftProjectId,
        model: draftModel,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        messages: []
      }
      const bot = getBot(conversation.botId)
      // @menção a outro bot: a mensagem vai direto para ele, e a resposta aparece com o avatar dele.
      const mentioned = findMention(text, visibleBots)
      const target = mentioned && mentioned.id !== conversation.botId ? mentioned : undefined
      const history = conversation.messages.filter((m) => !m.error).map(({ role, text }) => ({ role, text }))
      const userMsg: ChatMessage = { id: uid(), role: 'user', text, createdAt: now }
      const botMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text: '',
        createdAt: now,
        providerId: activeProviderId,
        model: target ? target.model : conversation.model,
        botId: target?.id
      }
      const updated: Conversation = { ...conversation, updatedAt: now, messages: [...conversation.messages, userMsg, botMsg] }

      toSave.current.add(updated.id)
      setLoaded((all) => ({ ...all, [updated.id]: updated }))
      setActiveId(updated.id)
      setDraftBotId(undefined)
      setDraftProjectId(undefined)
      setDraftModel(undefined)
      setView('chat')

      const p: Pending = { requestId: uid(), conversationId: updated.id, messageId: botMsg.id }
      pendingRef.current = p
      setPending(p)
      noticed.current = false
      cancelled.current = false
      clearTimeout(moodTimer.current)
      setMood('thinking')
      void window.gbot.chat.send({
        requestId: p.requestId,
        providerId: activeProviderId,
        conversationId: updated.id,
        text: target ? text : withMentionContext(conversation, text, bots),
        history,
        targetBotId: target?.id,
        projectId: updated.projectId,
        model: updated.model,
        bot: bot && { id: bot.id, name: bot.name, description: bot.description, instructions: bot.instructions }
      })
    },
    [activeConversation, draftBotId, draftProjectId, draftModel, getBot, bots, visibleBots, activeProviderId]
  )

  const cancel = useCallback(() => {
    if (!pendingRef.current) return
    cancelled.current = true
    void window.gbot.chat.cancel(pendingRef.current.requestId)
  }, [])

  const openConversation = useCallback(
    async (id: string) => {
      if (!loaded[id]) {
        const conv = await window.gbot.conversations.get(id)
        if (!conv) return
        setLoaded((all) => ({ ...all, [id]: conv }))
      }
      setActiveId(id)
      setDraftBotId(undefined)
      setDraftProjectId(undefined)
      setDraftModel(undefined)
      setView('chat')
    },
    [loaded]
  )

  const setActiveModel = useCallback(
    (model?: string) => {
      const value = model === 'default' ? undefined : model
      if (!activeConversation) {
        setDraftModel(value)
        return
      }
      toSave.current.add(activeConversation.id)
      setLoaded((all) => ({ ...all, [activeConversation.id]: { ...activeConversation, model: value, updatedAt: Date.now() } }))
    },
    [activeConversation]
  )

  const moveConversation = useCallback(
    async (id: string, projectId?: string) => {
      const conv = loaded[id] ?? (await window.gbot.conversations.get(id))
      if (!conv) return
      toSave.current.add(id)
      setLoaded((all) => ({ ...all, [id]: { ...conv, projectId, updatedAt: Date.now() } }))
    },
    [loaded]
  )

  const value = useMemo<AppState>(
    () => ({
      view,
      setView,
      providerId: activeProviderId,
      preferredProviderId: providerId,
      setProviderId: (id) => {
        setProviderIdState(id)
        save('providerId', id)
      },
      providers,
      providersLoaded,
      connected,
      refreshProviders,

      flows,
      selectedFlow: flows.find((f) => f.id === selectedFlowId),
      openFlow: (id) => {
        setSelectedFlowId(id)
        setView('flow-editor')
      },
      newFlow: async (projectId) => {
        const now = Date.now()
        const flow: Flow = {
          id: uid(),
          name: 'Novo fluxo',
          enabled: false,
          projectId,
          nodes: [
            {
              id: uid(),
              type: 'trigger',
              position: { x: 0, y: 0 },
              data: { schedule: { mode: 'times', days: [1, 2, 3, 4, 5], times: ['09:00'] } }
            }
          ],
          edges: [],
          createdAt: now,
          updatedAt: now
        }
        await window.gbot.flows.save(flow)
        setFlows((fs) => [...fs, flow])
        setSelectedFlowId(flow.id)
        setView('flow-editor')
      },
      saveFlow: async (flow) => {
        setFlows((fs) => fs.map((f) => (f.id === flow.id ? flow : f)))
        await window.gbot.flows.save(flow)
      },
      removeFlow: async (id) => {
        await window.gbot.flows.remove(id)
        setFlows((fs) => fs.filter((f) => f.id !== id))
        if (view === 'flow-editor' && selectedFlowId === id) {
          setSelectedFlowId(undefined)
          setView('home')
        }
      },

      projects,
      selectedProject: getProject(selectedProjectId),
      openProject: (id) => {
        setSelectedProjectId(id)
        setView('project')
      },
      editProject: (id) => {
        setSelectedProjectId(id)
        setView('project-editor')
      },
      saveProject: async (project) => {
        await window.gbot.projects.save(project)
        setProjects((ps) =>
          ps.some((p) => p.id === project.id) ? ps.map((p) => (p.id === project.id ? project : p)) : [...ps, project]
        )
      },
      removeProject: async (id) => {
        await window.gbot.projects.remove(id)
        setProjects((ps) => ps.filter((p) => p.id !== id))
        // O que estava no projeto fica solto (o processo principal já gravou em disco).
        setBots((bs) => bs.map(({ projectId, ...b }) => (projectId === id ? b : { ...b, projectId })))
        setFlows((fs) => fs.map(({ projectId, ...f }) => (projectId === id ? f : { ...f, projectId })))
        setMetas((ms) => ms.map(({ projectId, ...m }) => (projectId === id ? m : { ...m, projectId })))
        setLoaded((all) =>
          Object.fromEntries(
            Object.entries(all).map(([k, { projectId, ...c }]) => [k, projectId === id ? c : { ...c, projectId }])
          )
        )
        setSelectedProjectId(undefined)
        setView('home')
      },
      getProject,

      bots,
      selectedBot: getBot(selectedBotId),
      openBot: (id) => {
        setSelectedBotId(id)
        setView('bot')
      },
      editBot: (id, projectId) => {
        setSelectedBotId(id)
        setBotDraftProjectId(projectId)
        setView('bot-editor')
      },
      botDraftProjectId,
      saveBot: async (bot) => {
        await window.gbot.bots.save(bot)
        setBots((bs) => (bs.some((b) => b.id === bot.id) ? bs.map((b) => (b.id === bot.id ? bot : b)) : [...bs, bot]))
      },
      removeBot: async (id) => {
        await window.gbot.bots.remove(id)
        setBots((bs) => bs.filter((b) => b.id !== id))
        setMetas((ms) => ms.filter((m) => m.botId !== id))
        // Só sai da tela atual se ela mostrava o bot excluído (ou uma conversa dele).
        const showingBot = (view === 'bot' || view === 'bot-editor') && selectedBotId === id
        if (showingBot || (view === 'chat' && activeBot?.id === id)) {
          setSelectedBotId(undefined)
          setActiveId(undefined)
          setView('home')
        }
      },
      getBot,

      conversations: metas,
      activeConversation,
      activeBot,
      activeProject,
      visibleBots,
      models,
      activeModel,
      setActiveModel,
      openConversation: (id) => void openConversation(id),
      newConversation: (botId, projectId) => {
        setActiveId(undefined)
        setDraftBotId(botId)
        setDraftModel(getBot(botId)?.model)
        setDraftProjectId(projectId ?? getBot(botId)?.projectId)
        setView('chat')
      },
      moveConversation,
      moveItem: async (item, projectId) => {
        if (item.projectId === projectId) return
        const now = Date.now()
        if (item.kind === 'conversation') return moveConversation(item.id, projectId)
        if (item.kind === 'bot') {
          const bot = bots.find((b) => b.id === item.id)
          if (!bot) return
          const moved = { ...bot, projectId, updatedAt: now }
          setBots((bs) => bs.map((b) => (b.id === bot.id ? moved : b)))
          await window.gbot.bots.save(moved)
          return
        }
        const flow = flows.find((f) => f.id === item.id)
        if (!flow) return
        const moved = { ...flow, projectId, updatedAt: now }
        setFlows((fs) => fs.map((f) => (f.id === flow.id ? moved : f)))
        await window.gbot.flows.save(moved)
      },
      removeConversation: async (id) => {
        await window.gbot.conversations.remove(id)
        setMetas((ms) => ms.filter((m) => m.id !== id))
        if (activeId === id) {
          setActiveId(undefined)
          setView('home')
        }
      },

      activeAvatar,
      approvals,
      respondApproval: (id, decision) => {
        setApprovals((list) => list.filter((a) => a.id !== id))
        setMood(pendingRef.current ? 'thinking' : 'idle')
        void window.gbot.approvals.respond(id, decision)
      },
      mood,
      busy: !!pending,
      send,
      cancel
    }),
    [
      view,
      activeProviderId,
      providerId,
      providers,
      providersLoaded,
      connected,
      refreshProviders,
      flows,
      selectedFlowId,
      projects,
      selectedProjectId,
      getProject,
      bots,
      selectedBotId,
      botDraftProjectId,
      getBot,
      metas,
      activeConversation,
      activeBot,
      activeProject,
      visibleBots,
      models,
      activeModel,
      setActiveModel,
      activeId,
      openConversation,
      moveConversation,
      activeAvatar,
      approvals,
      mood,
      pending,
      send,
      cancel
    ]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp fora do AppProvider')
  return ctx
}
