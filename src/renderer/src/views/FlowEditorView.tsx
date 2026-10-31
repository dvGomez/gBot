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
  type Edge
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Bot as BotIcon, LoaderCircle, Play, Sparkles, Trash2 } from 'lucide-react'
import type { Flow, FlowNode, FlowNodeData, FlowNodeType, FlowRun } from '@shared/types'
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
const toEdge = (e: { id: string; source: string; target: string }): Edge => ({ id: e.id, source: e.source, target: e.target, animated: false })

function Editor({ flow }: { flow: Flow }) {
  const app = useApp()
  const rf = useReactFlow()
  const [name, setName] = useState(flow.name)
  const [enabled, setEnabled] = useState(flow.enabled)
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(flow.nodes.map(toCanvas))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flow.edges.map(toEdge))
  const [selectedId, setSelectedId] = useState<string | undefined>(flow.nodes.find((n) => n.type === 'trigger')?.id)
  const [tab, setTab] = useState<'node' | 'runs' | 'memory'>('node')
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
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
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

  const addNode = (type: 'bot' | 'prompt') => {
    const id = uid()
    const data: FlowNodeData = type === 'bot' ? { botId: app.bots[0]?.id, message: '' } : { providerId: 'claude-code', message: '' }
    // Entra à direita da caixinha selecionada (ou do gatilho), já ligada a ela; irmãs ficam uma abaixo da outra.
    const fromId = selectedId ?? triggerId
    const from = nodes.find((n) => n.id === fromId)
    const siblings = edges.filter((e) => e.source === fromId).length
    const position = from
      ? { x: from.position.x + 320, y: from.position.y + siblings * 170 }
      : rf.screenToFlowPosition({ x: window.innerWidth / 2 - 260, y: window.innerHeight / 2 })
    const node: CanvasNode = { id, type, position, data: data as CanvasNode['data'], selected: true }
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node])
    if (fromId) setEdges((es) => [...es, { id: uid(), source: fromId, target: id }])
    setSelectedId(id)
    setTab('node')
    // Mostra a caixinha nova se ela cair fora da tela.
    requestAnimationFrame(() => void rf.fitView({ maxZoom: 1, padding: 0.3, duration: 250 }))
  }

  const selected = nodes.find((n) => n.id === selectedId)
  const patchSelected = (patch: Partial<FlowNodeData>) =>
    setNodes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)))
  const deleteSelected = () => {
    if (!selected || selected.type === 'trigger') return
    setNodes((ns) => ns.filter((n) => n.id !== selected.id))
    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id))
    setSelectedId(triggerId)
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
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
        updatedAt: Date.now()
      })
      await window.gbot.flows.run(flow.id)
      setTab('runs')
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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(300px,380px)] border-t border-line">
        <div className="relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={(_, n) => {
              setSelectedId(n.id)
              setTab('node')
            }}
            onPaneClick={() => setSelectedId(undefined)}
            // Se já havia texto selecionado na tela, limpa ao começar a arrastar.
            onNodeDragStart={() => window.getSelection()?.removeAllRanges()}
            onMoveStart={() => window.getSelection()?.removeAllRanges()}
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
            <Button onClick={() => addNode('bot')} className="bg-sidebar">
              <BotIcon size={14} /> Bot
            </Button>
            <Button onClick={() => addNode('prompt')} className="bg-sidebar">
              <Sparkles size={14} /> Prompt
            </Button>
          </div>
          <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-[12px] text-muted">
            Arraste do ponto à direita de uma caixinha até outra para ligar · Backspace remove
          </p>
        </div>

        <aside className="flex min-h-0 flex-col border-l border-line bg-sidebar">
          <div className="flex gap-2 px-5 pt-4 pb-3">
            <Chip active={tab === 'node'} onClick={() => setTab('node')}>
              Caixinha
            </Chip>
            <Chip active={tab === 'runs'} onClick={() => setTab('runs')}>
              Execuções{runs.length ? ` (${runs.length})` : ''}
            </Chip>
            <Chip active={tab === 'memory'} onClick={() => setTab('memory')}>
              Memória
            </Chip>
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
              <p className="text-[13px] text-muted">Clique numa caixinha para configurar, ou adicione um Bot ou Prompt.</p>
            )}
          </div>
        </aside>
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
