import { t as tr, useLanguage } from '@/i18n'
import { createContext, useContext } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Clock, GraduationCap, Hand, LoaderCircle, Play, Split, Square } from 'lucide-react'
import type { FlowNodeData, FlowStepStatus } from '@shared/types'
import { PixelAvatar } from '@/components/PixelAvatar'
import { Toggle } from '@/components/ui'
import { modelLabel } from '@/components/ModelSelect'
import { cn } from '@/lib/cn'
import { describeSchedule, formatWhen, nextRun } from '@/lib/schedule'
import { useApp } from '@/state/app'

/** Dados que o canvas passa para cada caixinha: os da rotina + o estado na execução atual. */
export type CanvasNodeData = FlowNodeData & { status?: FlowStepStatus } & Record<string, unknown>
export type CanvasNode = Node<CanvasNodeData>

/** O que os gatilhos do canvas podem fazer: cada um é uma rotina, com rodar, parar e liga/desliga próprios. */
export interface TriggerActions {
  run(triggerId: string): Promise<void>
  stop(triggerId?: string): Promise<void>
  setEnabled(triggerId: string, enabled: boolean): Promise<void>
  /** Gatilhos com execução em andamento. */
  live: Set<string>
  /** Gatilho sendo iniciado agora. */
  starting?: string
  stopping: boolean
}
export const CanvasActions = createContext<TriggerActions | undefined>(undefined)

const STATUS_RING: Record<FlowStepStatus, string> = {
  pending: 'border-line',
  running: 'border-warning animate-pulse',
  waiting: 'border-warning',
  stopped: 'border-muted opacity-60',
  done: 'border-success',
  error: 'border-danger',
  skipped: 'border-line opacity-60'
}

function Box({
  selected,
  status,
  children,
  target = true,
  source = true
}: {
  selected?: boolean
  status?: FlowStepStatus
  children: React.ReactNode
  target?: boolean
  source?: boolean
}) {
  useLanguage()
  return (
    <div
      className={cn(
        'w-[250px] rounded-card border-2 bg-card px-4 py-3.5 shadow-lg transition-colors',
        status ? STATUS_RING[status] : selected ? 'border-fg-2' : 'border-line'
      )}
    >
      {target && <Handle type="target" position={Position.Left} className="!size-3 !border-2 !border-page !bg-muted" />}
      {children}
      {source && <Handle type="source" position={Position.Right} className="!size-3 !border-2 !border-page !bg-fg-2" />}
    </div>
  )
}

function Preview({ text }: { text?: string }) {
  useLanguage()
  return (
    <p className={cn('mt-2 line-clamp-2 text-[12px] leading-snug', text?.trim() ? 'text-fg-2' : 'text-muted italic')}>
      {text?.trim() || tr('Sem mensagem ainda')}
    </p>
  )
}

/** Gatilho: uma rotina do bot. Mostra a agenda e tem rodar/parar e liga/desliga próprios. */
export function TriggerNode({ id, data, selected }: NodeProps<CanvasNode>) {
  useLanguage()
  const actions = useContext(CanvasActions)
  const live = !!actions?.live.has(id)
  const busy = actions?.starting === id
  const next = data.enabled ? nextRun(data.schedule) : undefined
  return (
    <Box selected={selected} target={false} status={data.status}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-tile',
            data.enabled ? 'bg-primary text-on-primary' : 'bg-tile text-muted'
          )}
        >
          <Clock size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{data.label || tr('Gatilho')}</p>
          <p className="truncate text-[12px] text-muted">{data.schedule ? describeSchedule(data.schedule) : tr('Só manual')}</p>
        </div>
        {actions && data.schedule && (
          <span className="nodrag" onClick={(e) => e.stopPropagation()}>
            <Toggle checked={!!data.enabled} onChange={(v) => void actions.setEnabled(id, v)} label={tr('Rotina ligada')} />
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="truncate text-[12px] text-fg-2">
          {live ? tr('Rodando agora') : next ? `${tr('Próxima: ')}${formatWhen(next)}` : data.schedule ? tr('Desligada') : ''}
        </p>
        {actions && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void (live ? actions.stop(id) : actions.run(id))
            }}
            disabled={busy || (live && actions.stopping)}
            className={cn(
              'nodrag inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium disabled:opacity-50',
              live ? 'border-danger/60 text-danger hover:bg-danger/10' : 'border-line text-fg-2 hover:bg-hover'
            )}
          >
            {busy ? <LoaderCircle size={12} className="animate-spin" /> : live ? <Square size={11} fill="currentColor" /> : <Play size={12} />}
            {live ? tr('Parar') : tr('Rodar')}
          </button>
        )}
      </div>
    </Box>
  )
}

/** Tarefa: o bot da rotina faz a etapa, com a especialização escolhida (se houver). */
export function TaskNode({ data, selected }: NodeProps<CanvasNode>) {
  useLanguage()
  const app = useApp()
  const bot = app.getBot(app.selectedFlow?.botId)
  const sp = app.getSpecialization(data.specializationId)
  // Modelo da caixinha, se escolhido; senão, o do bot.
  const own = !!data.providerId || !!data.model
  const providerId = (own ? data.providerId : bot?.providerId) ?? 'claude-code'
  const models = app.providers.find((p) => p.id === providerId)?.models ?? []
  const running = data.status === 'running'
  return (
    <Box selected={selected} status={data.status}>
      <div className="flex items-center gap-3">
        {bot ? (
          <PixelAvatar avatar={bot.avatar} size={34} animated={running} mood={running ? 'thinking' : 'idle'} />
        ) : (
          <div className="size-9 shrink-0 rounded-tile bg-tile" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{data.label || sp?.name || tr('Tarefa')}</p>
          <p className="flex items-center gap-1 truncate text-[12px] text-muted">
            {sp && <GraduationCap size={12} className="shrink-0" />}
            <span className="truncate">
              {sp ? sp.name : tr('Sem especialização')}
              {models.length ? ` · ${modelLabel(models, own ? data.model : bot?.model)}` : ''}
            </span>
          </p>
        </div>
      </div>
      <Preview text={data.message} />
    </Box>
  )
}

/** Decisão: uma bolinha de saída por opção; só o ramo da opção escolhida segue. */
export function DecisionNode({ data, selected }: NodeProps<CanvasNode>) {
  useLanguage()
  const app = useApp()
  const provider = app.providers.find((p) => p.id === (data.providerId ?? 'claude-code'))
  const options = data.options ?? []
  return (
    <Box selected={selected} status={data.status} source={false}>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-tile text-warning">
          <Split size={17} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{data.label || tr('Decisão')}</p>
          <p className="truncate text-[12px] text-muted">
            {provider?.name ?? tr('Provedor')}
            {provider?.models?.length
              ? ` · ${!data.model && provider.id === 'claude-code' ? 'Haiku' : modelLabel(provider.models, data.model)}`
              : ''}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {options.map((o) => (
          <div key={o.id} className="relative rounded-nav border border-line bg-sidebar py-1.5 pr-4 pl-2.5 text-[12px] text-fg-2">
            <span className="line-clamp-2">{o.label || tr('Opção sem texto')}</span>
            <Handle
              type="source"
              id={o.id}
              position={Position.Right}
              className="!-right-[19px] !size-3 !border-2 !border-page !bg-warning"
            />
          </div>
        ))}
        {!options.length && <p className="text-[12px] text-muted italic">{tr('Adicione opções no painel')}</p>}
      </div>
    </Box>
  )
}

/** Bolinhas de saída, uma por opção (decisão e confirmação). */
function OptionOutputs({ options, empty }: { options: CanvasNodeData['options']; empty: string }) {
  useLanguage()
  return (
    <div className="mt-3 space-y-1.5">
      {(options ?? []).map((o) => (
        <div key={o.id} className="relative rounded-nav border border-line bg-sidebar py-1.5 pr-4 pl-2.5 text-[12px] text-fg-2">
          <span className="line-clamp-2">{o.label || tr('Opção sem texto')}</span>
          <Handle type="source" id={o.id} position={Position.Right} className="!-right-[19px] !size-3 !border-2 !border-page !bg-warning" />
        </div>
      ))}
      {!options?.length && <p className="text-[12px] text-muted italic">{empty}</p>}
    </div>
  )
}

/** Confirmação: pausa a rotina, notifica o usuário e segue pela opção que ele escolher. */
export function ConfirmNode({ id, data, selected }: NodeProps<CanvasNode>) {
  useLanguage()
  const app = useApp()
  const waiting = app.confirmations.find((c) => c.nodeId === id)
  return (
    <Box selected={selected} status={data.status} source={false}>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-tile text-warning">
          <Hand size={17} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{data.label || tr('Confirmação')}</p>
          <p className="truncate text-[12px] text-muted">{tr('Você decide · notificação')}</p>
        </div>
      </div>
      <Preview text={data.message} />
      {waiting && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            app.openConfirmation(waiting.id)
          }}
          className="nodrag mt-2 w-full rounded-full bg-warning px-3 py-1.5 text-[12px] font-semibold text-page hover:opacity-90"
        >{tr('Esperando você · responder')}</button>
      )}
      <OptionOutputs options={data.options} empty={tr('Adicione as opções (botões) no painel')} />
    </Box>
  )
}

export const nodeTypes = { trigger: TriggerNode, task: TaskNode, decision: DecisionNode, confirm: ConfirmNode }
