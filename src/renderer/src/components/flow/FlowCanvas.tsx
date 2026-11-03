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
import { Clock, Hand, ListTodo, PanelRight, Square, Split, X } from 'lucide-react'
import type { Flow, FlowEdge, FlowNode, FlowNodeData, FlowNodeType, FlowRun } from '@shared/types'
import { NodePanel, TriggerControls } from '@/components/flow/NodePanel'
import { RunHistory } from '@/components/flow/RunHistory'
import { MemoryPanel } from '@/components/MemoryPanel'
import { CanvasActions, nodeTypes, type CanvasNode } from '@/components/flow/nodes'
import { FilesPanel, useTouchedFiles } from '@/components/FilesPanel'
import { Button, Chip } from '@/components/ui'
import { uid } from '@/lib/format'
import { useApp } from '@/state/app'

const toCanvas = (n: FlowNode): CanvasNode => ({ id: n.id, type: n.type, position: n.position, data: { ...n.data } })
const fromCanvas = (n: CanvasNode): FlowNode => {
  const { status: _status, ...data } = n.data
  return { id: n.id, type: n.type as FlowNodeType, position: n.position, data: data as FlowNodeData }
}
/** Mensagem de erro do processo principal sem o prefixo do Electron. */
const cleanError = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

const toEdge = (e: FlowEdge): Edge => ({ ...e, animated: false })
const fromEdge = (e: Edge): FlowEdge => ({
  id: e.id,
  source: e.source,
  target: e.target,
  ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {})
})

type AddableType = 'trigger' | 'task' | 'decision' | 'confirm'
const ADDABLE: { type: AddableType; label: string; icon: typeof ListTodo }[] = localized([{
  type: 'trigger',
  label: tr('Gatilho'),
  icon: Clock
}, {
  type: 'task',
  label: tr('Tarefa'),
  icon: ListTodo
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

/** Caixinhas copiadas com Cmd/Ctrl+C; valem entre os fluxos dos bots enquanto o app estiver aberto. */
let clipboard: { nodes: CanvasNode[]; edges: Edge[] } | undefined

function Editor({ flow }: { flow: Flow }) {
  useLanguage()
  const app = useApp()
  const rf = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(flow.nodes.map(toCanvas))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flow.edges.map(toEdge))
  const [selectedId, setSelectedId] = useState<string>()
  const [tab, setTab] = useState<'node' | 'runs' | 'files' | 'memory'>('node')
  // Arquivos que as execuções das rotinas mexeram (caixinhas e bots consultados nelas).
  const files = useTouchedFiles({ flowId: flow.id })
  // O painel lateral só abre ao clicar numa caixinha (ou pelo botão); clicar no canvas fecha.
  const [panelOpen, setPanelOpen] = useState(false)
  const [menu, setMenu] = useState<DropMenu>()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [runs, setRuns] = useState<FlowRun[]>([])
  /** Gatilho sendo iniciado agora (salva e manda rodar). */
  const [starting, setStarting] = useState<string>()
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [stopping, setStopping] = useState(false)
  const [runError, setRunError] = useState<string>()

  // Histórico + atualizações ao vivo das execuções das rotinas do fluxo
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

  // Cada gatilho roda por conta própria: pode haver mais de uma execução ao vivo.
  const live = useMemo(() => runs.filter((r) => r.status === 'running'), [runs])
  const liveTriggers = useMemo(() => new Set(live.map((r) => r.triggerId)), [live])
  const bot = app.getBot(flow.botId)
  const locked = loadingRuns || !!starting || stopping || live.length > 0

  // Cor de status em cada caixinha durante as execuções
  useEffect(() => {
    setNodes((ns) =>
      ns.map((n) => {
        const status =
          live.map((r) => r.steps.find((s) => s.nodeId === n.id)?.status).find(Boolean) ??
          (n.type === 'trigger' && liveTriggers.has(n.id) ? 'running' : undefined)
        return n.data.status === status ? n : { ...n, data: { ...n.data, status } }
      })
    )
  }, [live, liveTriggers, setNodes])

  // Salva sozinho (com um pequeno atraso) quando algo muda
  const first = useRef(true)
  /** Data da última versão que o canvas gravou ou carregou. */
  const savedAt = useRef(flow.updatedAt)
  useEffect(() => {
    if (locked) return
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => {
      void app.saveFlow(current()).catch((e) => setRunError(cleanError(e)))
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, nodes.map((n) => JSON.stringify([n.position, fromCanvas(n).data])).join(), edges])

  const current = (): Flow => {
    const updatedAt = Date.now()
    savedAt.current = updatedAt
    return { ...flow, nodes: nodes.map(fromCanvas), edges: edges.map(fromEdge), updatedAt }
  }

  // Fluxo mudado por fora (ex.: plano aplicado pelo chat do bot): o canvas recarrega. As gravações do próprio canvas
  // não contam (são reconhecidas pela data que ele mesmo gravou).
  useEffect(() => {
    if (flow.updatedAt === savedAt.current) return
    savedAt.current = flow.updatedAt
    setNodes(flow.nodes.map(toCanvas))
    setEdges(flow.edges.map(toEdge))
    requestAnimationFrame(() => void rf.fitView({ maxZoom: 1, padding: 0.3, duration: 250 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.updatedAt])
  const triggers = useMemo(() => nodes.filter((n) => n.type === 'trigger'), [nodes])
  /** Gatilho de cima: de onde saem as caixinhas novas quando nada está selecionado. */
  const triggerId = useMemo(() => [...triggers].sort((a, b) => a.position.y - b.position.y)[0]?.id, [triggers])

  const onConnect = useCallback((c: Connection) => {
    if (!locked) setEdges((es) => addEdge({ ...c, id: uid() }, es))
  }, [locked, setEdges])
  const isValidConnection = useCallback(
    (c: Connection | Edge) => c.source !== c.target && !triggers.some((t) => t.id === c.target),
    [triggers]
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
  const requestNode = (type: AddableType, opts?: AddOptions) => addNode(type, opts)

  const addNode = (type: AddableType, opts?: AddOptions) => {
    if (locked) return
    const id = uid()
    const data: FlowNodeData =
      type === 'trigger'
        ? { enabled: false, schedule: { mode: 'times', days: [1, 2, 3, 4, 5], times: ['09:00'] } }
        : type === 'task'
        ? { message: '' }
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

    // Gatilho novo é uma rotina nova: entra numa faixa própria, abaixo de tudo, sem ligação.
    if (type === 'trigger') {
      const position = opts?.position ?? { x: 0, y: Math.max(0, ...nodes.map((n) => n.position.y)) + 360 }
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type, position, data: data as CanvasNode['data'], selected: true }])
      setSelectedId(id)
      openPanel('node')
      requestAnimationFrame(() => requestAnimationFrame(() => void rf.fitView({ maxZoom: 1, padding: 0.3, duration: 250 })))
      return
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
  // O último gatilho não sai: todo fluxo tem pelo menos uma rotina.
  const canDelete = (n?: CanvasNode) => !!n && (n.type !== 'trigger' || triggers.length > 1)
  const deleteSelected = () => {
    if (locked || !selected || !canDelete(selected)) return
    setNodes((ns) => ns.filter((n) => n.id !== selected.id))
    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id))
    setSelectedId(undefined)
    setPanelOpen(false)
  }

  const runNow = async (triggerId: string) => {
    if (liveTriggers.has(triggerId) || starting) return
    setStarting(triggerId)
    setRunError(undefined)
    try {
      // Garante que a versão atual (mesmo antes do salvamento automático) é a que roda. Com outra rotina rodando, o fluxo
      // não muda: roda o que já está salvo.
      if (!live.length) await app.saveFlow(current())
      await window.gbot.flows.run(flow.id, triggerId)
      openPanel('runs')
    } catch (e) {
      setRunError(cleanError(e))
    } finally {
      setStarting(undefined)
    }
  }

  const setTriggerEnabled = async (triggerId: string, enabled: boolean) => {
    setRunError(undefined)
    setNodes((ns) => ns.map((n) => (n.id === triggerId ? { ...n, data: { ...n.data, enabled } } : n)))
    try {
      // Vale na hora, mesmo com outra rotina rodando (não passa pelo salvamento do canvas).
      await app.setTriggerEnabled(flow.id, triggerId, enabled)
    } catch (e) {
      setRunError(cleanError(e))
    }
  }

  const stopNow = async (triggerId?: string) => {
    setStopping(true)
    setRunError(undefined)
    try {
      await window.gbot.flows.stop(flow.id, triggerId)
    } catch (e) {
      setRunError((e as Error).message)
    } finally {
      setStopping(false)
    }
  }

  // Ações dos gatilhos (rodar, parar, ligar), usadas pelas caixinhas de gatilho no canvas e pelo painel.
  const actions = { run: runNow, stop: stopNow, setEnabled: setTriggerEnabled, live: liveTriggers, starting, stopping }

  return (
    <CanvasActions.Provider value={actions}>
    <div className="flex h-full flex-col">
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
            onBeforeDelete={async ({ nodes: gone, edges: lines }) => {
              // O último gatilho não sai: todo fluxo tem pelo menos uma rotina.
              const left = triggers.filter((t) => !gone.some((n) => n.id === t.id))
              return left.length ? { nodes: gone, edges: lines } : { nodes: gone.filter((n) => n.type !== 'trigger'), edges: lines }
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
          <div className="absolute top-4 right-4 left-4 flex flex-wrap items-start gap-2">
            {ADDABLE.map(({ type, label, icon: Icon }) => (
              <Button key={type} onClick={() => requestNode(type)} disabled={locked} className="bg-sidebar">
                <Icon size={14} /> {label}
              </Button>
            ))}
            <span className="ml-auto flex gap-2">
              {live.length > 1 && (
                <Button onClick={() => void stopNow()} disabled={stopping} className="border-danger bg-sidebar text-danger">
                  <Square size={14} fill="currentColor" /> {stopping ? tr('Parando…') : tr('Parar tudo')}
                </Button>
              )}
              <Button
                onClick={() => (panelOpen ? setPanelOpen(false) : openPanel(selected ? 'node' : 'runs'))}
                aria-label={panelOpen ? tr('Fechar painel') : tr('Abrir painel')}
                title={panelOpen ? tr('Fechar painel') : tr('Abrir painel')}
                className="bg-sidebar"
              >
                <PanelRight size={14} />
              </Button>
            </span>
            {runError && <p className="w-full text-[13px] text-danger">{runError}</p>}
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
          <aside className="flex min-h-0 min-w-0 flex-col border-l border-line bg-sidebar">
            {/* Abas quebram linha quando o painel é estreito, em vez de empurrar a janela para o lado. */}
            <div className="flex flex-wrap items-center gap-2 px-5 pt-4 pb-3 [&>button]:whitespace-nowrap">
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
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-20">
              {tab === 'memory' ? (
                <>
                  <fieldset disabled={locked}><MemoryPanel owner={{ kind: 'bot', id: flow.botId }} compact /></fieldset>
                  <p className="mt-4 text-[12px] text-muted">{tr('As etapas usam e preenchem a memória do bot. Lições sobre uma especialização ficam nela.')}</p>
                </>
              ) : tab === 'runs' ? (
                <RunHistory runs={runs} />
              ) : tab === 'files' ? (
                <FilesPanel files={files} empty={tr('Nenhum arquivo mexido pelas execuções das rotinas ainda.')} />
              ) : selected ? (
                <>
                <fieldset disabled={locked} className="min-w-0">
                  <NodePanel
                    key={selected.id}
                    type={selected.type as FlowNodeType}
                    data={selected.data}
                    onChange={patchSelected}
                    onDelete={canDelete(selected) ? deleteSelected : undefined}
                  />
                </fieldset>
                {selected.type === 'trigger' && <TriggerControls nodeId={selected.id} data={selected.data} />}
                </>
              ) : (
                <p className="text-[13px] text-muted">{tr('Clique numa caixinha para configurar, ou adicione um Gatilho, Tarefa, Decisão ou Confirmação.')}</p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
    </CanvasActions.Provider>
  )
}

/** Canvas do fluxo de um bot: gatilhos (rotinas), caixinhas e o painel com conversas, execuções, arquivos e memória. */
export function FlowCanvas({ flow }: { flow: Flow }) {
  useLanguage()
  return (
    <ReactFlowProvider>
      <Editor key={flow.id} flow={flow} />
    </ReactFlowProvider>
  )
}
