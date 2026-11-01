import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '@shared/types'

const file = () => {
  const dir = join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'settings.json')
}

export function getSettings(): AppSettings {
  try {
    return { allowedSites: [], ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<AppSettings>) }
  } catch {
    return { allowedSites: [] }
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  if (patch.language !== undefined && !['system', 'en', 'pt-BR'].includes(patch.language)) throw new Error('Unsupported language')
  const next = { ...getSettings(), ...patch }
  const tmp = `${file()}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2))
  renameSync(tmp, file())
  return next
}
