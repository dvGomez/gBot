import { Plus, Trash2, X } from 'lucide-react'
import { uid } from '@/lib/format'
import type { FlowNodeData, FlowNodeType, FlowSchedule } from '@shared/types'
import { Button, Chip, Field, inputClass } from '@/components/ui'
import { cn } from '@/lib/cn'
import { WEEKDAYS } from '@/lib/schedule'
import { useApp } from '@/state/app'

const PREV_HINT = 'O resultado das caixinhas anteriores vai junto automaticamente. Use {{anterior}} para escolher onde ele entra.'

function ScheduleEditor({ value, onChange }: { value: FlowSchedule; onChange(s: FlowSchedule): void }) {
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Chip
          active={value.mode === 'times'}
          onClick={() => value.mode !== 'times' && onChange({ mode: 'times', days: [1, 2, 3, 4, 5], times: ['09:00'] })}
        >
          Em horários
        </Chip>
        <Chip
          active={value.mode === 'interval'}
          onClick={() => value.mode !== 'interval' && onChange({ mode: 'interval', everyMinutes: 60 })}
        >
          Repetir a cada
        </Chip>
      </div>

      {value.mode === 'times' ? (
        <>
          <Field label="Dias da semana">
            <div className="flex gap-1.5">
              {WEEKDAYS.map((d, i) => {
                const on = value.days.includes(i)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      onChange({ ...value, days: on ? value.days.filter((x) => x !== i) : [...value.days, i].sort() })
                    }
                    className={cn(
                      'h-9 flex-1 rounded-nav border text-[12px] font-medium transition-colors',
                      on ? 'border-primary bg-primary text-on-primary' : 'border-line text-fg-2 hover:bg-hover'
                    )}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="Horários">
            <div className="space-y-2">
              {value.times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => onChange({ ...value, times: value.times.map((x, j) => (j === i ? e.target.value : x)) })}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, times: value.times.filter((_, j) => j !== i) })}
                    aria-label="Remover horário"
                    className="rounded-full p-2 text-muted hover:bg-hover hover:text-fg"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <Button type="button" onClick={() => onChange({ ...value, times: [...value.times, '12:00'] })}>
                <Plus size={14} /> Horário
              </Button>
            </div>
          </Field>
        </>
      ) : (
        <Field label="Intervalo" hint="Conta a partir da última execução (ou de quando o fluxo foi ativado).">
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={value.everyMinutes % 60 === 0 ? value.everyMinutes / 60 : value.everyMinutes}
              onChange={(e) => {
                const n = Math.max(1, Number(e.target.value) || 1)
                onChange({ mode: 'interval', everyMinutes: value.everyMinutes % 60 === 0 ? n * 60 : n })
              }}
              className={inputClass}
            />
            <select
              value={value.everyMinutes % 60 === 0 ? 'h' : 'min'}
              onChange={(e) => {
                const hours = e.target.value === 'h'
                const n = value.everyMinutes % 60 === 0 ? value.everyMinutes / 60 : value.everyMinutes
                onChange({ mode: 'interval', everyMinutes: hours ? n * 60 : n === 60 ? 59 : n })
              }}
              className={inputClass}
            >
              <option value="min">minutos</option>
              <option value="h">horas</option>
            </select>
          </div>
        </Field>
      )}
    </div>
  )
}

/** Painel lateral para configurar a caixinha selecionada. */
export function NodePanel({
  type,
  data,
  onChange,
  onDelete
}: {
  type: FlowNodeType
  data: FlowNodeData
  onChange(patch: Partial<FlowNodeData>): void
  onDelete?: () => void
}) {
  const app = useApp()
  const provider = app.providers.find((p) => p.id === (data.providerId ?? 'claude-code'))

  return (
    <div className="space-y-5">
      <Field label="Nome da caixinha" hint="Opcional.">
        <input
          value={data.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={type === 'trigger' ? 'Gatilho' : type === 'bot' ? 'Nome do bot' : type === 'decision' ? 'Decisão' : 'Prompt'}
          className={inputClass}
        />
      </Field>

      {type === 'trigger' && data.schedule && (
        <ScheduleEditor value={data.schedule} onChange={(schedule) => onChange({ schedule })} />
      )}

      {type === 'bot' && (
        <>
          <Field label="Bot">
            <select value={data.botId ?? ''} onChange={(e) => onChange({ botId: e.target.value || undefined })} className={inputClass}>
              <option value="">Escolha um bot</option>
              {app.bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mensagem para o bot" hint={PREV_HINT}>
            <textarea
              value={data.message ?? ''}
              onChange={(e) => onChange({ message: e.target.value })}
              rows={7}
              placeholder="Ex.: Resuma as novidades de hoje em 5 tópicos."
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </>
      )}

      {type === 'decision' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="IA que decide">
              <select
                value={data.providerId ?? 'claude-code'}
                onChange={(e) => onChange({ providerId: e.target.value, model: undefined })}
                className={inputClass}
              >
                {app.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.status !== 'ready'}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            {!!provider?.models?.length && (
              <Field label="Modelo">
                <select
                  value={data.model ?? 'default'}
                  onChange={(e) => onChange({ model: e.target.value === 'default' ? undefined : e.target.value })}
                  className={inputClass}
                >
                  {provider.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Field
            label="Opções"
            hint="Cada opção tem sua bolinha de saída: ligue-a ao que deve acontecer nesse caso. Só o caminho escolhido roda."
          >
            <div className="space-y-2">
              {(data.options ?? []).map((o, i) => (
                <div key={o.id} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-[12px] text-muted">{i + 1}.</span>
                  <input
                    value={o.label}
                    onChange={(e) =>
                      onChange({ options: (data.options ?? []).map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })
                    }
                    placeholder={i === (data.options ?? []).length - 1 ? 'Caso contrário' : 'Quando o resultado for…'}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ options: (data.options ?? []).filter((x) => x.id !== o.id) })}
                    aria-label="Remover opção"
                    className="rounded-full p-2 text-muted hover:bg-hover hover:text-fg"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <Button type="button" onClick={() => onChange({ options: [...(data.options ?? []), { id: uid(), label: '' }] })}>
                <Plus size={14} /> Opção
              </Button>
            </div>
          </Field>
          <Field label="Critério (opcional)" hint="Ajuda a IA a decidir. O resultado das caixinhas anteriores vai junto.">
            <textarea
              value={data.message ?? ''}
              onChange={(e) => onChange({ message: e.target.value })}
              rows={3}
              placeholder="Ex.: Considere urgente se mencionar prazo de hoje."
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </>
      )}

      {type === 'prompt' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="IA">
              <select
                value={data.providerId ?? 'claude-code'}
                onChange={(e) => onChange({ providerId: e.target.value, model: undefined })}
                className={inputClass}
              >
                {app.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.status !== 'ready'}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            {!!provider?.models?.length && (
              <Field label="Modelo">
                <select
                  value={data.model ?? 'default'}
                  onChange={(e) => onChange({ model: e.target.value === 'default' ? undefined : e.target.value })}
                  className={inputClass}
                >
                  {provider.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Field label="Prompt" hint={PREV_HINT}>
            <textarea
              value={data.message ?? ''}
              onChange={(e) => onChange({ message: e.target.value })}
              rows={9}
              placeholder="Ex.: Abra o g1.globo.com no navegador e liste as 5 principais manchetes."
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </>
      )}

      {onDelete && (
        <Button variant="ghost" onClick={onDelete} className="text-danger">
          <Trash2 size={14} /> Remover caixinha
        </Button>
      )}
    </div>
  )
}
