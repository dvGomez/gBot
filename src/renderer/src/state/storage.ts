/** Preferências locais (por máquina). Conversas vão para SQLite na Etapa 3. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`gbot:${key}`)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`gbot:${key}`, JSON.stringify(value))
  } catch {
    // armazenamento indisponível: segue só em memória
  }
}
