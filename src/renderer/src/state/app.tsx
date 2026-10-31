import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AvatarDef, AvatarMood, Bot, ChatMessage, Conversation, ConversationMeta, ProviderInfo } from '@shared/types'
import { DEFAULT_AVATAR_ID, getAvatar } from '@/avatars/sprites'
import { uid } from '@/lib/format'
import { load, save } from './storage'

export type View = 'home' | 'chat' | 'bot' | 'bot-editor' | 'avatars' | 'providers' | 'settings'

interface Pending {
  requestId: string
  conversationId: string
  messageId: string
}

interface AppState {
  view: View
  setView(v: View): void
  /** Avatar das conversas normais (sem bot). */
  avatarId: string
  setAvatarId(id: string): void
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

  bots: Bot[]
  /** Bot aberto na página do bot ou no editor (ausente no editor = criando um novo). */
  selectedBot?: Bot
  openBot(id: string): void
  editBot(id?: string): void
  saveBot(bot: Bot): Promise<void>
  removeBot(id: string): Promise<void>
  getBot(id?: string): Bot | undefined

  conversations: ConversationMeta[]
  activeConversation?: Conversation
  /** Bot da conversa ativa (ou do rascunho de nova conversa). */
  activeBot?: Bot
  openConversation(id: string): void
  /** Abre um chat vazio; com `botId`, a conversa será com aquele bot. */
  newConversation(botId?: string): void
  removeConversation(id: string): Promise<void>

  /** Avatar que aparece na conversa ativa (do bot ou o padrão). */
  activeAvatar: AvatarDef
  mood: AvatarMood
  busy: boolean
  send(text: string): void
  cancel(): void
}

const Ctx = createContext<AppState | null>(null)

const toMeta = ({ messages, ...meta }: Conversation): ConversationMeta => ({ ...meta, messageCount: messages.length })

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('home')
  const [avatarId, setAvatarIdState] = useState(() => load('avatarId', DEFAULT_AVATAR_ID))
  const [providerId, setProviderIdState] = useState(() => load('providerId', 'claude-code'))
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)

  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string>()
  const [metas, setMetas] = useState<ConversationMeta[]>([])
  /** Conversas carregadas por completo (com mensagens), por id. */
  const [loaded, setLoaded] = useState<Record<string, Conversation>>({})
  const [activeId, setActiveId] = useState<string>()
  /** Bot do rascunho: chat aberto mas ainda sem mensagens. */
  const [draftBotId, setDraftBotId] = useState<string>()

  const [mood, setMood] = useState<AvatarMood>('idle')
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

  const activeConversation = activeId ? loaded[activeId] : undefined
  const activeBot = getBot(activeConversation ? activeConversation.botId : draftBotId)
  const activeAvatar = activeBot?.avatar ?? getAvatar(avatarId)

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
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        messages: []
      }
      const bot = getBot(conversation.botId)
      const history = conversation.messages.filter((m) => !m.error).map(({ role, text }) => ({ role, text }))
      const userMsg: ChatMessage = { id: uid(), role: 'user', text, createdAt: now }
      const botMsg: ChatMessage = { id: uid(), role: 'assistant', text: '', createdAt: now, providerId: activeProviderId }
      const updated: Conversation = { ...conversation, updatedAt: now, messages: [...conversation.messages, userMsg, botMsg] }

      toSave.current.add(updated.id)
      setLoaded((all) => ({ ...all, [updated.id]: updated }))
      setActiveId(updated.id)
      setDraftBotId(undefined)
      setView('chat')

      const p: Pending = { requestId: uid(), conversationId: updated.id, messageId: botMsg.id }
      pendingRef.current = p
      setPending(p)
      noticed.current = false
      cancelled.current = false
      clearTimeout(moodTimer.current)
      setMood('thinking')
      const avatar = bot?.avatar ?? getAvatar(avatarId)
      void window.gbot.chat.send({
        requestId: p.requestId,
        providerId: activeProviderId,
        conversationId: updated.id,
        text,
        history,
        persona: { name: avatar.name, personality: avatar.personality },
        bot: bot && { id: bot.id, name: bot.name, description: bot.description, instructions: bot.instructions }
      })
    },
    [activeConversation, draftBotId, getBot, activeProviderId, avatarId]
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
      setView('chat')
    },
    [loaded]
  )

  const value = useMemo<AppState>(
    () => ({
      view,
      setView,
      avatarId,
      setAvatarId: (id) => {
        setAvatarIdState(id)
        save('avatarId', id)
      },
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

      bots,
      selectedBot: getBot(selectedBotId),
      openBot: (id) => {
        setSelectedBotId(id)
        setView('bot')
      },
      editBot: (id) => {
        setSelectedBotId(id)
        setView('bot-editor')
      },
      saveBot: async (bot) => {
        await window.gbot.bots.save(bot)
        setBots((bs) => (bs.some((b) => b.id === bot.id) ? bs.map((b) => (b.id === bot.id ? bot : b)) : [...bs, bot]))
      },
      removeBot: async (id) => {
        await window.gbot.bots.remove(id)
        setBots((bs) => bs.filter((b) => b.id !== id))
        setMetas((ms) => ms.filter((m) => m.botId !== id))
        setSelectedBotId(undefined)
        setView('home')
      },
      getBot,

      conversations: metas,
      activeConversation,
      activeBot,
      openConversation: (id) => void openConversation(id),
      newConversation: (botId) => {
        setActiveId(undefined)
        setDraftBotId(botId)
        setView('chat')
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
      mood,
      busy: !!pending,
      send,
      cancel
    }),
    [
      view,
      avatarId,
      activeProviderId,
      providerId,
      providers,
      providersLoaded,
      connected,
      refreshProviders,
      bots,
      selectedBotId,
      getBot,
      metas,
      activeConversation,
      activeBot,
      activeId,
      openConversation,
      activeAvatar,
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
