import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { ArrowUp, FileText, LoaderCircle, Paperclip, Square, X } from 'lucide-react'
import type { ChatFile } from '@shared/types'
import { useApp } from '@/state/app'
import { cn } from '@/lib/cn'
import { mentionQuery, normalize } from '@/lib/mentions'
import { LimitsButton } from './LimitsButton'
import { ModelSelect } from './ModelSelect'
import { PixelAvatar } from './PixelAvatar'
import { ProviderNotice } from './ProviderNotice'

export function Composer({ autoFocus, placeholder = tr('Pergunte qualquer coisa…') }: { autoFocus?: boolean; placeholder?: string }) {
  useLanguage()
  const app = useApp()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<ChatFile[]>([])
  const [attaching, setAttaching] = useState(false)
  const [attachError, setAttachError] = useState<string>()
  const [dragging, setDragging] = useState(false)
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

  // Anexos: arrastados, colados (prints vêm sem arquivo de origem) ou escolhidos no seletor.
  const attach = async (files: File[]) => {
    if (!files.length) return
    setAttaching(true)
    setAttachError(undefined)
    try {
      const cid = app.composeConversationId
      for (const file of files) {
        let [saved] = await window.gbot.attachments.add(cid, [file])
        if (!saved) {
          const name = file.name || `imagem-colada-${Date.now()}.${file.type.split('/')[1] || 'png'}`
          ;[saved] = await window.gbot.attachments.addData(cid, name, new Uint8Array(await file.arrayBuffer()))
        }
        if (saved) setAttachments((list) => [...list, saved])
      }
    } catch (e) {
      setAttachError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setAttaching(false)
    }
  }
  const pickFiles = async () => {
    setAttachError(undefined)
    const saved = await window.gbot.attachments.pick(app.composeConversationId)
    setAttachments((list) => [...list, ...saved])
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void attach([...e.dataTransfer.files])
  }
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files]
    if (!files.length) return
    e.preventDefault()
    void attach(files)
  }

  const canSend = (!!text.trim() || attachments.length > 0) && !attaching
  const submit = () => {
    if (!canSend || app.busy) return
    app.send(text, attachments)
    setText('')
    setCaret(0)
    setAttachments([])
  }

  return (
    <>
      <ProviderNotice />
      <div
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative rounded-card border bg-card p-3 transition-colors focus-within:border-muted/50',
          dragging ? 'border-dashed border-muted' : 'border-line'
        )}
      >
        {(attachments.length > 0 || attaching || attachError) && (
          <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
            {attachments.map((f) => (
              <span key={f.path} className="group relative flex items-center gap-2 rounded-tile border border-line bg-sidebar py-1.5 pr-2 pl-1.5">
                {f.thumb ? (
                  <img src={f.thumb} alt="" className="size-9 rounded-nav object-cover" />
                ) : (
                  <span className="flex size-9 items-center justify-center rounded-nav bg-tile">
                    <FileText size={16} className="text-muted" />
                  </span>
                )}
                <span className="max-w-[160px] truncate text-[12px] text-fg-2" title={f.name}>
                  {f.name}
                </span>
                <button
                  onClick={() => setAttachments((list) => list.filter((x) => x.path !== f.path))}
                  aria-label={tr('Tirar {0}', f.name)}
                  className="rounded-full p-0.5 text-muted hover:bg-hover hover:text-fg"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {attaching && <LoaderCircle size={16} className="animate-spin text-muted" />}
            {attachError && <span className="text-[12px] text-danger">{attachError}</span>}
          </div>
        )}
        {showSuggestions && (
          <div className="absolute bottom-full left-3 mb-2 w-[300px] overflow-hidden rounded-tile border border-line bg-sidebar py-1 shadow-lg">
            <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium text-muted">{tr('Chamar um bot')}</p>
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
          onPaste={onPaste}
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
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={() => void pickFiles()}
              disabled={app.busy}
              className="flex size-8 items-center justify-center rounded-full border border-line text-fg-2 hover:bg-hover disabled:opacity-40"
              aria-label={tr('Anexar arquivos')}
              title={tr('Anexar arquivos ou fotos (também dá para arrastar ou colar)')}
            >
              <Paperclip size={15} />
            </button>
            <ModelSelect
              providers={app.providers}
              providerId={app.providerId}
              value={app.activeModel}
              onChange={(providerId, model) => {
                app.setProviderId(providerId)
                app.setActiveModel(model, providerId)
              }}
              disabled={app.busy}
              placement="up"
            />
            {app.visibleBots.length > 0 && <span className="hidden text-[12px] text-muted xl:inline">{tr('Use @ para chamar um bot')}</span>}
          </div>

          <div className="flex items-center gap-2">
            <LimitsButton placement="up" />
            {app.busy ? (
              <button
                onClick={app.cancel}
                className="flex size-9 items-center justify-center rounded-full bg-primary text-on-primary"
                aria-label={tr('Parar resposta')}
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!canSend}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full bg-primary text-on-primary transition-opacity',
                  !canSend && 'opacity-30'
                )}
                aria-label={tr('Enviar')}
              >
                <ArrowUp size={18} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
