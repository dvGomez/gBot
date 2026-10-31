import { Sidebar } from '@/components/Sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AvatarsView } from '@/views/AvatarsView'
import { ChatView } from '@/views/ChatView'
import { HomeView } from '@/views/HomeView'
import { ProvidersView } from '@/views/ProvidersView'
import { SettingsView } from '@/views/SettingsView'
import { useApp } from '@/state/app'

export function App() {
  const { view } = useApp()
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col bg-page">
        <header className="drag flex h-14 shrink-0 items-center justify-end px-5">
          <ThemeToggle />
        </header>
        <div className={view === 'chat' ? 'min-h-0 flex-1' : 'min-h-0 flex-1 overflow-y-auto'}>
          {view === 'home' && <HomeView />}
          {view === 'chat' && <ChatView />}
          {view === 'avatars' && <AvatarsView />}
          {view === 'providers' && <ProvidersView />}
          {view === 'settings' && <SettingsView />}
        </div>
      </main>
    </div>
  )
}
