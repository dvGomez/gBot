import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AvatarMood, ChatMessage, ProviderInfo } from '@shared/types'
import { DEFAULT_AVATAR_ID, getAvatar } from '@/avatars/sprites'
import { uid } from '@/lib/format'
import { load, save } from './storage'

export type View = 'home' | 'chat' | 'avatars' | 'providers' | 'settings'

export interface Conversation {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
}

interface Pending {
  requestId: string
  conversationId: string
  messageId: string
}

interface AppState {
  view: View
  setView(v: View): void
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
  conversations: Conversation[]
  activeConversation?: Conversation
  openConversation(id: string): void
  newConversation(): void
  mood: AvatarMood
  busy: boolean
  send(text: string): void
  cancel(): void
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('home')
  const [avatarId, setAvatarIdState] = useState(() => load('avatarId', DEFAULT_AVATAR_ID))
  const [providerId, setProviderIdState] = useState(() => load('providerId', 'claude-code'))
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>()
  const [mood, setMood] = useState<AvatarMood>('idle')
  const [pending, setPending] = useState<Pending>()
  const pendingRef = useRef<Pending>(undefined)
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const noticed = useRef(false)
  const cancelled = useRef(false)

  // Se o provedor escolhido não estiver pronto, usa o primeiro que estiver.
  const chosen = providers.find((p) => p.id === providerId)
  const activeProviderId =
    chosen?.status === 'ready' ? providerId : (providers.find((p) => p.status === 'ready')?.id ?? providerId)

  const connected = providers.some((p) => p.kind !== 'dev' && p.status === 'ready')

  const refreshProviders = useCallback(async () => {
    setProviders(await window.gbot.providers.list())
    setProvidersLoaded(true)
  }, [])

  useEffect(() => {
    void refreshProviders()
  }, [refreshProviders])

  const settleMood = useCallback((m: AvatarMood, ms: number) => {
    clearTimeout(moodTimer.current)
    setMood(m)
    moodTimer.current = setTimeout(() => setMood('idle'), ms)
  }, [])

  const patchMessage = useCallback((conversationId: string, messageId: string, fn: (m: ChatMessage) => ChatMessage) => {
    setConversations((cs) =>
      cs.map((c) =>
        c.id !== conversationId ? c : { ...c, messages: c.messages.map((m) => (m.id === messageId ? fn(m) : m)) }
      )
    )
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
        case 'notice':
          noticed.current = true
          patchMessage(p.conversationId, p.messageId, (m) => ({ ...m, notices: [...(m.notices ?? []), event.text] }))
          break
        case 'done':
          pendingRef.current = undefined
          setPending(undefined)
          if (cancelled.current) {
            patchMessage(p.conversationId, p.messageId, (m) => ({
              ...m,
              notices: [...(m.notices ?? []), 'Você interrompeu a resposta.']
            }))
            settleMood('idle', 0)
          } else if (noticed.current) settleMood('attention', 2400)
          else settleMood('happy', 1600)
          break
        case 'error':
          patchMessage(p.conversationId, p.messageId, (m) => ({ ...m, text: event.message, error: true }))
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

      let conversation = conversations.find((c) => c.id === activeId)
      if (!conversation) {
        conversation = { id: uid(), title: text.slice(0, 48), createdAt: Date.now(), messages: [] }
      }
      const history = conversation.messages.filter((m) => !m.error).map(({ role, text }) => ({ role, text }))
      const userMsg: ChatMessage = { id: uid(), role: 'user', text, createdAt: Date.now() }
      const botMsg: ChatMessage = { id: uid(), role: 'assistant', text: '', createdAt: Date.now(), providerId: activeProviderId }
      const updated = { ...conversation, messages: [...conversation.messages, userMsg, botMsg] }

      setConversations((cs) => [updated, ...cs.filter((c) => c.id !== updated.id)])
      setActiveId(updated.id)
      setView('chat')

      const p: Pending = { requestId: uid(), conversationId: updated.id, messageId: botMsg.id }
      pendingRef.current = p
      setPending(p)
      noticed.current = false
      cancelled.current = false
      clearTimeout(moodTimer.current)
      setMood('thinking')
      const { name, personality } = getAvatar(avatarId)
      void window.gbot.chat.send({
        requestId: p.requestId,
        providerId: activeProviderId,
        conversationId: updated.id,
        text,
        history,
        persona: { name, personality }
      })
    },
    [activeId, conversations, activeProviderId, avatarId]
  )

  const cancel = useCallback(() => {
    if (!pendingRef.current) return
    cancelled.current = true
    void window.gbot.chat.cancel(pendingRef.current.requestId)
  }, [])

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
      conversations,
      activeConversation: conversations.find((c) => c.id === activeId),
      openConversation: (id) => {
        setActiveId(id)
        setView('chat')
      },
      newConversation: () => {
        setActiveId(undefined)
        setView('home')
      },
      mood,
      busy: !!pending,
      send,
      cancel
    }),
    [view, avatarId, activeProviderId, providerId, providers, providersLoaded, connected, refreshProviders, conversations, activeId, mood, pending, send, cancel]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp fora do AppProvider')
  return ctx
}
