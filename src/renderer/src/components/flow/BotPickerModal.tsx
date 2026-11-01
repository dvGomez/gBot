import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import type { Bot } from '@shared/types'
import { normalize } from '@/lib/mentions'
import { useApp } from '@/state/app'
import { PixelAvatar } from '../PixelAvatar'
import { Button, inputClass } from '../ui'

interface Props {
  /** Projeto do fluxo: os bots dele aparecem primeiro. */
  projectId?: string
  onPick(bot: Bot): void
  onClose(): void
}

/** Janela para escolher o bot de uma caixinha nova do fluxo, com os avatares. */
export function BotPickerModal({ projectId, onPick, onClose }: Props) {
  const app = useApp()
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const bots = useMemo(() => {
    const q = normalize(query.trim())
    return app.bots
      .filter((b) => !q || normalize(`${b.name} ${b.description}`).includes(q))
      .sort((a, b) => Number(b.projectId === projectId) - Number(a.projectId === projectId) || a.name.localeCompare(b.name))
  }, [app.bots, query, projectId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Escolher bot"
        className="flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-card border border-line bg-page shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <p className="text-[16px] font-semibold">Qual bot faz esta etapa?</p>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg">
            <X size={16} />
          </button>
        </div>

        {app.bots.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <p className="text-[15px] font-medium">Você ainda não tem bots</p>
            <p className="mt-1 text-[13px] text-muted">Crie um bot e depois volte para colocá-lo no fluxo.</p>
            <Button
              variant="primary"
              className="mt-5"
              onClick={() => {
                onClose()
                app.editBot(undefined, projectId)
              }}
            >
              <Plus size={14} /> Criar bot
            </Button>
          </div>
        ) : (
          <>
            {app.bots.length > 6 && (
              <div className="relative px-6 pt-4">
                <Search size={14} className="pointer-events-none absolute top-1/2 left-9 mt-2 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar bot…"
                  className={`${inputClass} pl-9`}
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 overflow-y-auto px-6 py-5">
              {bots.map((b) => {
                const project = app.getProject(b.projectId)
                return (
                  <button
                    key={b.id}
                    onClick={() => onPick(b)}
                    className="flex flex-col items-center rounded-tile border border-line bg-card px-3 pt-4 pb-3 text-center transition-colors hover:border-muted/60 hover:bg-hover"
                  >
                    <div className="flex size-[72px] items-center justify-center rounded-tile bg-sidebar">
                      <PixelAvatar avatar={b.avatar} size={52} />
                    </div>
                    <p className="mt-2.5 w-full truncate text-[14px] font-semibold">{b.name}</p>
                    {b.description && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{b.description}</p>}
                    {project && <p className="mt-1.5 truncate text-[11px] text-fg-2">{project.name}</p>}
                  </button>
                )
              })}
              {bots.length === 0 && <p className="col-span-3 py-6 text-center text-[13px] text-muted">Nenhum bot com esse nome.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
