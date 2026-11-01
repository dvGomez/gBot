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
  const [d, setD] = useState(initial)
  const [error, setError] = useState<string>()
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setD({ ...d, [k]: e.target.value })
    setError(undefined)
  }
  return (
    <div className="space-y-3 rounded-tile border border-line bg-sidebar p-4">
      <Field label="Título" error={error}>
        <input value={d.title} onChange={set('title')} maxLength={70} placeholder="Enviar mensagem no WhatsApp Web" className={inputClass} />
      </Field>
      <Field label="Quando usar">
        <input value={d.when} onChange={set('when')} maxLength={140} placeholder="Ao mandar texto longo num grupo" className={inputClass} />
      </Field>
      <Field label="Passos" hint="Curto e objetivo: tudo isto vai no prompt do bot.">
        <textarea
          value={d.steps}
          onChange={set('steps')}
          maxLength={500}
          rows={4}
          placeholder={'1. Abrir a conversa pela busca\n2. Mandar uma mensagem por parágrafo, sem quebras de linha'}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      </Field>
      <Field label="Por quê">
        <input value={d.why} onChange={set('why')} maxLength={200} placeholder="Quebras de linha cortavam caracteres" className={inputClass} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (!d.title.trim() || !d.steps.trim()) return setError('Preencha pelo menos o título e os passos.')
            onSave(d)
          }}
        >
          Salvar
        </Button>
      </div>
    </div>
  )
}

/** De onde a lição veio (conversa ou fluxo, com link), para o rodapé do cartão. */
function SourceLabel({ lesson: l }: { lesson: Lesson }) {
  const app = useApp()
  if (l.source.kind === 'manual') return <>adicionado por você</>
  if (l.source.kind === 'flow') {
    const flow = app.flows.find((f) => f.id === l.source.id)
    return flow ? (
      <button onClick={() => app.openFlow(flow.id)} className="inline text-left underline underline-offset-2 hover:text-fg">
        no fluxo "{flow.name}"
      </button>
    ) : (
      <>num fluxo</>
    )
  }
  const conv = app.conversations.find((c) => c.id === l.source.id)
  return conv ? (
    <button onClick={() => app.openConversation(conv.id)} className="inline text-left underline underline-offset-2 hover:text-fg">
      na conversa "{conv.title}"
    </button>
  ) : (
    <>numa conversa</>
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
            <p className="text-[12px] text-muted">
              Quando: <Highlight text={l.when} query={query} />
            </p>
          )}
        </div>
        <Toggle label="Usar esta lição" checked={l.enabled} onChange={(v) => save({ ...l, enabled: v, updatedAt: Date.now() })} />
        <ItemMenu
          actions={[
            { label: 'Editar', icon: Pencil, onSelect: () => setEditing(true) },
            {
              label: 'Excluir',
              icon: Trash2,
              danger: true,
              confirm: 'Excluir esta lição da memória?',
              onSelect: () => void window.gbot.memory.remove(l.owner, l.id)
            }
          ]}
        />
      </div>
      <p className="selectable mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">
        <Highlight text={l.steps} query={query} />
      </p>
      {l.why && (
        <p className="mt-2 text-[12px] text-muted">
          Por quê: <Highlight text={l.why} query={query} />
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Aprendido {timeAgo(l.createdAt)} <SourceLabel lesson={l} />
        {l.updatedAt - l.createdAt > 60_000 && ` · editado ${timeAgo(l.updatedAt)}`}
        {!l.enabled && ' · desligada'}
      </p>
    </div>
  )
}

/** Memória de um bot ou fluxo: o que aprendeu, quando, por quê e de onde veio; dá para editar, desligar e apagar. */
export function MemoryPanel({ owner, compact }: { owner: MemoryOwner; compact?: boolean }) {
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

  const who = owner.kind === 'bot' ? 'o bot' : 'o fluxo'

  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
            {!compact && <Brain size={14} />} Memória
          </p>
          {lessons.length > 0 && (
            <p className="text-[12px] text-muted">
              {lessons.length} {lessons.length === 1 ? 'lição' : 'lições'} · ~{tokens(lessons)} tokens no prompt
            </p>
          )}
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)} className="h-8">
            <Plus size={14} /> Adicionar
          </Button>
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
          Nada aprendido ainda. Quando algo der errado e {who} descobrir o jeito certo, ele anota aqui um procedimento curto
          para acertar de primeira na próxima vez.
        </p>
      )}

      <div className="space-y-2">
        {lessons.map((l) => (
          <LessonCard key={l.id} lesson={l} />
        ))}
      </div>

      <button
        onClick={() => app.openMemory(owner.kind === 'flow' ? { flowId: owner.id } : { botId: owner.id })}
        className="mt-3 flex items-center gap-1.5 text-[12px] text-muted hover:text-fg"
      >
        <Search size={12} /> Procurar uma regra em toda a memória e nas instruções
      </button>
    </div>
  )
}
