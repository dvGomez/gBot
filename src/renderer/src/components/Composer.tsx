import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Square } from 'lucide-react'
import { useApp } from '@/state/app'
import { cn } from '@/lib/cn'
import { mentionQuery, normalize } from '@/lib/mentions'
import { ModelSelect } from './ModelSelect'
import { PixelAvatar } from './PixelAvatar'
import { ProviderNotice } from './ProviderNotice'

export function Composer({ autoFocus, placeholder = 'Pergunte qualquer coisa…' }: { autoFocus?: boolean; placeholder?: string }) {
  const app = useApp()
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  // Cresce com o texto até ~8 linhas
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden'
  }, [text])

  // Autocompletar de @menções
  const mention = mentionQuery(text, caret)
  const suggestions = useMemo(() => {
    if (!mention) return []
    const q = normalize(mention.query)
    return app.visibleBots.filter((b) => normalize(b.name).includes(q)).slice(0, 6)
  }, [mention?.query, app.visibleBots])
  const showSuggestions = !dismissed && suggestions.length > 0

  const pick = (name: string) => {
    if (!mention) return
    const next = `${text.slice(0, mention.start)}@${name} ${text.slice(caret)}`
    const pos = mention.start + name.length + 2
    setText(next)
    setCaret(pos)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  const submit = () => {
    if (!text.trim() || app.busy) return
    app.send(text)
    setText('')
    setCaret(0)
  }

  return (
    <>
      <ProviderNotice />
      <div className="relative rounded-card border border-line bg-card p-3 transition-colors focus-within:border-muted/50">
        {showSuggestions && (
          <div className="absolute bottom-full left-3 mb-2 w-[300px] overflow-hidden rounded-tile border border-line bg-sidebar py-1 shadow-lg">
            <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium text-muted">Chamar um bot</p>
            {suggestions.map((b, i) => (
              <button
                key={b.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(b.name)
                }}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === highlight && 'bg-hover')}
              >
                <PixelAvatar avatar={b.avatar} size={22} animated={false} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{b.name}</span>
                  <span className="block truncate text-[11px] text-muted">{b.description}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value)
            setCaret(e.target.selectionStart)
            setHighlight(0)
            setDismissed(false)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (showSuggestions) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const d = e.key === 'ArrowDown' ? 1 : -1
                setHighlight((h) => (h + d + suggestions.length) % suggestions.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                pick(suggestions[Math.min(highlight, suggestions.length - 1)].name)
                return
              }
              if (e.key === 'Escape') {
                setDismissed(true)
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          className="selectable block w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-fg outline-none placeholder:text-muted"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center">
              <select
                value={app.providerId}
                onChange={(e) => app.setProviderId(e.target.value)}
                className="h-8 appearance-none rounded-full border border-line bg-card pr-8 pl-3.5 text-[13px] font-medium text-fg-2 outline-none hover:bg-hover"
              >
                {app.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.status !== 'ready'}>
                    {p.name}
                    {p.status !== 'ready' ? ' — em breve' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 text-muted" />
            </label>
            {app.models.length > 0 && (
              <ModelSelect models={app.models} value={app.activeModel} onChange={app.setActiveModel} disabled={app.busy} />
            )}
            {app.visibleBots.length > 0 && <span className="text-[12px] text-muted">Use @ para chamar um bot</span>}
          </div>

          {app.busy ? (
            <button
              onClick={app.cancel}
              className="flex size-9 items-center justify-center rounded-full bg-primary text-on-primary"
              aria-label="Parar resposta"
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              className={cn(
                'flex size-9 items-center justify-center rounded-full bg-primary text-on-primary transition-opacity',
                !text.trim() && 'opacity-30'
              )}
              aria-label="Enviar"
            >
              <ArrowUp size={18} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </>
  )
}
