import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Square } from 'lucide-react'
import { useApp } from '@/state/app'
import { cn } from '@/lib/cn'
import { ProviderNotice } from './ProviderNotice'

export function Composer({ autoFocus, placeholder = 'Pergunte qualquer coisa…' }: { autoFocus?: boolean; placeholder?: string }) {
  const app = useApp()
  const [text, setText] = useState('')
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

  const submit = () => {
    if (!text.trim() || app.busy) return
    app.send(text)
    setText('')
  }

  return (
    <>
      <ProviderNotice />
      <div className="rounded-card border border-line bg-card p-3 transition-colors focus-within:border-muted/50">
        <textarea
          ref={ref}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          className="selectable block w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-fg outline-none placeholder:text-muted"
        />
        <div className="mt-2 flex items-center justify-between">
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
