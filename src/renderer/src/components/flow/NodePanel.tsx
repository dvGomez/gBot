import { t as tr, useLanguage } from '@/i18n'
import { Plus, Trash2, X } from 'lucide-react'
import { uid } from '@/lib/format'
import type { FlowDecisionOption, FlowNodeData, FlowNodeType, FlowSchedule } from '@shared/types'
import { Button, Chip, Field, inputClass } from '@/components/ui'
import { cn } from '@/lib/cn'
import { WEEKDAYS } from '@/lib/schedule'
import { ModelSelect } from '@/components/ModelSelect'
import { useApp } from '@/state/app'

const PREV_HINT = tr('O resultado das caixinhas anteriores vai junto automaticamente. Use {{anterior}} para escolher onde ele entra.')

function ScheduleEditor({ value, onChange }: { value: FlowSchedule; onChange(s: FlowSchedule): void }) {
  useLanguage()
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Chip
          active={value.mode === 'times'}
          onClick={() => value.mode !== 'times' && onChange({ mode: 'times', days: [1, 2, 3, 4, 5], times: ['09:00'] })}
        >{tr('Em horários')}</Chip>
        <Chip
          active={value.mode === 'interval'}
          onClick={() => value.mode !== 'interval' && onChange({ mode: 'interval', everyMinutes: 60 })}
        >{tr('Repetir a cada')}</Chip>
      </div>

      {value.mode === 'times' ? (
        <>
          <Field label={tr('Dias da semana')}>
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
          <Field label={tr('Horários')}>
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
                    aria-label={tr('Remover horário')}
                    className="rounded-full p-2 text-muted hover:bg-hover hover:text-fg"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <Button type="button" onClick={() => onChange({ ...value, times: [...value.times, '12:00'] })}>
                <Plus size={14} />{tr(' Horário')}</Button>
            </div>
          </Field>
        </>
      ) : (
        <Field label={tr('Intervalo')} hint={tr('Conta a partir da última execução (ou de quando a rotina foi ligada).')}>
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
              <option value="min">{tr('minutos')}</option>
              <option value="h">{tr('horas')}</option>
            </select>
          </div>
        </Field>
      )}
    </div>
  )
}

/** Lista editável de opções (cada uma vira uma bolinha de saída na caixinha). */
function OptionsEditor({
  options,
  onChange,
  placeholder,
  max
}: {
  options: FlowDecisionOption[]
  onChange(options: FlowDecisionOption[]): void
  placeholder(index: number, last: boolean): string
  max?: number
}) {
  useLanguage()
  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <div key={o.id} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-[12px] text-muted">{i + 1}.</span>
          <input
            value={o.label}
            onChange={(e) => onChange(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))}
            placeholder={placeholder(i, i === options.length - 1)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((x) => x.id !== o.id))}
            aria-label={tr('Remover opção')}
            className="rounded-full p-2 text-muted hover:bg-hover hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {(!max || options.length < max) && (
        <Button type="button" onClick={() => onChange([...options, { id: uid(), label: '' }])}>
          <Plus size={14} />{tr(' Opção')}</Button>
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
  useLanguage()
  const app = useApp()
  const bot = app.getBot(app.selectedFlow?.botId)
  // Especializações do bot primeiro; depois as outras disponíveis no projeto dele (usar uma delas não a adiciona ao bot).
  const own = (bot?.specializationIds ?? []).map((id) => app.getSpecialization(id)).filter((sp) => !!sp)
  const others = app.specializations.filter(
    (sp) => !bot?.specializationIds.includes(sp.id) && (!sp.projectId || sp.projectId === bot?.projectId)
  )
  const ownModel = !!data.providerId || !!data.model

  return (
    <div className="space-y-5">
      <Field label={tr('Nome da caixinha')} hint={tr('Opcional.')}>
        <input
          value={data.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={
            type === 'trigger'
              ? tr('Gatilho')
              : type === 'task'
                ? (app.getSpecialization(data.specializationId)?.name ?? tr('Tarefa'))
                : type === 'decision'
                  ? tr('Decisão')
                  : tr('Confirmação')
          }
          className={inputClass}
        />
      </Field>

      {type === 'trigger' && data.schedule && (
        <ScheduleEditor value={data.schedule} onChange={(schedule) => onChange({ schedule })} />
      )}

      {type === 'task' && (
        <>
          <Field label={tr('Especialização')} hint={tr('O que {0} usa nesta etapa. Sem especialização, faz com o que já sabe.', bot?.name ?? 'o bot')}>
            <select
              value={data.specializationId ?? ''}
              onChange={(e) => onChange({ specializationId: e.target.value || undefined })}
              className={inputClass}
            >
              <option value="">{tr('Nenhuma')}</option>
              {own.length > 0 && (
                <optgroup label={tr('Do bot')}>
                  {own.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label={tr('Outras')}>
                  {others.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
          <Field label={tr('O que fazer nesta etapa')} hint={tr(PREV_HINT)}>
            <textarea
              value={data.message ?? ''}
              onChange={(e) => onChange({ message: e.target.value })}
              rows={7}
              placeholder={tr('Ex.: Resuma as novidades de hoje em 5 tópicos.')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
          <Field label={tr('Modelo')} hint={tr('Por padrão, o do bot. Escolha outro só para esta etapa se precisar.')}>
            <div className="space-y-2">
              <select
                value={ownModel ? 'own' : 'bot'}
                onChange={(e) =>
                  onChange(
                    e.target.value === 'own'
                      ? { providerId: bot?.providerId ?? 'claude-code', model: bot?.model ?? app.preferredModel(bot?.providerId ?? 'claude-code') }
                      : { providerId: undefined, model: undefined }
                  )
                }
                className={inputClass}
              >
                <option value="bot">{tr('O modelo do bot')}</option>
                <option value="own">{tr('Outro modelo nesta etapa')}</option>
              </select>
              {ownModel && (
                <ModelSelect providerId={data.providerId ?? 'claude-code'} value={data.model}
                  onChange={(providerId, model) => {
                    const value = model === 'default' ? undefined : model
                    onChange({ providerId, model: value })
                    app.rememberModel(value, providerId)
                  }} fullWidth />
              )}
            </div>
          </Field>
        </>
      )}

      {type === 'decision' && (
        <>
          <Field label={tr('IA que decide')}>
            <ModelSelect providerId={data.providerId ?? 'claude-code'} value={data.model}
              onChange={(providerId, model) => {
                const value = model === 'default' ? undefined : model
                onChange({ providerId, model: value })
                app.rememberModel(value, providerId)
              }} fullWidth />
          </Field>
          <Field
            label={tr('Opções')}
            hint={tr('Cada opção tem sua bolinha de saída: ligue-a ao que deve acontecer nesse caso. Só o caminho escolhido roda.')}
          >
            <OptionsEditor
              options={data.options ?? []}
              onChange={(options) => onChange({ options })}
              placeholder={(i, last) => (last ? tr('Caso contrário') : tr('Quando o resultado for…'))}
            />
          </Field>
          <Field label={tr('Critério (opcional)')} hint={tr('Ajuda a IA a decidir. O resultado das caixinhas anteriores vai junto.')}>
            <textarea
              value={data.message ?? ''}
              onChange={(e) => onChange({ message: e.target.value })}
              rows={3}
              placeholder={tr('Ex.: Considere urgente se mencionar prazo de hoje.')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </>
      )}

      {type === 'confirm' && (
        <>
          <Field
            label={tr('O que você precisa confirmar')}
            hint={tr('Vai na notificação do sistema. O resultado das caixinhas anteriores e os arquivos gerados aparecem junto.')}
          >
            <textarea
              value={data.message ?? ''}
              onChange={(e) => onChange({ message: e.target.value })}
              rows={3}
              placeholder={tr('Ex.: Revise o orçamento antes de enviar ao cliente.')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
          <Field
            label={tr('Botões')}
            hint={tr('Cada botão aparece na notificação e tem sua bolinha de saída: ligue-a ao que deve acontecer. Até 5.')}
          >
            <OptionsEditor
              options={data.options ?? []}
              onChange={(options) => onChange({ options })}
              placeholder={(i) => (i === 0 ? tr('Ex.: Aprovar') : i === 1 ? tr('Ex.: Recusar') : tr('Ex.: Pedir ajuste'))}
              max={5}
            />
          </Field>
        </>
      )}

      {onDelete && (
        <Button variant="ghost" onClick={onDelete} className="text-danger">
          <Trash2 size={14} />{tr(' Remover caixinha')}</Button>
      )}
    </div>
  )
}
