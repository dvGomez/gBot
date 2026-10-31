import { useState } from 'react'
import { Check, ChevronDown, LoaderCircle, X } from 'lucide-react'
import type { ToolActivity } from '@shared/types'
import { cn } from '@/lib/cn'
import { botByName } from '@/lib/mentions'
import { useApp } from '@/state/app'
import { Markdown } from './Markdown'
import { PixelAvatar } from './PixelAvatar'

/** Ferramentas internas do Claude Code (mensagens antigas ainda podem tê-las salvas). */
const HIDDEN = new Set(['ToolSearch'])

function StatusIcon({ status }: { status: ToolActivity['status'] }) {
  if (status === 'running') return <LoaderCircle size={12} className="shrink-0 animate-spin text-muted" />
  if (status === 'done') return <Check size={12} strokeWidth={2.5} className="shrink-0 text-success" />
  return <X size={12} strokeWidth={2.5} className="shrink-0 text-danger" />
}

/** Ferramentas usadas na resposta. Consultas a bots mostram o avatar e abrem a resposta do bot ao clicar. */
export function ToolList({ tools }: { tools: ToolActivity[] }) {
  const app = useApp()
  const [open, setOpen] = useState<string>()
  const opened = tools.find((t) => t.id === open && t.detail)
  const visible = tools.filter((t) => !HIDDEN.has(t.name))
  if (!visible.length) return null

  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-1.5">
        {visible.map((t) => {
          const bot = t.botName ? botByName(app.bots, t.botName) : undefined
          const expandable = !!t.detail
          return (
            <button
              key={t.id}
              type="button"
              title={t.name}
              disabled={!expandable}
              onClick={() => setOpen(open === t.id ? undefined : t.id)}
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[12px] text-fg-2',
                expandable && 'hover:bg-hover',
                open === t.id && 'border-muted/60'
              )}
            >
              {bot ? (
                <PixelAvatar avatar={bot.avatar} size={14} mood={t.status === 'running' ? 'thinking' : 'idle'} animated={t.status === 'running'} />
              ) : null}
              <StatusIcon status={t.status} />
              <span className="truncate">{t.summary}</span>
              {expandable && <ChevronDown size={12} className={cn('shrink-0 transition-transform', open === t.id && 'rotate-180')} />}
            </button>
          )
        })}
      </div>
      {opened && (
        <div className="mt-2 rounded-tile border border-line bg-sidebar px-4 py-3 text-[14px]">
          <p className="mb-2 text-[12px] font-medium text-muted">Resposta de {opened.botName}</p>
          <Markdown text={opened.detail!} />
        </div>
      )}
    </div>
  )
}
