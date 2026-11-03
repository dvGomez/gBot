import { t as tr, useLanguage } from '@/i18n'
import { useMemo, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react'
import { GraduationCap } from 'lucide-react'
import type { AvatarDef } from '@shared/types'
import { PixelAvatar } from '@/components/PixelAvatar'
import { cn } from '@/lib/cn'
import { mentionQuery, normalize } from '@/lib/mentions'

/** Algo que dá para mencionar: um bot (com avatar) ou uma especialização. */
export interface MentionItem {
  id: string
  name: string
  description?: string
  avatar?: AvatarDef
}

/** Um tipo de menção: o caractere que abre o autocompletar, o título da lista e as opções. */
export interface MentionSource {
  trigger: '@' | '/'
  title: string
  items: MentionItem[]
}

/**
 * Autocompletar de menções num campo de texto (`@bot`, `/especialização`): acompanha o cursor, filtra as opções pelo
 * que foi digitado e insere o nome escolhido. Vale a menção mais perto do cursor.
 */
export function useMentions({
  text,
  setText,
  ref,
  sources
}: {
  text: string
  setText(text: string): void
  ref: RefObject<HTMLTextAreaElement | null>
  sources: MentionSource[]
}) {
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const active = sources
    .map((source) => ({ source, query: mentionQuery(text, caret, source.trigger) }))
    .filter((m) => m.query)
    .sort((a, b) => b.query!.start - a.query!.start)[0]
  const query = active?.query
  const suggestions = useMemo(() => {
    if (!active || !query) return []
    const q = normalize(query.query)
    // Nomes que começam com o que foi digitado vêm antes dos que só contêm o trecho.
    const starts = (x: MentionItem) => (normalize(x.name).startsWith(q) ? 0 : 1)
    return active.source.items
      .filter((x) => normalize(x.name).includes(q))
      .sort((a, b) => starts(a) - starts(b))
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query?.query, active?.source])
  const open = !dismissed && suggestions.length > 0

  const pick = (name: string) => {
    if (!active || !query) return
    const next = `${text.slice(0, query.start)}${active.source.trigger}${name} ${text.slice(caret)}`
    const pos = query.start + name.length + 2
    setText(next)
    setCaret(pos)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  return {
    /** Ligar no `onChange` do campo (depois de guardar o texto). */
    onChange(e: ChangeEvent<HTMLTextAreaElement>) {
      setCaret(e.target.selectionStart)
      setHighlight(0)
      setDismissed(false)
    },
    onSelect(e: { currentTarget: HTMLTextAreaElement }) {
      setCaret(e.currentTarget.selectionStart)
    },
    /** Navegação da lista pelo teclado; devolve true quando a tecla foi usada pela lista. */
    onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
      if (!open) return false
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setHighlight((h) => (h + d + suggestions.length) % suggestions.length)
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(suggestions[Math.min(highlight, suggestions.length - 1)].name)
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return true
      }
      return false
    },
    reset() {
      setCaret(0)
    },
    /** A lista de opções, para posicionar perto do campo (acima ou abaixo). */
    menu: open ? (
      <MentionMenu title={active!.source.title} items={suggestions} highlight={highlight} onPick={pick} />
    ) : null,
    open
  }
}

function MentionMenu({
  title,
  items,
  highlight,
  onPick
}: {
  title: string
  items: MentionItem[]
  highlight: number
  onPick(name: string): void
}) {
  useLanguage()
  return (
    <div role="listbox" aria-label={title} className="w-[300px] overflow-hidden rounded-tile border border-line bg-sidebar py-1 shadow-lg">
      <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium text-muted">{title}</p>
      {items.map((x, i) => (
        <button
          key={x.id}
          type="button"
          role="option"
          aria-selected={i === highlight}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(x.name)
          }}
          className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === highlight && 'bg-hover')}
        >
          {x.avatar ? (
            <PixelAvatar avatar={x.avatar} size={22} animated={false} />
          ) : (
            <GraduationCap size={18} className="mx-0.5 shrink-0 text-muted" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">{x.name}</span>
            {x.description && <span className="block truncate text-[11px] text-muted">{x.description}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Bots como opções de menção (`@`). */
export const botMentions = (bots: { id: string; name: string; description: string; avatar: AvatarDef }[]): MentionSource => ({
  trigger: '@',
  title: tr('Mencionar um bot'),
  items: bots.map((b) => ({ id: b.id, name: b.name, description: b.description, avatar: b.avatar }))
})
