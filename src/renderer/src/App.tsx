import { Sidebar } from '@/components/Sidebar'
import { AvatarsView } from '@/views/AvatarsView'
import { BotEditorView } from '@/views/BotEditorView'
import { BotView } from '@/views/BotView'
import { ChatView } from '@/views/ChatView'
import { HomeView } from '@/views/HomeView'
import { LoginView, SplashView } from '@/views/LoginView'
import { ProvidersView } from '@/views/ProvidersView'
import { SettingsView } from '@/views/SettingsView'
import { useApp } from '@/state/app'

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
        <div className={view === 'chat' ? 'min-h-0 flex-1' : 'min-h-0 flex-1 overflow-y-auto'}>
          {view === 'home' && <HomeView />}
          {view === 'chat' && <ChatView />}
          {view === 'bot' && <BotView />}
          {view === 'bot-editor' && <BotEditorView key={app.selectedBot?.id ?? 'new'} />}
          {view === 'avatars' && <AvatarsView />}
          {view === 'providers' && <ProvidersView />}
          {view === 'settings' && <SettingsView />}
        </div>
      </main>
    </div>
  )
}
