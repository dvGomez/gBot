import { t as tr, useLanguage } from '@/i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { Brain, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { Lesson, MemoryOwner } from '@shared/types'
import { ItemMenu } from '@/components/ItemMenu'
import { Button, Field, Toggle, inputClass } from '@/components/ui'
import { timeAgo, uid } from '@/lib/format'
import { useApp } from '@/state/app'

type Draft = Pick<Lesson, 'title' | 'when' | 'steps' | 'why'>
const EMPTY: Draft = { title: '', when: '', steps: '', why: '' }

/** Tokens aproximados que as lições ativas ocupam no prompt (≈ 4 caracteres por token). */
const tokens = (ls: Lesson[]) =>
  Math.round(ls.filter((l) => l.enabled).reduce((n, l) => n + l.title.length + l.when.length + l.steps.length + 20, 0) / 4)

function LessonForm({ initial, onSave, onCancel }: { initial: Draft; onSave(d: Draft): void; onCancel(): void }) {
  useLanguage()
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string>()
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setD({ ...d, [k]: e.target.value })
    setError(undefined)
  }
  return (
    <div className="space-y-3 rounded-tile border border-line bg-sidebar p-4">
      <Field label={tr('Título')} error={error}>
        <input value={d.title} onChange={set('title')} maxLength={70} placeholder={tr('Enviar mensagem no WhatsApp Web')} className={inputClass} />
      </Field>
      <Field label={tr('Quando usar')}>
        <input value={d.when} onChange={set('when')} maxLength={140} placeholder={tr('Ao mandar texto longo num grupo')} className={inputClass} />
      </Field>
      <Field label={tr('Passos')} hint={tr('Curto e objetivo: tudo isto vai no prompt do bot.')}>
        <textarea
          value={d.steps}
          onChange={set('steps')}
          maxLength={500}
          rows={4}
          placeholder={tr('1. Abrir a conversa pela busca\n2. Mandar uma mensagem por parágrafo, sem quebras de linha')}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      </Field>
      <Field label={tr('Por quê')}>
        <input value={d.why} onChange={set('why')} maxLength={200} placeholder={tr('Quebras de linha cortavam caracteres')} className={inputClass} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{tr('Cancelar')}</Button>
        <Button
          variant="primary"
          onClick={() => {
            if (!d.title.trim() || !d.steps.trim()) return setError(tr('Preencha pelo menos o título e os passos.'))
            onSave(d)
          }}
        >{tr('Salvar')}</Button>
      </div>
    </div>
  )
}

/** De onde a lição veio (conversa ou rotina, com link), para o rodapé do cartão. */
function SourceLabel({ lesson: l }: { lesson: Lesson }) {
  useLanguage()
  const app = useApp()
  if (l.source.kind === 'manual') return <>{tr('adicionado por você')}</>
  if (l.source.kind === 'flow') {
    // A lição guarda só o fluxo do bot (que reúne as rotinas dele).
    const flow = app.flows.find((f) => f.id === l.source.id)
    const bot = app.getBot(flow?.botId)
    return flow && bot ? (
      <button onClick={() => app.openFlow(flow.id)} className="inline text-left underline underline-offset-2 hover:text-fg">{tr('nas rotinas de {0}', bot.name)}
      </button>
    ) : (
      <>{tr('numa rotina')}</>
    )
  }
  const conv = app.conversations.find((c) => c.id === l.source.id)
  return conv ? (
    <button onClick={() => app.openConversation(conv.id)} className="inline text-left underline underline-offset-2 hover:text-fg">{tr('na conversa "')}{conv.title}"
    </button>
  ) : (
    <>{tr('numa conversa')}</>
  )
}

/** Remove acentos e caixa, mantendo uma letra por letra (para achar e destacar o trecho no texto original). */
const fold = (s: string) =>
  [...s]
    .map((c) => {
      const f = c.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
      return f.length === 1 ? f : c.toLowerCase().slice(0, 1) || ' '
    })
    .join('')

export const matches = (text: string, query: string) => !query.trim() || fold(text).includes(fold(query.trim()))

/** Texto com o trecho procurado destacado (sem diferenciar acentos e maiúsculas). */
export function Highlight({ text, query }: { text: string; query?: string }) {
  useLanguage()
  const q = query?.trim()
  if (!q) return <>{text}</>
  const hay = fold(text)
  const needle = fold(q)
  const parts: ReactNode[] = []
  let from = 0
  let i = hay.indexOf(needle)
  while (i >= 0) {
    parts.push(text.slice(from, i), <mark key={i} className="rounded-[3px] bg-warning/35 px-0.5 text-fg">{text.slice(i, i + needle.length)}</mark>)
    from = i + needle.length
    i = hay.indexOf(needle, from)
  }
  parts.push(text.slice(from))
  return <>{parts}</>
}

/** Uma lição: ligar/desligar, editar e excluir, com o trecho procurado destacado. */
export function LessonCard({ lesson: l, query }: { lesson: Lesson; query?: string }) {
  useLanguage()
  const [editing, setEditing] = useState(false)
  const save = (lesson: Lesson) => void window.gbot.memory.save(lesson)
  if (editing) {
    return (
      <LessonForm
        initial={l}
        onCancel={() => setEditing(false)}
        onSave={(d) => {
          save({ ...l, ...d, updatedAt: Date.now() })
          setEditing(false)
        }}
      />
    )
  }
  return (
    <div className={`rounded-tile border border-line p-3.5 ${l.enabled ? '' : 'opacity-55'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">
            <Highlight text={l.title} query={query} />
          </p>
          {l.when && (
            <p className="text-[12px] text-muted">{tr('Quando: ')}<Highlight text={l.when} query={query} />
            </p>
          )}
        </div>
        <Toggle label={tr('Usar esta lição')} checked={l.enabled} onChange={(v) => save({ ...l, enabled: v, updatedAt: Date.now() })} />
        <ItemMenu
          actions={[
            { label: tr('Editar'), icon: Pencil, onSelect: () => setEditing(true) },
            {
              label: tr('Excluir'),
              icon: Trash2,
              danger: true,
              confirm: tr('Excluir esta lição da memória?'),
              onSelect: () => void window.gbot.memory.remove(l.owner, l.id)
            }
          ]}
        />
      </div>
      <p className="selectable mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">
        <Highlight text={l.steps} query={query} />
      </p>
      {l.why && (
        <p className="mt-2 text-[12px] text-muted">{tr('Por quê: ')}<Highlight text={l.why} query={query} />
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">{tr('Aprendido ')}{timeAgo(l.createdAt)} <SourceLabel lesson={l} />
        {l.updatedAt - l.createdAt > 60_000 && tr(' · editado {0}', timeAgo(l.updatedAt))}
        {!l.enabled && ' · desligada'}
      </p>
    </div>
  )
}

/**
 * Memória de um bot ou de uma especialização: o que aprendeu, quando, por quê e de onde veio; dá para editar, desligar
 * e apagar. A da especialização é escrita pelos bots que a usam e vale para todos eles.
 */
export function MemoryPanel({ owner, compact }: { owner: MemoryOwner; compact?: boolean }) {
  useLanguage()
  const app = useApp()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const load = () => void window.gbot.memory.list(owner).then(setLessons)
    load()
    return window.gbot.memory.onChanged((o) => {
      if (o.kind === owner.kind && o.id === owner.id) load()
    })
  }, [owner.kind, owner.id])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
            {!compact && <Brain size={14} />}{tr(' Memória')}</p>
          {lessons.length > 0 && (
            <p className="text-[12px] text-muted">
              {lessons.length} {lessons.length === 1 ? tr('lição') : tr('lições')} · ~{tokens(lessons)}{tr(' tokens no prompt')}</p>
          )}
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)} className="h-8">
            <Plus size={14} />{tr(' Adicionar')}</Button>
        )}
      </div>

      {adding && (
        <div className="mb-3">
          <LessonForm
            initial={EMPTY}
            onCancel={() => setAdding(false)}
            onSave={(d) => {
              const now = Date.now()
              void window.gbot.memory.save({ id: uid(), owner, ...d, source: { kind: 'manual' }, enabled: true, createdAt: now, updatedAt: now })
              setAdding(false)
            }}
          />
        </div>
      )}

      {lessons.length === 0 && !adding && (
        <p className="text-[13px] leading-relaxed text-muted">
          {owner.kind === 'bot'
            ? tr('Nada aprendido ainda. Quando algo der errado e o bot descobrir o jeito certo, ele anota aqui um procedimento curto para acertar de primeira na próxima vez.')
            : tr('Nada aprendido ainda. Quando um bot que usa esta especialização errar e descobrir o jeito certo, ele anota aqui um procedimento curto, que passa a valer para todos os bots que a usam.')}
        </p>
      )}

      <div className="space-y-2">
        {lessons.map((l) => (
          <LessonCard key={l.id} lesson={l} />
        ))}
      </div>

      <button
        onClick={() => app.openMemory(owner.kind === 'specialization' ? { specializationId: owner.id } : { botId: owner.id })}
        className="mt-3 flex items-center gap-1.5 text-[12px] text-muted hover:text-fg"
      >
        <Search size={12} />{tr(' Procurar uma regra em toda a memória e nas instruções')}</button>
    </div>
  )
}
