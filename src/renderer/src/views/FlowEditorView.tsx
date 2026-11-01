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
import { ArrowLeft, Bot as BotIcon, LoaderCircle, PanelRight, Play, Sparkles, Split, Trash2, X } from 'lucide-react'
import type { Flow, FlowEdge, FlowNode, FlowNodeData, FlowNodeType, FlowRun } from '@shared/types'
import { NodePanel } from '@/components/flow/NodePanel'
import { RunHistory } from '@/components/flow/RunHistory'
import { MemoryPanel } from '@/components/MemoryPanel'
import { nodeTypes, type CanvasNode } from '@/components/flow/nodes'
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

type AddableType = 'bot' | 'prompt' | 'decision'
const ADDABLE: { type: AddableType; label: string; icon: typeof BotIcon }[] = [
  { type: 'bot', label: 'Bot', icon: BotIcon },
  { type: 'prompt', label: 'Prompt', icon: Sparkles },
  { type: 'decision', label: 'Decisão', icon: Split }
]

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
  const app = useApp()
  const rf = useReactFlow()
  const [name, setName] = useState(flow.name)
  const [enabled, setEnabled] = useState(flow.enabled)
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(flow.nodes.map(toCanvas))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flow.edges.map(toEdge))
  const [selectedId, setSelectedId] = useState<string>()
  const [tab, setTab] = useState<'node' | 'runs' | 'memory'>('node')
  // O painel lateral só abre ao clicar numa caixinha (ou pelo botão); clicar no canvas fecha.
  const [panelOpen, setPanelOpen] = useState(false)
  const [menu, setMenu] = useState<DropMenu>()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [runs, setRuns] = useState<FlowRun[]>([])
  const [starting, setStarting] = useState(false)
  const [runError, setRunError] = useState<string>()

  // Histórico + atualizações ao vivo das execuções deste fluxo
  useEffect(() => {
    void window.gbot.flows.runs(flow.id).then(setRuns)
    return window.gbot.flows.onRunUpdate((run) => {
      if (run.flowId !== flow.id) return
      setRuns((rs) => [run, ...rs.filter((r) => r.id !== run.id)])
    })
  }, [flow.id])

  const live = runs[0]?.status === 'running' ? runs[0] : undefined

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
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => {
      void app.saveFlow({
        ...flow,
        name: name.trim() || 'Fluxo sem nome',
        enabled,
        nodes: nodes.map(fromCanvas),
        edges: edges.map(fromEdge),
        updatedAt: Date.now()
      })
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled, nodes.map((n) => JSON.stringify([n.position, fromCanvas(n).data])).join(), edges])

  const triggerId = useMemo(() => nodes.find((n) => n.type === 'trigger')?.id, [nodes])

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, id: uid() }, es)), [setEdges])
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

  const addNode = (type: AddableType, opts?: { position?: XYPosition; from?: ConnectFrom }) => {
    const id = uid()
    const data: FlowNodeData =
      type === 'bot'
        ? { botId: app.bots[0]?.id, message: '' }
        : type === 'prompt'
          ? { providerId: 'claude-code', message: '' }
          : {
              providerId: 'claude-code',
              model: 'haiku',
              message: '',
              options: [
                { id: uid(), label: '' },
                { id: uid(), label: 'Caso contrário' }
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
      if (state.isValid || state.toHandle || !state.fromHandle || !state.fromNode) return
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
    [rf]
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
    if (!clipboard) return
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
    setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)))
    // Opção removida de uma decisão: a linha que saía dela vai junto.
    if (patch.options) {
      const ids = new Set(patch.options.map((o) => o.id))
      setEdges((es) => es.filter((e) => e.source !== selectedId || !e.sourceHandle || ids.has(e.sourceHandle)))
    }
  }
  const deleteSelected = () => {
    if (!selected || selected.type === 'trigger') return
    setNodes((ns) => ns.filter((n) => n.id !== selected.id))
    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id))
    setSelectedId(undefined)
    setPanelOpen(false)
  }

  const runNow = async () => {
    setStarting(true)
    setRunError(undefined)
    try {
      // Garante que a versão atual (mesmo antes do salvamento automático) é a que roda.
      await app.saveFlow({
        ...flow,
        name: name.trim() || 'Fluxo sem nome',
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-w-0 items-center gap-3 px-6 pb-4">
        <button
          onClick={() => (flow.projectId && app.getProject(flow.projectId) ? app.openProject(flow.projectId) : app.setView('home'))}
          className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg"
          aria-label="Voltar"
        >
          <ArrowLeft size={16} />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nome do fluxo"
          className="selectable min-w-0 flex-1 rounded-nav border border-transparent bg-transparent px-2 py-1 text-[20px] font-medium tracking-[-0.02em] outline-none hover:border-line focus:border-muted/60"
        />
        <label className="flex items-center gap-2 text-[13px] text-fg-2">
          <Toggle label="Fluxo ativo" checked={enabled} onChange={setEnabled} />
          {enabled ? 'Ativo' : 'Desligado'}
        </label>
        <Button variant="primary" onClick={() => void runNow()} disabled={starting || !!live}>
          {starting || live ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
          {live ? 'Rodando…' : 'Rodar agora'}
        </Button>
        <button
          onClick={() => setPanelOpen((o) => !o)}
          className={`rounded-full p-2 hover:bg-hover hover:text-fg ${panelOpen ? 'text-fg' : 'text-muted'}`}
          aria-label={panelOpen ? 'Fechar painel' : 'Abrir painel'}
          title={panelOpen ? 'Fechar painel' : 'Abrir painel'}
        >
          <PanelRight size={16} />
        </button>
        <ItemMenu
          actions={[
            {
              label: 'Excluir fluxo',
              icon: Trash2,
              danger: true,
              confirm: 'Excluir este fluxo e o histórico dele? Não dá para desfazer.',
              onSelect: () => void app.removeFlow(flow.id)
            }
          ]}
        />
      </div>
      {runError && <p className="px-6 pb-2 text-[13px] text-danger">{runError}</p>}

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
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
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
            deleteKeyCode={['Backspace', 'Delete']}
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
              <Button key={type} onClick={() => addNode(type)} className="bg-sidebar">
                <Icon size={14} /> {label}
              </Button>
            ))}
          </div>
          {menu && (
            <div
              role="menu"
              style={{ left: menu.x, top: menu.y }}
              className="absolute z-10 w-[170px] rounded-tile border border-line bg-sidebar p-1 shadow-lg"
            >
              <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-muted">Criar caixinha</p>
              {ADDABLE.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  role="menuitem"
                  onClick={() => {
                    addNode(type, { position: menu.position, from: menu.from })
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
            Arraste de uma bolinha até outra caixinha para ligar, ou solte no vazio para criar · ⌘C ⌘V duplica · Backspace remove
          </p>
        </div>

        {panelOpen && (
          <aside className="flex min-h-0 flex-col border-l border-line bg-sidebar">
            <div className="flex items-center gap-2 px-5 pt-4 pb-3">
              <Chip active={tab === 'node'} onClick={() => setTab('node')}>
                Caixinha
              </Chip>
              <Chip active={tab === 'runs'} onClick={() => setTab('runs')}>
                Execuções{runs.length ? ` (${runs.length})` : ''}
              </Chip>
              <Chip active={tab === 'memory'} onClick={() => setTab('memory')}>
                Memória
              </Chip>
              <button
                onClick={() => setPanelOpen(false)}
                className="ml-auto rounded-full p-1.5 text-muted hover:bg-hover hover:text-fg"
                aria-label="Fechar painel"
              >
                <X size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              {tab === 'memory' ? (
                <>
                  <MemoryPanel owner={{ kind: 'flow', id: flow.id }} compact />
                  <p className="mt-4 text-[12px] text-muted">
                    Caixinhas de prompt usam e preenchem esta memória. Caixinhas de bot usam a memória do próprio bot.
                  </p>
                </>
              ) : tab === 'runs' ? (
                <RunHistory runs={runs} />
              ) : selected ? (
                <NodePanel
                  key={selected.id}
                  type={selected.type as FlowNodeType}
                  data={selected.data}
                  onChange={patchSelected}
                  onDelete={selected.type === 'trigger' ? undefined : deleteSelected}
                />
              ) : (
                <p className="text-[13px] text-muted">Clique numa caixinha para configurar, ou adicione um Bot, Prompt ou Decisão.</p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

export function FlowEditorView() {
  const app = useApp()
  const flow = app.selectedFlow
  if (!flow) return null
  return (
    <ReactFlowProvider>
      <Editor key={flow.id} flow={flow} />
    </ReactFlowProvider>
  )
}
