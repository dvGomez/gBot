import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { resolveLanguage, translate, type Language, type LanguagePreference } from '@shared/i18n'
import { en } from '@shared/locales/en'

let language: Language = resolveLanguage(undefined, navigator.language)
const reverse = new Map(Object.entries(en).map(([pt, english]) => [english, pt]))

export const locale = () => language
export const t = (source: string, ...values: unknown[]) => translate(reverse.get(source) ?? source, language, ...values)

/** Only for built-in, module-level UI catalogs; never wrap user data. Keeps their labels live on language changes. */
const catalogs = new WeakMap<object, object>()
export function localized<T extends object>(catalog: T): T {
  if (catalogs.has(catalog)) return catalogs.get(catalog) as T
  // Plain objects with getters remain compatible with Electron IPC/structuredClone (unlike Proxy objects).
  const result = Array.isArray(catalog) ? [] : {}
  catalogs.set(catalog, result)
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value === 'string' && (en[value] !== undefined || reverse.has(value))) {
      const source = reverse.get(value) ?? value
      Object.defineProperty(result, key, { enumerable: true, configurable: true, get: () => t(source) })
    } else {
      const nested = value && typeof value === 'object' && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype)
      Object.defineProperty(result, key, { enumerable: true, configurable: true, writable: true, value: nested ? localized(value) : value })
    }
  }
  return result as T
}

interface LanguageState {
  language: Language
  preference: LanguagePreference
  systemLocale: string
  setPreference(preference: LanguagePreference): Promise<void>
}
const Context = createContext<LanguageState | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [systemLocale, setSystemLocale] = useState(navigator.language)
  const [preference, setPreference] = useState<LanguagePreference>('system')
  const [ready, setReady] = useState(false)
  const current = resolveLanguage(preference, systemLocale)
  language = current

  useEffect(() => {
    let alive = true
    Promise.all([window.gbot.settings.get(), typeof window.gbot.systemLocale === 'function' ? window.gbot.systemLocale() : Promise.resolve(navigator.language)])
      .then(([settings, osLocale]) => {
        if (!alive) return
        setPreference(settings.language ?? 'system')
        setSystemLocale(typeof osLocale === 'string' ? osLocale : navigator.language)
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [])

  useEffect(() => { document.documentElement.lang = current }, [current])

  const setLanguage = async (next: LanguagePreference) => {
    await window.gbot.settings.set({ language: next })
    if (next === 'system' && typeof window.gbot.systemLocale === 'function') {
      const freshLocale = await window.gbot.systemLocale()
      if (typeof freshLocale === 'string') setSystemLocale(freshLocale)
    }
    setPreference(next)
  }

  if (!ready) return null
  return <Context.Provider value={{ language: current, preference, systemLocale, setPreference: setLanguage }}>{children}</Context.Provider>
}

/** Every translated component subscribes so changing language never requires reloading active conversations. */
export function useLanguage() {
  const state = useContext(Context)
  if (!state) throw new Error('LanguageProvider is missing')
  return state
}
