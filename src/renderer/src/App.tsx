import { Sidebar } from '@/components/Sidebar'
import { BotEditorView } from '@/views/BotEditorView'
import { BotView } from '@/views/BotView'
import { ChatView } from '@/views/ChatView'
import { HomeView } from '@/views/HomeView'
import { LoginView, SplashView } from '@/views/LoginView'
import { ProjectEditorView } from '@/views/ProjectEditorView'
import { ProjectView } from '@/views/ProjectView'
import { ProvidersView } from '@/views/ProvidersView'
import { SettingsView } from '@/views/SettingsView'
import { useApp } from '@/state/app'

/** Aviso no topo quando uma conversa que não está aberta pede aprovação. */
function PendingApprovalsBar() {
  const app = useApp()
  const elsewhere = app.approvals.filter((r) => r.conversationId && !(app.view === 'chat' && app.activeConversation?.id === r.conversationId))
  if (!elsewhere.length) return null
  const first = elsewhere[0]
  return (
    <div className="mx-auto mb-2 flex w-full max-w-[860px] items-center gap-3 rounded-tile border border-warning/50 bg-sidebar px-4 py-2.5 text-[13px]">
      <span className="flex-1 text-fg-2">
        {first.requester ? (
          <>
            <span className="font-medium text-fg">{first.requester}</span> quer usar o navegador em {first.host}
          </>
        ) : (
          <>Uma conversa quer usar o navegador em {first.host}</>
        )}
        {elsewhere.length > 1 && ` (+${elsewhere.length - 1})`}
      </span>
      <button
        onClick={() => app.openConversation(first.conversationId!)}
        className="rounded-full bg-primary px-3 py-1 text-[12px] font-medium text-on-primary"
      >
        Ver pedido
      </button>
    </div>
  )
}

export function App() {
  const app = useApp()
  const { view, providersLoaded, connected } = app

  if (!providersLoaded) return <SplashView />
  if (!connected) return <LoginView />

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col bg-page">
        <header className="drag h-14 shrink-0" />
        <PendingApprovalsBar />
        <div className={view === 'chat' ? 'min-h-0 flex-1' : 'min-h-0 flex-1 overflow-y-auto'}>
          {view === 'home' && <HomeView />}
          {view === 'chat' && <ChatView />}
          {view === 'bot' && <BotView />}
          {view === 'bot-editor' && <BotEditorView key={app.selectedBot?.id ?? `new-${app.botDraftProjectId ?? ''}`} />}
          {view === 'project' && <ProjectView />}
          {view === 'project-editor' && <ProjectEditorView key={app.selectedProject?.id ?? 'new'} />}
          {view === 'providers' && <ProvidersView />}
          {view === 'settings' && <SettingsView />}
        </div>
      </main>
    </div>
  )
}
