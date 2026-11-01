import { t as tr, useLanguage } from '@/i18n'
import { useState } from 'react'
import { Check, LoaderCircle, MessageCircleQuestion } from 'lucide-react'
import type { QuestionAnswer, UserQuestion } from '@shared/types'
import { cn } from '@/lib/cn'
import { Button } from './ui'

interface Choice {
  picked: string[]
  other: string
  /** "Outra resposta" marcada. */
  otherOn: boolean
}

const answerOf = (c: Choice) => [...c.picked, ...(c.otherOn && c.other.trim() ? [c.other.trim()] : [])].join(', ')

/**
 * Perguntas com opções que a IA faz para entender melhor o pedido. Cada pergunta aceita uma opção (ou várias,
 * com `multiSelect`) ou uma resposta escrita. `onSkip` deixa a IA decidir sozinha.
 */
export function QuestionCard({
  questions,
  onSubmit,
  onSkip,
  busy,
  title = tr('Algumas perguntas para acertar de primeira')
}: {
  questions: UserQuestion[]
  onSubmit(answers: QuestionAnswer[]): void
  onSkip?(): void
  busy?: boolean
  title?: string
}) {
  useLanguage()
  const [choices, setChoices] = useState<Choice[]>(() => questions.map(() => ({ picked: [], other: '', otherOn: false })))
  const complete = choices.every((c) => answerOf(c))

  const update = (i: number, fn: (c: Choice) => Choice) => setChoices((cs) => cs.map((c, j) => (j === i ? fn(c) : c)))

  const toggle = (i: number, label: string, multi?: boolean) =>
    update(i, (c) =>
      multi
        ? { ...c, picked: c.picked.includes(label) ? c.picked.filter((l) => l !== label) : [...c.picked, label] }
        : { ...c, picked: [label], otherOn: false }
    )

  return (
    <div className="rounded-tile border border-line bg-card p-4">
      <p className="flex items-center gap-2 pb-3 text-[13px] font-medium text-fg-2">
        <MessageCircleQuestion size={15} className="text-muted" />
        {title}
      </p>
      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={i}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted">{q.header}</span>
              <p className="text-[14px] leading-snug font-medium text-fg">{q.question}</p>
            </div>
            <div className="mt-2 grid gap-1.5">
              {q.options.map((o) => {
                const on = choices[i].picked.includes(o.label)
                return (
                  <button
                    key={o.label}
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(i, o.label, q.multiSelect)}
                    className={cn(
                      'flex items-start gap-3 rounded-nav border px-3 py-2 text-left transition-colors disabled:opacity-60',
                      on ? 'border-fg/50 bg-hover' : 'border-line hover:bg-hover'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-4 shrink-0 items-center justify-center border',
                        q.multiSelect ? 'rounded-[4px]' : 'rounded-full',
                        on ? 'border-primary bg-primary text-on-primary' : 'border-muted/60'
                      )}
                    >
                      {on && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-fg">{o.label}</span>
                      {o.description && <span className="block text-[12px] leading-snug text-muted">{o.description}</span>}
                    </span>
                  </button>
                )
              })}
              <div
                className={cn(
                  'flex items-center gap-3 rounded-nav border px-3 py-1.5 transition-colors',
                  choices[i].otherOn ? 'border-fg/50 bg-hover' : 'border-line'
                )}
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center border',
                    q.multiSelect ? 'rounded-[4px]' : 'rounded-full',
                    choices[i].otherOn ? 'border-primary bg-primary text-on-primary' : 'border-muted/60'
                  )}
                >
                  {choices[i].otherOn && <Check size={10} strokeWidth={3} />}
                </span>
                <input
                  value={choices[i].other}
                  disabled={busy}
                  onFocus={() => update(i, (c) => ({ ...c, otherOn: true, picked: q.multiSelect ? c.picked : [] }))}
                  onChange={(e) => update(i, (c) => ({ ...c, other: e.target.value, otherOn: true }))}
                  placeholder={tr('Outra resposta…')}
                  className="selectable h-7 min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-muted"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={busy}>{tr('Pular, decida você')}</Button>
        )}
        <Button
          variant="primary"
          disabled={!complete || busy}
          onClick={() => onSubmit(questions.map((q, i) => ({ question: q.question, answer: answerOf(choices[i]) })))}
        >
          {busy && <LoaderCircle size={14} className="animate-spin" />}{tr('Enviar respostas')}</Button>
      </div>
    </div>
  )
}
