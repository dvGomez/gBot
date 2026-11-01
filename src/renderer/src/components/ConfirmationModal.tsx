import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useState } from 'react'
import { ExternalLink, Hand, X } from 'lucide-react'
import type { PendingConfirmation } from '@shared/types'
import { timeAgo } from '@/lib/format'
import { useApp } from '@/state/app'
import { FileCards } from './FileCards'
import { Markdown } from './Markdown'
import { Button, inputClass } from './ui'

/** Botões das opções: a primeira em destaque, como na notificação. */
function OptionButtons({ item, note, small }: { item: PendingConfirmation; note?: string; small?: boolean }) {
  useLanguage()
  const app = useApp()
  const [sending, setSending] = useState(false)
  return (
    <>
      {item.options.map((o, i) => (
        <Button
          key={o.id}
          variant={i === 0 ? 'primary' : 'secondary'}
          className={small ? 'h-7 px-3 text-[12px]' : undefined}
          disabled={sending}
          onClick={() => {
            setSending(true)
            void app.respondConfirmation(item.id, o.id, note)
          }}
        >
          {o.label}
        </Button>
      ))}
    </>
  )
}

/**
 * Janela para responder uma confirmação de fluxo: o que precisa ser confirmado, o resultado das caixinhas
 * anteriores e os arquivos (imagens com miniatura), sem precisar abrir o fluxo.
 */
export function ConfirmationModal() {
  useLanguage()
  const app = useApp()
  const item = app.confirmations.find((c) => c.id === app.openConfirmationId)
  const [note, setNote] = useState('')

  useEffect(() => setNote(''), [item?.id])

  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') app.openConfirmation(undefined)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, app])

  if (!item) return null
  const images = item.files.filter((f) => f.thumb)
  const others = item.files.filter((f) => !f.thumb)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) app.openConfirmation(undefined)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr('Confirmação do fluxo')}
        className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-card border border-line bg-page shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-tile text-warning">
            <Hand size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-muted">{tr('Fluxo ')}{item.flowName} · {timeAgo(item.createdAt)}
            </p>
            <p className="truncate text-[16px] font-semibold">{item.title}</p>
          </div>
          <button
            onClick={() => app.openConfirmation(undefined)}
            aria-label={tr('Fechar')}
            className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg"
          >
            <X size={16} />
          </button>
        </div>

        <div className="selectable space-y-4 overflow-y-auto px-6 py-5">
          <p className="text-[15px] leading-relaxed text-fg">{item.message || tr('Escolha como o fluxo deve seguir.')}</p>

          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {images.map((f) => (
                <button
                  key={f.path}
                  onClick={() => void window.gbot.files.open(f.path)}
                  title={tr('Abrir {0}', f.name)}
                  className="group overflow-hidden rounded-tile border border-line bg-sidebar text-left"
                >
                  <img src={f.thumb} alt={f.name} className="aspect-[4/3] w-full object-cover transition-opacity group-hover:opacity-85" />
                  <p className="truncate px-2.5 py-1.5 text-[12px] text-fg-2">{f.name}</p>
                </button>
              ))}
            </div>
          )}
          {others.length > 0 && <FileCards files={others} />}

          {item.detail && (
            <div>
              <p className="pb-1.5 text-[12px] font-medium text-muted">{tr('O que chegou até aqui')}</p>
              <div className="max-h-[260px] overflow-y-auto rounded-tile bg-sidebar px-4 py-3 text-[13px]">
                <Markdown text={item.detail} />
              </div>
            </div>
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={tr('Comentário (opcional): vai junto para as próximas caixinhas. Ex.: aprovado, mas dê 5% de desconto.')}
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => {
              app.openConfirmation(undefined)
              app.openFlow(item.flowId)
            }}
          >
            <ExternalLink size={14} />{tr(' Abrir fluxo')}</Button>
          <OptionButtons item={item} note={note} />
        </div>
      </div>
    </div>
  )
}

/** Aviso no topo, em qualquer tela, enquanto houver confirmação esperando: dá para responder dali mesmo. */
export function PendingConfirmationsBar() {
  useLanguage()
  const app = useApp()
  const first = app.confirmations[0]
  if (!first) return null
  const more = app.confirmations.length - 1
  return (
    <div className="mx-auto mb-2 flex w-full max-w-[860px] flex-wrap items-center gap-2 rounded-tile border border-warning/50 bg-sidebar px-4 py-2.5 text-[13px]">
      <Hand size={15} className="shrink-0 text-warning" />
      <button onClick={() => app.openConfirmation(first.id)} className="min-w-0 flex-1 truncate text-left text-fg-2 hover:text-fg">
        <span className="font-medium text-fg">{first.flowName}</span>{tr(' espera sua confirmação: ')}{first.title}
        {first.files.length > 0 && ` · ${first.files.length === 1 ? tr('1 arquivo') : tr('{0} arquivos', first.files.length)}`}
        {more > 0 && ` (+${more})`}
      </button>
      <Button variant="ghost" className="h-7 px-3 text-[12px]" onClick={() => app.openConfirmation(first.id)}>{tr('Ver detalhes')}</Button>
      <OptionButtons item={first} small />
    </div>
  )
}
