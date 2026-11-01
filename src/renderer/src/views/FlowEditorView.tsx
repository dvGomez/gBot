import { t as tr, localized, useLanguage } from '@/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type XYPosition
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Bot as BotIcon, Hand, LoaderCircle, PanelRight, Play, Square, Sparkles, Split, Trash2, X } from 'lucide-react'
import type { Flow, FlowEdge, FlowNode, FlowNodeData, FlowNodeType, FlowRun } from '@shared/types'
import { NodePanel } from '@/components/flow/NodePanel'
import { RunHistory } from '@/components/flow/RunHistory'
import { MemoryPanel } from '@/components/MemoryPanel'
import { nodeTypes, type CanvasNode } from '@/components/flow/nodes'
import { LimitsButton } from '@/components/LimitsButton'
import { BotPickerModal } from '@/components/flow/BotPickerModal'
import { FilesPanel, useTouchedFiles } from '@/components/FilesPanel'
import { ItemMenu } from '@/components/ItemMenu'
import { Button, Chip, Toggle } from '@/components/ui'
import { uid } from '@/lib/format'
import { useApp } from '@/state/app'

const toCanvas = (n: FlowNode): CanvasNode => ({ id: n.id, type: n.type, position: n.position, data: { ...n.data } })
const fromCanvas = (n: CanvasNode): FlowNode => {
  const { status: _status, ...data } = n.data
  return { id: n.id, type: n.type as FlowNodeType, position: n.position, data: data as FlowNodeData }
}
const toEdge = (e: FlowEdge): Edge => ({ ...e, animated: false })
const fromEdge = (e: Edge): FlowEdge => ({
  id: e.id,
  source: e.source,
  target: e.target,
  ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {})
})

type AddableType = 'bot' | 'prompt' | 'decision' | 'confirm'
const ADDABLE: { type: AddableType; label: string; icon: typeof BotIcon }[] = localized([{
  type: 'bot',
  label: 'Bot',
  icon: BotIcon
}, {
  type: 'prompt',
  label: 'Prompt',
  icon: Sparkles
}, {
  type: 'decision',
  label: tr('Decisão'),
  icon: Split
}, {
  type: 'confirm',
  label: tr('Confirmação'),
  icon: Hand
}])

/** De onde uma caixinha nova se liga: a bolinha de onde a linha saiu (saída à direita ou entrada à esquerda). */
interface ConnectFrom {
  nodeId: string
  handleId?: string
  handleType: 'source' | 'target'
}

/** Menu que aparece quando uma linha é solta no vazio. */
interface DropMenu {
  x: number
  y: number
  position: XYPosition
  from: ConnectFrom
}

/** Caixinhas copiadas com Cmd/Ctrl+C; valem entre fluxos enquanto o app estiver aberto. */
let clipboard: { nodes: CanvasNode[]; edges: Edge[] } | undefined

function Editor({ flow }: { flow: Flow }) {
  useLanguage()
  const app = useApp()
  const rf = useReactFlow()
  const [name, setName] = useState(flow.name)
  const [enabled, setEnabled] = useState(flow.enabled)
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(flow.nodes.map(toCanvas))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flow.edges.map(toEdge))
  const [selectedId, setSelectedId] = useState<string>()
  const [tab, setTab] = useState<'node' | 'runs' | 'files' | 'memory'>('node')
  // Arquivos que as execuções do fluxo mexeram (caixinhas e bots consultados nelas).
  const files = useTouchedFiles({ flowId: flow.id })
  // O painel lateral só abre ao clicar numa caixinha (ou pelo botão); clicar no canvas fecha.
  const [panelOpen, setPanelOpen] = useState(false)
  const [menu, setMenu] = useState<DropMenu>()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [runs, setRuns] = useState<FlowRun[]>([])
  const [starting, setStarting] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [stopping, setStopping] = useState(false)
  const [runError, setRunError] = useState<string>()

  // Histórico + atualizações ao vivo das execuções deste fluxo
  useEffect(() => {
    let updated = false
    void window.gbot.flows.runs(flow.id).then((history) => {
      if (!updated) setRuns(history)
      setLoadingRuns(false)
    }).catch((error) => {
      setRunError((error as Error).message)
      setLoadingRuns(false)
    })
    return window.gbot.flows.onRunUpdate((run) => {
      if (run.flowId !== flow.id) return
      updated = true
      setLoadingRuns(false)
      setRuns((rs) => [run, ...rs.filter((r) => r.id !== run.id)])
    })
  }, [flow.id])

  const live = runs[0]?.status === 'running' ? runs[0] : undefined
  const locked = loadingRuns || starting || stopping || !!live

  // Cor de status em cada caixinha durante a execução
  useEffect(() => {
    setNodes((ns) =>
      ns.map((n) => {
        const status = live?.steps.find((s) => s.nodeId === n.id)?.status ?? (live && n.type === 'trigger' ? 'done' : undefined)
        return n.data.status === status ? n : { ...n, data: { ...n.data, status } }
      })
    )
  }, [live, setNodes])

  // Salva sozinho (com um pequeno atraso) quando algo muda
  const first = useRef(true)
  useEffect(() => {
    if (locked) return
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => {
      void app.saveFlow({
        ...flow,
        name: name.trim() || tr('Fluxo sem nome'),
        enabled,
        nodes: nodes.map(fromCanvas),
        edges: edges.map(fromEdge),
        updatedAt: Date.now()
      }).catch((e) => setRunError((e as Error).message))
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, name, enabled, nodes.map((n) => JSON.stringify([n.position, fromCanvas(n).data])).join(), edges])

  const triggerId = useMemo(() => nodes.find((n) => n.type === 'trigger')?.id, [nodes])

  const onConnect = useCallback((c: Connection) => {
    if (!locked) setEdges((es) => addEdge({ ...c, id: uid() }, es))
  }, [locked, setEdges])
  const isValidConnection = useCallback(
    (c: Connection | Edge) => c.source !== c.target && c.target !== triggerId,
    [triggerId]
  )

  const openPanel = (t: typeof tab) => {
    setTab(t)
    setPanelOpen(true)
  }

  /** Primeira opção de uma decisão que ainda não leva a lugar nenhum (null: todas já ligadas). */
  const freeOption = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (node?.type !== 'decision') return undefined
    return node.data.options?.find((o) => !edges.some((e) => e.source === nodeId && e.sourceHandle === o.id))?.id ?? null
  }

  type AddOptions = { position?: XYPosition; from?: ConnectFrom }
  /** Caixinha de bot esperando a escolha do bot (com a posição e a ligação que ela vai ter). */
  const [pickingBot, setPickingBot] = useState<AddOptions>()

  /** Bot pede antes qual bot é; os outros tipos entram direto. */
  const requestNode = (type: AddableType, opts?: AddOptions) => {
    if (locked) return
    if (type === 'bot') setPickingBot(opts ?? {})
    else addNode(type, opts)
  }

  const addNode = (type: AddableType, opts?: AddOptions, botId?: string) => {
    if (locked) return
    const id = uid()
    const data: FlowNodeData =
      type === 'bot'
        ? { botId, message: '' }
        : type === 'prompt'
          ? { providerId: 'claude-code', model: app.preferredModel('claude-code'), message: '' }
          : type === 'confirm'
            ? {
                message: '',
                options: [
                  { id: uid(), label: tr('Aprovar') },
                  { id: uid(), label: tr('Recusar') }
                ]
              }
            : {
              providerId: 'claude-code',
              // Decisão é uma escolha curta: sem modelo escolhido antes, vai no Haiku (rápido e econômico).
              model: app.preferredModel('claude-code') ?? 'haiku',
              message: '',
              options: [
                { id: uid(), label: '' },
                { id: uid(), label: tr('Caso contrário') }
              ]
            }

    // Sem origem explícita: entra à direita da caixinha selecionada (ou do gatilho), já ligada a ela.
    let from = opts?.from
    if (!from) {
      const fromId = selectedId ?? triggerId
      const handleId = fromId ? freeOption(fromId) : undefined
      // Decisão com todas as opções já ligadas: a caixinha entra solta.
      if (fromId && handleId !== null) from = { nodeId: fromId, handleId, handleType: 'source' }
    }
    const fromNode = nodes.find((n) => n.id === (from?.nodeId ?? selectedId ?? triggerId))
    const siblings = fromNode ? edges.filter((e) => e.source === fromNode.id).length : 0
    const position =
      opts?.position ??
      (fromNode
        ? { x: fromNode.position.x + 320, y: fromNode.position.y + siblings * 170 }
        : rf.screenToFlowPosition({ x: window.innerWidth / 2 - 260, y: window.innerHeight / 2 }))

    const node: CanvasNode = { id, type, position, data: data as CanvasNode['data'], selected: true }
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node])
    if (from) {
      // Linha puxada da entrada (esquerda) de uma caixinha: a nova vem antes dela.
      const edge: Edge =
        from.handleType === 'target'
          ? { id: uid(), source: id, target: from.nodeId, ...(data.options ? { sourceHandle: data.options[0].id } : {}) }
          : { id: uid(), source: from.nodeId, target: id, ...(from.handleId ? { sourceHandle: from.handleId } : {}) }
      setEdges((es) => [...es, edge])
    }
    setSelectedId(id)
    openPanel('node')
    // Mostra a caixinha nova se ela cair fora da tela (ou atrás do painel, que acabou de abrir).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!opts?.position) return void rf.fitView({ maxZoom: 1, padding: 0.3, duration: 250 })
        const box = canvasRef.current?.getBoundingClientRect()
        const center = { x: position.x + 125, y: position.y + 60 }
        const p = rf.flowToScreenPosition(center)
        const margin = 150 * rf.getZoom()
        if (box && (p.x - margin < box.left || p.x + margin > box.right || p.y - margin < box.top || p.y + margin > box.bottom))
          void rf.setCenter(center.x, center.y, { zoom: rf.getZoom(), duration: 250 })
      })
    )
  }

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (locked || state.isValid || state.toHandle || !state.fromHandle || !state.fromNode) return
      // Linha solta no vazio: abre o menu para criar uma caixinha já ligada.
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      const box = canvasRef.current?.getBoundingClientRect()
      if (!box) return
      const flowPos = rf.screenToFlowPosition({ x: point.clientX, y: point.clientY })
      const fromTarget = state.fromHandle.type === 'target'
      setMenu({
        x: Math.min(point.clientX - box.left, box.width - 180),
        y: Math.min(point.clientY - box.top, box.height - 150),
        // A caixinha nova fica com a bolinha de ligação perto de onde a linha foi solta.
        position: { x: fromTarget ? flowPos.x - 250 : flowPos.x, y: flowPos.y - 30 },
        from: { nodeId: state.fromNode.id, handleId: state.fromHandle.id ?? undefined, handleType: state.fromHandle.type }
      })
    },
    [rf, locked]
  )

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(undefined)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  // Copiar e colar caixinhas: as cópias ganham ids novos (inclusive as opções das decisões) e as ligações
  // entre as caixinhas copiadas vêm junto. Cada colagem seguida desloca um pouco mais.
  const pasteCount = useRef(0)
  const paste = () => {
    if (locked || !clipboard) return
    const shift = 40 * ++pasteCount.current
    const ids = new Map<string, string>()
    const handles = new Map<string, string>()
    const fresh: CanvasNode[] = clipboard.nodes.map((n) => {
      const id = uid()
      ids.set(n.id, id)
      const { status: _status, ...data } = n.data
      const options = data.options?.map((o) => {
        const optionId = uid()
        handles.set(o.id, optionId)
        return { ...o, id: optionId }
      })
      return {
        ...n,
        id,
        position: { x: n.position.x + shift, y: n.position.y + shift },
        data: { ...data, ...(options ? { options } : {}) } as CanvasNode['data'],
        selected: true
      }
    })
    const freshEdges: Edge[] = clipboard.edges.map((e) => ({
      ...e,
      id: uid(),
      source: ids.get(e.source)!,
      target: ids.get(e.target)!,
      sourceHandle: e.sourceHandle ? (handles.get(e.sourceHandle) ?? e.sourceHandle) : e.sourceHandle,
      selected: false
    }))
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...fresh])
    setEdges((es) => [...es, ...freshEdges])
    if (fresh.length === 1) {
      setSelectedId(fresh[0].id)
      openPanel('node')
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      // Em campos de texto (ou com texto selecionado) o copiar/colar normal continua valendo.
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      if (window.getSelection()?.toString()) return
      const key = e.key.toLowerCase()
      if (key === 'c') {
        const picked = nodes.filter((n) => n.type !== 'trigger' && (n.selected || n.id === selectedId))
        if (!picked.length) return
        const picks = new Set(picked.map((n) => n.id))
        clipboard = { nodes: picked, edges: edges.filter((ed) => picks.has(ed.source) && picks.has(ed.target)) }
        pasteCount.current = 0
        e.preventDefault()
      } else if (key === 'v' && clipboard) {
        e.preventDefault()
        paste()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const selected = nodes.find((n) => n.id === selectedId)
  const patchSelected = (patch: Partial<FlowNodeData>) => {
    if (locked) return
    setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)))
    // Opção removida de uma decisão: a linha que saía dela vai junto.
    if (patch.options) {
      const ids = new Set(patch.options.map((o) => o.id))
      setEdges((es) => es.filter((e) => e.source !== selectedId || !e.sourceHandle || ids.has(e.sourceHandle)))
    }
  }
  const deleteSelected = () => {
    if (locked || !selected || selected.type === 'trigger') return
    setNodes((ns) => ns.filter((n) => n.id !== selected.id))
    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id))
    setSelectedId(undefined)
    setPanelOpen(false)
  }

  const runNow = async () => {
    if (locked) return
    setStarting(true)
    setRunError(undefined)
    try {
      // Garante que a versão atual (mesmo antes do salvamento automático) é a que roda.
      await app.saveFlow({
        ...flow,
        name: name.trim() || tr('Fluxo sem nome'),
        enabled,
        nodes: nodes.map(fromCanvas),
        edges: edges.map(fromEdge),
        updatedAt: Date.now()
      })
      await window.gbot.flows.run(flow.id)
      openPanel('runs')
    } catch (e) {
      setRunError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setStarting(false)
    }
  }

  const stopNow = async () => {
    setStopping(true)
    setRunError(undefined)
    try {
      await window.gbot.flows.stop(flow.id)
    } catch (e) {
      setRunError((e as Error).message)
    } finally {
      setStopping(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-w-0 items-center gap-3 px-6 pb-4">
        <button
          onClick={() => (flow.projectId && app.getProject(flow.projectId) ? app.openProject(flow.projectId) : app.setView('home'))}
          className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg"
          aria-label={tr('Voltar')}
        >
          <ArrowLeft size={16} />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={tr('Nome do fluxo')}
          disabled={locked}
          className="selectable min-w-0 flex-1 rounded-nav border border-transparent bg-transparent px-2 py-1 text-[20px] font-medium tracking-[-0.02em] outline-none hover:border-line focus:border-muted/60"
        />
        <div className="flex items-center gap-2 text-[13px] text-fg-2">
          <fieldset disabled={locked}><Toggle label={tr('Fluxo ativo')} checked={enabled} onChange={setEnabled} /></fieldset>
          {enabled ? tr('Ativo') : tr('Desligado')}
        </div>
        <LimitsButton />
        <Button variant="primary" onClick={() => void runNow()} disabled={locked}>
          {starting || live ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
          {live ? tr('Rodando…') : tr('Rodar agora')}
        </Button>
        {live && (
          <Button onClick={() => void stopNow()} disabled={stopping} className="border-danger text-danger">
            <Square size={14} fill="currentColor" /> {stopping ? tr('Parando…') : tr('Parar tudo')}
          </Button>
        )}
        <button
          onClick={() => setPanelOpen((o) => !o)}
          className={`rounded-full p-2 hover:bg-hover hover:text-fg ${panelOpen ? 'text-fg' : 'text-muted'}`}
          aria-label={panelOpen ? tr('Fechar painel') : tr('Abrir painel')}
          title={panelOpen ? tr('Fechar painel') : tr('Abrir painel')}
        >
          <PanelRight size={16} />
        </button>
        {!locked && (
          <ItemMenu
            actions={[
              {
                label: tr('Excluir fluxo'),
                icon: Trash2,
                danger: true,
                confirm: tr('Excluir este fluxo e o histórico dele? Não dá para desfazer.'),
                onSelect: () => void app.removeFlow(flow.id)
              }
            ]}
          />
        )}
      </div>
      {runError && <p className="px-6 pb-2 text-[13px] text-danger">{runError}</p>}
      {live && <p className="px-6 pb-2 text-[13px] text-warning">{tr('Fluxo em execução · edição bloqueada até terminar ou parar.')}</p>}

      <div
        className={`grid min-h-0 flex-1 border-t border-line ${
          panelOpen ? 'grid-cols-[minmax(0,1fr)_minmax(300px,380px)]' : 'grid-cols-1'
        }`}
      >
        <div ref={canvasRef} className="relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(changes) => onNodesChange(locked ? changes.filter((c) => c.type === 'select' || c.type === 'dimensions') : changes)}
            onEdgesChange={(changes) => onEdgesChange(locked ? changes.filter((c) => c.type === 'select') : changes)}
            nodesDraggable={!locked}
            nodesConnectable={!locked}
            edgesReconnectable={!locked}
            onConnect={onConnect}
            onConnectStart={() => setMenu(undefined)}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            onNodeClick={(_, n) => {
              // Tira o foco do painel: senão Cmd+C/Cmd+V continuariam indo para o campo de texto.
              ;(document.activeElement as HTMLElement | null)?.blur()
              setSelectedId(n.id)
              setMenu(undefined)
              openPanel('node')
            }}
            onPaneClick={() => {
              ;(document.activeElement as HTMLElement | null)?.blur()
              setSelectedId(undefined)
              setMenu(undefined)
              setPanelOpen(false)
            }}
            // Se já havia texto selecionado na tela, limpa ao começar a arrastar.
            onNodeDragStart={() => window.getSelection()?.removeAllRanges()}
            onMoveStart={() => {
              window.getSelection()?.removeAllRanges()
              setMenu(undefined)
            }}
            deleteKeyCode={locked ? null : ['Backspace', 'Delete']}
            onNodesDelete={(deleted) => {
              // O gatilho não pode ser removido.
              const trig = deleted.find((n) => n.type === 'trigger')
              if (trig) setNodes((ns) => (ns.some((n) => n.id === trig.id) ? ns : [...ns, trig]))
            }}
            colorMode="dark"
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
            defaultEdgeOptions={{ style: { strokeWidth: 2 } }}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'var(--page)' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="var(--line)" />
            <Controls showInteractive={false} />
          </ReactFlow>
          <div className="absolute top-4 left-4 flex gap-2">
            {ADDABLE.map(({ type, label, icon: Icon }) => (
              <Button key={type} onClick={() => requestNode(type)} disabled={locked} className="bg-sidebar">
                <Icon size={14} /> {label}
              </Button>
            ))}
          </div>
          {menu && !locked && (
            <div
              role="menu"
              style={{ left: menu.x, top: menu.y }}
              className="absolute z-10 w-[170px] rounded-tile border border-line bg-sidebar p-1 shadow-lg"
            >
              <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-muted">{tr('Criar caixinha')}</p>
              {ADDABLE.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  role="menuitem"
                  onClick={() => {
                    requestNode(type, { position: menu.position, from: menu.from })
                    setMenu(undefined)
                  }}
                  className="flex w-full items-center gap-2 rounded-nav px-2.5 py-2 text-left text-[13px] hover:bg-hover"
                >
                  <Icon size={14} className="text-muted" /> {label}
                </button>
              ))}
            </div>
          )}
          <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-[12px] text-muted">
            {locked ? tr('Execução em andamento · navegue e acompanhe sem editar') : tr('Arraste de uma bolinha até outra caixinha para ligar, ou solte no vazio para criar · ⌘C ⌘V duplica · Backspace remove')}
          </p>
        </div>

        {panelOpen && (
          <aside className="flex min-h-0 flex-col border-l border-line bg-sidebar">
            <div className="flex items-center gap-2 px-5 pt-4 pb-3">
              <Chip active={tab === 'node'} onClick={() => setTab('node')}>{tr('Caixinha')}</Chip>
              <Chip active={tab === 'runs'} onClick={() => setTab('runs')}>{tr('Execuções')}{runs.length ? ` (${runs.length})` : ''}
              </Chip>
              <Chip active={tab === 'files'} onClick={() => setTab('files')}>{tr('Arquivos')}{files.length ? ` (${files.length})` : ''}
              </Chip>
              <Chip active={tab === 'memory'} onClick={() => setTab('memory')}>{tr('Memória')}</Chip>
              <button
                onClick={() => setPanelOpen(false)}
                className="ml-auto rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg"
                aria-label={tr('Fechar painel')}
              >
                <X size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              {tab === 'memory' ? (
                <>
                  <fieldset disabled={locked}><MemoryPanel owner={{ kind: 'flow', id: flow.id }} compact /></fieldset>
                  <p className="mt-4 text-[12px] text-muted">{tr('Caixinhas de prompt usam e preenchem esta memória. Caixinhas de bot usam a memória do próprio bot.')}</p>
                </>
              ) : tab === 'runs' ? (
                <RunHistory runs={runs} />
              ) : tab === 'files' ? (
                <FilesPanel files={files} empty={tr('Nenhum arquivo mexido pelas execuções deste fluxo ainda.')} />
              ) : selected ? (
                <fieldset disabled={locked} className="min-w-0">
                  <NodePanel
                    key={selected.id}
                    type={selected.type as FlowNodeType}
                    data={selected.data}
                    onChange={patchSelected}
                    onDelete={selected.type === 'trigger' ? undefined : deleteSelected}
                  />
                </fieldset>
              ) : (
                <p className="text-[13px] text-muted">{tr('Clique numa caixinha para configurar, ou adicione um Bot, Prompt, Decisão ou Confirmação.')}</p>
              )}
            </div>
          </aside>
        )}
      </div>
      {pickingBot && !locked && (
        <BotPickerModal
          projectId={flow.projectId}
          onClose={() => setPickingBot(undefined)}
          onPick={(bot) => {
            addNode('bot', pickingBot, bot.id)
            setPickingBot(undefined)
          }}
        />
      )}
    </div>
  )
}

export function FlowEditorView() {
  useLanguage()
  const app = useApp()
  const flow = app.selectedFlow
  if (!flow) return null
  return (
    <ReactFlowProvider>
      <Editor key={flow.id} flow={flow} />
    </ReactFlowProvider>
  )
}
