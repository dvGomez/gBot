import { useEffect, useState } from 'react'
import { Brain, Pencil, Plus, Trash2 } from 'lucide-react'
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

/** Memória de um bot ou fluxo: o que aprendeu, quando, por quê e de onde veio; dá para editar, desligar e apagar. */
export function MemoryPanel({ owner, compact }: { owner: MemoryOwner; compact?: boolean }) {
  const app = useApp()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [editing, setEditing] = useState<string | 'new'>()

  useEffect(() => {
    const load = () => void window.gbot.memory.list(owner).then(setLessons)
    load()
    return window.gbot.memory.onChanged((o) => {
      if (o.kind === owner.kind && o.id === owner.id) load()
    })
  }, [owner.kind, owner.id])

  const save = async (lesson: Lesson) => {
    setLessons((ls) => [lesson, ...ls.filter((l) => l.id !== lesson.id)])
    await window.gbot.memory.save(lesson)
  }

  const sourceLabel = (l: Lesson) => {
    if (l.source.kind === 'manual') return 'adicionado por você'
    if (l.source.kind === 'flow') {
      const flow = app.flows.find((f) => f.id === l.source.id)
      return flow ? (
        <button onClick={() => app.openFlow(flow.id)} className="inline text-left underline underline-offset-2 hover:text-fg">
          no fluxo "{flow.name}"
        </button>
      ) : (
        'num fluxo'
      )
    }
    const conv = app.conversations.find((c) => c.id === l.source.id)
    return conv ? (
      <button onClick={() => app.openConversation(conv.id)} className="inline text-left underline underline-offset-2 hover:text-fg">
        na conversa "{conv.title}"
      </button>
    ) : (
      'numa conversa'
    )
  }

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
        {editing !== 'new' && (
          <Button onClick={() => setEditing('new')} className="h-8">
            <Plus size={14} /> Adicionar
          </Button>
        )}
      </div>

      {editing === 'new' && (
        <div className="mb-3">
          <LessonForm
            initial={EMPTY}
            onCancel={() => setEditing(undefined)}
            onSave={(d) => {
              const now = Date.now()
              void save({ id: uid(), owner, ...d, source: { kind: 'manual' }, enabled: true, createdAt: now, updatedAt: now })
              setEditing(undefined)
            }}
          />
        </div>
      )}

      {lessons.length === 0 && editing !== 'new' && (
        <p className="text-[13px] leading-relaxed text-muted">
          Nada aprendido ainda. Quando algo der errado e {who} descobrir o jeito certo, ele anota aqui um procedimento curto
          para acertar de primeira na próxima vez.
        </p>
      )}

      <div className="space-y-2">
        {lessons.map((l) =>
          editing === l.id ? (
            <LessonForm
              key={l.id}
              initial={l}
              onCancel={() => setEditing(undefined)}
              onSave={(d) => {
                void save({ ...l, ...d, updatedAt: Date.now() })
                setEditing(undefined)
              }}
            />
          ) : (
            <div key={l.id} className={`rounded-tile border border-line p-3.5 ${l.enabled ? '' : 'opacity-55'}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">{l.title}</p>
                  {l.when && <p className="text-[12px] text-muted">Quando: {l.when}</p>}
                </div>
                <Toggle label="Usar esta lição" checked={l.enabled} onChange={(v) => void save({ ...l, enabled: v, updatedAt: Date.now() })} />
                <ItemMenu
                  actions={[
                    { label: 'Editar', icon: Pencil, onSelect: () => setEditing(l.id) },
                    {
                      label: 'Excluir',
                      icon: Trash2,
                      danger: true,
                      confirm: 'Excluir esta lição da memória?',
                      onSelect: () => {
                        setLessons((ls) => ls.filter((x) => x.id !== l.id))
                        void window.gbot.memory.remove(owner, l.id)
                      }
                    }
                  ]}
                />
              </div>
              <p className="selectable mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{l.steps}</p>
              {l.why && <p className="mt-2 text-[12px] text-muted">Por quê: {l.why}</p>}
              <p className="mt-2 text-[11px] text-muted">
                Aprendido {timeAgo(l.createdAt)} {sourceLabel(l)}
                {l.updatedAt - l.createdAt > 60_000 && ` · editado ${timeAgo(l.updatedAt)}`}
              </p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
