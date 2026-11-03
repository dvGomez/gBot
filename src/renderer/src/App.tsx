import { t as tr, useLanguage } from '@/i18n'
import { ApprovalCard, approvalTitle } from '@/components/ApprovalCard'
import { ConfirmationModal, PendingConfirmationsBar } from '@/components/ConfirmationModal'
import { Sidebar } from '@/components/Sidebar'
import { UpdateNotice } from '@/components/UpdateNotice'
import { BotEditorView } from '@/views/BotEditorView'
import { SpecializationEditorView } from '@/views/SpecializationEditorView'
import { BotView } from '@/views/BotView'
import { ChatView } from '@/views/ChatView'
import { HomeView } from '@/views/HomeView'
import { LoginView, SplashView } from '@/views/LoginView'
import { ProjectEditorView } from '@/views/ProjectEditorView'
import { ProjectView } from '@/views/ProjectView'
import { ProvidersView } from '@/views/ProvidersView'
import { MemoryView } from '@/views/MemoryView'
import { SettingsView } from '@/views/SettingsView'
import { UsageView } from '@/views/UsageView'
import { useApp } from '@/state/app'

/**
 * Aviso no topo quando um pedido de aprovação não está na tela. Pedidos de rotinas (sem conversa para abrir)
 * aparecem já com os botões, para responder dali mesmo.
 */
function PendingApprovalsBar() {
  useLanguage()
  const app = useApp()
  const elsewhere = app.approvals.filter((r) => r.conversationId && !(app.view === 'chat' && app.activeConversation?.id === r.conversationId))
  if (!elsewhere.length) return null
  const first = elsewhere[0]
  if (!app.conversations.some((c) => c.id === first.conversationId)) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4">
        <ApprovalCard req={first} />
      </div>
    )
  }
  return (
    <div className="mx-auto mb-2 flex w-full max-w-[860px] items-center gap-3 rounded-tile border border-warning/50 bg-sidebar px-4 py-2.5 text-[13px]">
      <span className="flex-1 text-fg-2">
        {approvalTitle(first)}
        {elsewhere.length > 1 && ` (+${elsewhere.length - 1})`}
      </span>
      <button
        onClick={() => app.openConversation(first.conversationId!)}
        className="rounded-full bg-primary px-3 py-1 text-[12px] font-medium text-on-primary"
      >{tr('Ver pedido')}</button>
    </div>
  )
}

export function App() {
  useLanguage()
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
        <PendingConfirmationsBar />
        <UpdateNotice />
        <div className={view === 'chat' || view === 'bot' ? 'min-h-0 flex-1' : 'min-h-0 flex-1 overflow-y-auto'}>
          {view === 'home' && <HomeView />}
          {view === 'chat' && <ChatView />}
          {view === 'bot' && <BotView />}
          {view === 'bot-editor' && <BotEditorView key={app.selectedBot?.id ?? `new-${app.botDraftProjectId ?? ''}`} />}
          {view === 'specialization-editor' && (
            <SpecializationEditorView key={app.selectedSpecialization?.id ?? `new-${app.specializationDraftProjectId ?? ''}`} />
          )}
          {view === 'project' && <ProjectView />}
          {view === 'project-editor' && <ProjectEditorView key={app.selectedProject?.id ?? 'new'} />}
          {view === 'providers' && <ProvidersView />}
          {view === 'usage' && <UsageView />}
          {view === 'memory' && <MemoryView />}
          {view === 'settings' && <SettingsView />}
        </div>
      </main>
      <ConfirmationModal />
    </div>
  )
}
