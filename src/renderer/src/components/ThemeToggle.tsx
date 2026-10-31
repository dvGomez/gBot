import { Moon, Sun } from 'lucide-react'
import { useApp } from '@/state/app'

export function ThemeToggle() {
  const { isDark, setTheme } = useApp()
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="no-drag flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-hover"
      aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
    >
      {isDark ? <Sun size={18} strokeWidth={1.6} /> : <Moon size={18} strokeWidth={1.6} />}
    </button>
  )
}
