import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ChevronRight, FlaskConical, Search, SquareTerminal } from 'lucide-react'
import { useApp } from '@/state/app'
import type { ProviderModel } from '@shared/types'
import { cn } from '@/lib/cn'

/** Nome legível de um modelo (ou "Padrão"). */
export function modelLabel(models: ProviderModel[], id?: string): string {
  return tr(models.find((m) => m.id === (id ?? 'default'))?.label ?? id ?? 'Padrão')
}

function ProviderIcon({ id }: { id: string }) {
  useLanguage()
  if (id === 'claude-code' || id === 'anthropic-api') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-[#d49479]">
      {Array.from({ length: 12 }, (_, i) => <path key={i} d="M12 2.5v5.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${i * 30} 12 12)`} />)}
    </svg>
  )
  const Icon = id === 'echo' ? FlaskConical : SquareTerminal
  return <Icon size={16} aria-hidden="true" className={cn('shrink-0', id === 'codex' && 'text-[#79bfa2]')} />
}

/** One themed picker for providers and models, portaled to avoid clipping in composers and side panels. */
export function ModelSelect({ providerId, value, onChange, disabled, fullWidth, placement = 'down' }: {
  providerId: string
  value?: string
  onChange(providerId: string, model: string): void
  disabled?: boolean
  fullWidth?: boolean
  placement?: 'up' | 'down'
}) {
  useLanguage()
  const { providers } = useApp()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [position, setPosition] = useState({ top: 0, left: 0, height: 420, width: 340, up: false })
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const id = useId()
  const provider = providers.find((p) => p.id === providerId)
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus() }

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const button = trigger.current
      if (!button || button.matches(':disabled')) { setOpen(false); return }
      const box = button.getBoundingClientRect()
      const below = window.innerHeight - box.bottom - 16
      const above = box.top - 16
      const up = placement === 'up' ? above >= 200 || above > below : below < 260 && above > below
      const height = Math.min(440, Math.max(160, up ? above : below))
      const width = Math.min(360, window.innerWidth - 24)
      setPosition({ top: up ? box.top - 8 : box.bottom + 8,
        left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)), height, width, up })
    }
    update()
    search.current?.focus()
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close()
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    document.addEventListener('pointerdown', outside)
    const observer = new MutationObserver(update)
    for (let ancestor: HTMLElement | null = trigger.current; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor === trigger.current || ancestor.tagName === 'FIELDSET') observer.observe(ancestor, { attributes: true, attributeFilter: ['disabled'] })
    }
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      document.removeEventListener('pointerdown', outside)
      observer.disconnect()
    }
  }, [open, placement])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return }
    if (event.key === 'Tab') { close(true); return }
    const items = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[data-model-option]:not(:disabled)') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    let next: number | undefined
    if (event.key === 'ArrowDown') next = (index + 1) % Math.max(items.length, 1)
    if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1
    if (document.activeElement !== search.current && event.key === 'Home') next = 0
    if (document.activeElement !== search.current && event.key === 'End') next = items.length - 1
    if (next !== undefined) { event.preventDefault(); items[next]?.focus() }
  }
  const needle = query.trim().toLocaleLowerCase()
  const groups = providers.map((p) => ({ provider: p,
    models: (p.models?.length ? p.models : [{ id: 'default', label: tr('Padrão') }]).filter((m) =>
      !needle || `${tr(p.name)} ${tr(m.label)} ${m.description ? tr(m.description) : ''}`.toLocaleLowerCase().includes(needle))
  })).filter((g) => g.models.length)

  return <>
    <button ref={trigger} type="button" disabled={disabled} aria-label={tr('Provedor e modelo')} aria-haspopup="dialog"
      aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { setQuery(''); setOpen((shown) => !shown) }}
      className={cn('inline-flex h-8 min-w-0 items-center gap-2 rounded-full border border-line bg-card px-3 text-[13px] font-medium text-fg-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50', fullWidth && 'h-10 w-full justify-start rounded-nav')}>
      <ProviderIcon id={providerId} />
      <span className="truncate">{tr(provider?.name ?? providerId)}<span className="mx-1.5 text-muted">/</span>{modelLabel(provider?.models ?? [], value)}</span>
      <ChevronDown size={13} className={cn('ml-auto shrink-0 text-muted transition-transform', open && 'rotate-180')} />
    </button>
    {open && createPortal(
      <div ref={panel} id={id} role="dialog" aria-label={tr('Escolher provedor e modelo')} onKeyDown={onKeyDown}
        style={{ top: position.up ? undefined : position.top, bottom: position.up ? window.innerHeight - position.top : undefined,
          left: position.left, maxHeight: position.height, width: position.width }}
        className="fixed z-[100] flex flex-col overflow-hidden rounded-[16px] border border-line bg-sidebar text-fg shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
          <Search size={15} className="text-muted" />
          <input ref={search} aria-label={tr('Buscar modelo')} placeholder={tr('Buscar modelo…')} value={query} onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted" />
        </div>
        <div className="min-h-0 overflow-y-auto p-2" role="tree" aria-label={tr('Provedores e modelos')}>
          {groups.map(({ provider: p, models }) => {
            const expanded = !!needle || !collapsed.has(p.id)
            const ready = p.status === 'ready'
            const status = p.status === 'coming-soon' ? tr('Em breve') : p.status === 'unavailable' ? tr('Indisponível') : tr('Conectar conta')
            return <div key={p.id} role="treeitem" aria-label={p.name} aria-expanded={expanded}>
              <button type="button" data-model-option className="flex w-full items-center gap-2 rounded-nav px-2 py-2 text-left text-[13px] font-semibold hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => setCollapsed((all) => { const next = new Set(all); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next })}>
                <ChevronRight size={12} className={cn('text-muted transition-transform', expanded && 'rotate-90')} />
                <ProviderIcon id={p.id} /><span>{tr(p.name)}</span>
                {!ready && <span className="ml-auto text-[10px] font-normal text-muted">{status}</span>}
              </button>
              {expanded && <div role="group" className="mb-1 ml-[14px] border-l border-line pl-2">
                {models.map((m) => {
                  const selected = p.id === providerId && m.id === (value ?? 'default')
                  return <button key={m.id} role="treeitem" aria-label={tr(m.label)} aria-level={2} aria-selected={selected} type="button" disabled={!ready} data-model-option
                    onClick={() => { if (!trigger.current?.matches(':disabled')) onChange(p.id, m.id); close(true) }}
                    className={cn('relative my-0.5 flex w-full items-center gap-3 rounded-nav px-3 py-2 text-left text-[13px] hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40', selected && 'bg-hover')}>
                    <span aria-hidden className="absolute -left-2 top-1/2 w-2 border-t border-line" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{tr(m.label)}</span>
                      {m.description && <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-muted">{tr(m.description)}</span>}
                    </span>
                    {selected && <Check size={14} className="shrink-0 text-primary" />}
                  </button>
                })}
              </div>}
            </div>
          })}
          {!groups.length && <p className="px-3 py-6 text-center text-[13px] text-muted">{tr('Nenhum modelo encontrado.')}</p>}
        </div>
      </div>, document.body)}
  </>
}
