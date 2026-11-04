import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronLeft, LoaderCircle, MessageCircleQuestion } from 'lucide-react'
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
 * Perguntas que a IA faz ao usuário, uma por vez: clicar numa opção já passa para a próxima pergunta (ou teclar o
 * número dela). Cada pergunta aceita uma opção (ou várias, com `multiSelect`) ou uma resposta escrita; sem opções, é
 * só o campo para escrever. `onSkip` deixa a IA decidir sozinha.
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
  const [step, setStep] = useState(0)
  const card = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const complete = choices.every((c) => answerOf(c))
  const last = step === questions.length - 1
  const q = questions[step]
  const open = q.options.length === 0

  // A pergunta pede atenção: o cartão (ou o campo, quando a resposta é livre) recebe o foco.
  useEffect(() => {
    if (open) text.current?.focus()
    else card.current?.focus({ preventScroll: true })
  }, [step, open])

  const update = (i: number, fn: (c: Choice) => Choice) => setChoices((cs) => cs.map((c, j) => (j === i ? fn(c) : c)))
  const submit = (cs = choices) => onSubmit(questions.map((x, i) => ({ question: x.question, answer: answerOf(cs[i]) })))

  /** Depois de responder: vai para a próxima pergunta sem resposta (ou a seguinte); na última, envia se estiver tudo respondido. */
  const advance = (cs: Choice[]) => {
    const pending = cs.findIndex((c, i) => i > step && !answerOf(c))
    if (pending >= 0) setStep(pending)
    else if (!last) setStep(step + 1)
    else if (cs.every((c) => answerOf(c))) submit(cs)
  }

  const pick = (label: string) => {
    if (q.multiSelect) {
      update(step, (c) => ({ ...c, picked: c.picked.includes(label) ? c.picked.filter((l) => l !== label) : [...c.picked, label] }))
      return
    }
    const next = choices.map((c, j) => (j === step ? { ...c, picked: [label], otherOn: false } : c))
    setChoices(next)
    advance(next)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (busy || e.target !== card.current) return
    const n = Number(e.key)
    if (n >= 1 && n <= q.options.length) {
      e.preventDefault()
      pick(q.options[n - 1].label)
    } else if (e.key === 'ArrowRight' && !last) setStep(step + 1)
    else if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1)
    else if (e.key === 'Enter' && answerOf(choices[step])) {
      e.preventDefault()
      advance(choices)
    }
  }

  const choice = choices[step]
  return (
    <div ref={card} tabIndex={-1} onKeyDown={onKey} className="rounded-tile border border-line bg-card p-4 outline-none focus-visible:border-fg/40">
      <div className="flex items-center gap-2 pb-3">
        <MessageCircleQuestion size={15} className="shrink-0 text-muted" />
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-2">{title}</p>
        {questions.length > 1 && <span className="shrink-0 text-[12px] text-muted">{tr('{0} de {1}', step + 1, questions.length)}</span>}
      </div>

      {/* Abas das perguntas: mostram quais já têm resposta e deixam voltar a qualquer uma. */}
      {questions.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {questions.map((x, i) => {
            const done = !!answerOf(choices[i])
            return (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] transition-colors',
                  i === step ? 'border-fg/50 bg-hover text-fg' : 'border-line text-muted hover:bg-hover'
                )}
              >
                {done && <Check size={11} strokeWidth={3} className="text-success" />}
                {x.header}
              </button>
            )
          })}
        </div>
      )}

      <p className="text-[14px] leading-snug font-medium text-fg">{q.question}</p>
      <div className="mt-2.5 grid gap-1.5">
        {q.options.map((o, n) => {
          const on = choice.picked.includes(o.label)
          return (
            <button
              key={o.label}
              type="button"
              disabled={busy}
              onClick={() => pick(o.label)}
              className={cn(
                'group flex items-start gap-3 rounded-nav border px-3 py-2 text-left transition-colors disabled:opacity-60',
                on ? 'border-fg/50 bg-hover' : 'border-line hover:bg-hover'
              )}
            >
              {q.multiSelect ? (
                <span
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                    on ? 'border-primary bg-primary text-on-primary' : 'border-muted/60'
                  )}
                >
                  {on && <Check size={10} strokeWidth={3} />}
                </span>
              ) : (
                <span
                  className={cn(
                    'mt-px flex size-5 shrink-0 items-center justify-center rounded-[6px] border text-[11px] font-medium',
                    on ? 'border-primary bg-primary text-on-primary' : 'border-line text-muted group-hover:border-muted/60'
                  )}
                >
                  {n + 1}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-fg">{o.label}</span>
                {o.description && <span className="block text-[12px] leading-snug text-muted">{o.description}</span>}
              </span>
            </button>
          )
        })}

        {open ? (
          <textarea
            ref={text}
            value={choice.other}
            disabled={busy}
            rows={3}
            onChange={(e) => update(step, (c) => ({ ...c, other: e.target.value, otherOn: true }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && choice.other.trim()) {
                e.preventDefault()
                advance(choices)
              }
            }}
            placeholder={tr('Sua resposta… (Shift+Enter quebra a linha)')}
            className="selectable w-full resize-y rounded-nav border border-line bg-transparent px-3 py-2 text-[13px] leading-relaxed text-fg outline-none placeholder:text-muted focus:border-fg/50"
          />
        ) : (
          <div
            className={cn(
              'flex items-center gap-3 rounded-nav border px-3 py-1.5 transition-colors',
              choice.otherOn ? 'border-fg/50 bg-hover' : 'border-line'
            )}
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-[6px] border text-[11px]',
                choice.otherOn ? 'border-primary bg-primary text-on-primary' : 'border-line text-muted'
              )}
            >
              {choice.otherOn ? <Check size={10} strokeWidth={3} /> : '…'}
            </span>
            <input
              ref={text}
              value={choice.other}
              disabled={busy}
              onFocus={() => update(step, (c) => ({ ...c, otherOn: true, picked: q.multiSelect ? c.picked : [] }))}
              onChange={(e) => update(step, (c) => ({ ...c, other: e.target.value, otherOn: true }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && choice.other.trim()) {
                  e.preventDefault()
                  advance(choices)
                }
              }}
              placeholder={tr('Outra resposta…')}
              className="selectable h-7 min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-muted"
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={busy}>
            <ChevronLeft size={14} />{tr('Voltar')}</Button>
        )}
        <span className="flex-1" />
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} disabled={busy}>{tr('Pular, decida você')}</Button>
        )}
        {last ? (
          <Button variant="primary" disabled={!complete || busy} onClick={() => submit()}>
            {busy && <LoaderCircle size={14} className="animate-spin" />}{tr('Enviar respostas')}</Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={() => setStep(step + 1)}>{tr('Próxima')}</Button>
        )}
      </div>
    </div>
  )
}
