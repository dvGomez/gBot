import { useEffect, useRef, useState, type ComponentType } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface MenuAction {
  label: string
  icon?: ComponentType<{ size?: number; className?: string }>
  onSelect(): void
  danger?: boolean
  /** Pede confirmação no próprio menu antes de executar (ex.: excluir). */
  confirm?: string
}

/** Botão "⋯" com um menu de ações. Ações perigosas pedem confirmação dentro do menu. */
export function ItemMenu({
  actions,
  className,
  label = 'Mais opções'
}: {
  actions: MenuAction[]
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<MenuAction>()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) setConfirming(undefined)
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={cn(
          'flex size-7 items-center justify-center rounded-nav text-muted transition-colors hover:bg-hover hover:text-fg',
          open && 'bg-hover text-fg'
        )}
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-1 w-[220px] overflow-hidden rounded-tile border border-line bg-sidebar py-1 shadow-xl"
        >
          {confirming ? (
            <div className="px-3 py-2">
              <p className="text-[12px] leading-relaxed text-fg-2">{confirming.confirm}</p>
              <div className="mt-2 flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setConfirming(undefined)}
                  className="rounded-full px-3 py-1 text-[12px] text-fg-2 hover:bg-hover"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    confirming.onSelect()
                  }}
                  className="rounded-full bg-danger px-3 py-1 text-[12px] font-medium text-white hover:opacity-90"
                >
                  {confirming.label}
                </button>
              </div>
            </div>
          ) : (
            actions.map((a) => (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation()
                  if (a.confirm) {
                    setConfirming(a)
                    return
                  }
                  setOpen(false)
                  a.onSelect()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-hover',
                  a.danger ? 'text-danger' : 'text-fg-2'
                )}
              >
                {a.icon && <a.icon size={14} />}
                {a.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
