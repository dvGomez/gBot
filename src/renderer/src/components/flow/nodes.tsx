import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Clock, Hand, Sparkles, Split } from 'lucide-react'
import type { FlowNodeData, FlowStepStatus } from '@shared/types'
import { PixelAvatar } from '@/components/PixelAvatar'
import { modelLabel } from '@/components/ModelSelect'
import { cn } from '@/lib/cn'
import { describeSchedule, formatWhen, nextRun } from '@/lib/schedule'
import { useApp } from '@/state/app'

/** Dados que o canvas passa para cada caixinha: os do fluxo + o estado na execução atual. */
export type CanvasNodeData = FlowNodeData & { status?: FlowStepStatus } & Record<string, unknown>
export type CanvasNode = Node<CanvasNodeData>

const STATUS_RING: Record<FlowStepStatus, string> = {
  pending: 'border-line',
  running: 'border-warning animate-pulse',
  waiting: 'border-warning',
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
  return (
    <p className={cn('mt-2 line-clamp-2 text-[12px] leading-snug', text?.trim() ? 'text-fg-2' : 'text-muted italic')}>
      {text?.trim() || 'Sem mensagem ainda'}
    </p>
  )
}

export function TriggerNode({ data, selected }: NodeProps<CanvasNode>) {
  const next = nextRun(data.schedule)
  return (
    <Box selected={selected} target={false} status={data.status}>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-primary text-on-primary">
          <Clock size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">{data.label || 'Gatilho'}</p>
          <p className="truncate text-[12px] text-muted">{describeSchedule(data.schedule)}</p>
        </div>
      </div>
      {next && <p className="mt-2 text-[12px] text-fg-2">Próxima: {formatWhen(next)}</p>}
    </Box>
  )
}

export function BotNode({ data, selected }: NodeProps<CanvasNode>) {
  const app = useApp()
  const bot = app.getBot(data.botId)
  return (
    <Box selected={selected} status={data.status}>
      <div className="flex items-center gap-3">
        {bot ? (
          <PixelAvatar avatar={bot.avatar} size={34} animated={data.status === 'running'} mood={data.status === 'running' ? 'thinking' : 'idle'} />
        ) : (
          <div className="size-9 shrink-0 rounded-tile bg-tile" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{data.label || bot?.name || 'Escolha um bot'}</p>
          <p className="truncate text-[12px] text-muted">Bot{bot && app.models.length ? ` · ${modelLabel(app.models, bot.model)}` : ''}</p>
        </div>
      </div>
      <Preview text={data.message} />
    </Box>
  )
}

export function PromptNode({ data, selected }: NodeProps<CanvasNode>) {
  const app = useApp()
  const provider = app.providers.find((p) => p.id === (data.providerId ?? 'claude-code'))
  return (
    <Box selected={selected} status={data.status}>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-tile text-fg-2">
          <Sparkles size={17} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{data.label || 'Prompt'}</p>
          <p className="truncate text-[12px] text-muted">
            {provider?.name ?? 'Provedor'}
            {provider?.models?.length ? ` · ${modelLabel(provider.models, data.model)}` : ''}
          </p>
        </div>
      </div>
      <Preview text={data.message} />
    </Box>
  )
}

/** Decisão: uma bolinha de saída por opção; só o ramo da opção escolhida segue. */
export function DecisionNode({ data, selected }: NodeProps<CanvasNode>) {
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
          <p className="truncate text-[14px] font-semibold">{data.label || 'Decisão'}</p>
          <p className="truncate text-[12px] text-muted">
            {provider?.name ?? 'Provedor'}
            {provider?.models?.length
              ? ` · ${!data.model && provider.id === 'claude-code' ? 'Haiku' : modelLabel(provider.models, data.model)}`
              : ''}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {options.map((o) => (
          <div key={o.id} className="relative rounded-nav border border-line bg-sidebar py-1.5 pr-4 pl-2.5 text-[12px] text-fg-2">
            <span className="line-clamp-2">{o.label || 'Opção sem texto'}</span>
            <Handle
              type="source"
              id={o.id}
              position={Position.Right}
              className="!-right-[19px] !size-3 !border-2 !border-page !bg-warning"
            />
          </div>
        ))}
        {!options.length && <p className="text-[12px] text-muted italic">Adicione opções no painel</p>}
      </div>
    </Box>
  )
}

/** Bolinhas de saída, uma por opção (decisão e confirmação). */
function OptionOutputs({ options, empty }: { options: CanvasNodeData['options']; empty: string }) {
  return (
    <div className="mt-3 space-y-1.5">
      {(options ?? []).map((o) => (
        <div key={o.id} className="relative rounded-nav border border-line bg-sidebar py-1.5 pr-4 pl-2.5 text-[12px] text-fg-2">
          <span className="line-clamp-2">{o.label || 'Opção sem texto'}</span>
          <Handle type="source" id={o.id} position={Position.Right} className="!-right-[19px] !size-3 !border-2 !border-page !bg-warning" />
        </div>
      ))}
      {!options?.length && <p className="text-[12px] text-muted italic">{empty}</p>}
    </div>
  )
}

/** Confirmação: pausa o fluxo, notifica o usuário e segue pela opção que ele escolher. */
export function ConfirmNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const app = useApp()
  const waiting = app.confirmations.find((c) => c.nodeId === id)
  return (
    <Box selected={selected} status={data.status} source={false}>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-tile bg-tile text-warning">
          <Hand size={17} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{data.label || 'Confirmação'}</p>
          <p className="truncate text-[12px] text-muted">Você decide · notificação</p>
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
        >
          Esperando você · responder
        </button>
      )}
      <OptionOutputs options={data.options} empty="Adicione as opções (botões) no painel" />
    </Box>
  )
}

export const nodeTypes = { trigger: TriggerNode, bot: BotNode, prompt: PromptNode, decision: DecisionNode, confirm: ConfirmNode }
