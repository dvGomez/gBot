import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AvatarMood, ChatMessage, ProviderInfo, ThemePreference } from '@shared/types'
import { DEFAULT_AVATAR_ID } from '@/avatars/sprites'
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
  theme: ThemePreference
  setTheme(t: ThemePreference): void
  isDark: boolean
  avatarId: string
  setAvatarId(id: string): void
  providerId: string
  setProviderId(id: string): void
  providers: ProviderInfo[]
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

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('home')
  const [theme, setThemeState] = useState<ThemePreference>(() => load('theme', 'system'))
  const [systemDark, setSystemDark] = useState(prefersDark)
  const [avatarId, setAvatarIdState] = useState(() => load('avatarId', DEFAULT_AVATAR_ID))
  const [providerId, setProviderIdState] = useState(() => load('providerId', 'echo'))
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>()
  const [mood, setMood] = useState<AvatarMood>('idle')
  const [pending, setPending] = useState<Pending>()
  const pendingRef = useRef<Pending>(undefined)
  const moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const isDark = theme === 'dark' || (theme === 'system' && systemDark)

  // Tema: classe no <html> + avisa o processo principal (cor da janela, menus nativos)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    void window.gbot.theme.set(theme)
  }, [isDark, theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const refreshProviders = useCallback(async () => {
    setProviders(await window.gbot.providers.list())
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
        case 'done':
          pendingRef.current = undefined
          setPending(undefined)
          settleMood('happy', 1600)
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
      const botMsg: ChatMessage = { id: uid(), role: 'assistant', text: '', createdAt: Date.now(), providerId }
      const updated = { ...conversation, messages: [...conversation.messages, userMsg, botMsg] }

      setConversations((cs) => [updated, ...cs.filter((c) => c.id !== updated.id)])
      setActiveId(updated.id)
      setView('chat')

      const p: Pending = { requestId: uid(), conversationId: updated.id, messageId: botMsg.id }
      pendingRef.current = p
      setPending(p)
      clearTimeout(moodTimer.current)
      setMood('thinking')
      void window.gbot.chat.send({ requestId: p.requestId, providerId, conversationId: updated.id, text, history })
    },
    [activeId, conversations, providerId]
  )

  const cancel = useCallback(() => {
    if (pendingRef.current) void window.gbot.chat.cancel(pendingRef.current.requestId)
  }, [])

  const value = useMemo<AppState>(
    () => ({
      view,
      setView,
      theme,
      setTheme: (t) => {
        setThemeState(t)
        save('theme', t)
      },
      isDark,
      avatarId,
      setAvatarId: (id) => {
        setAvatarIdState(id)
        save('avatarId', id)
      },
      providerId,
      setProviderId: (id) => {
        setProviderIdState(id)
        save('providerId', id)
      },
      providers,
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
    [view, theme, isDark, avatarId, providerId, providers, refreshProviders, conversations, activeId, mood, pending, send, cancel]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp fora do AppProvider')
  return ctx
}
