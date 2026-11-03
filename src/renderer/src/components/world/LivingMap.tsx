import { t as tr, useLanguage } from '@/i18n'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Bot as BotIcon } from 'lucide-react'
import type { AvatarDef, AvatarMood, Flow, FlowRun } from '@shared/types'
import { activeTriggers } from '@shared/flows'
import { PixelAvatar } from '@/components/PixelAvatar'
import { ProjectIcon } from '@/components/ProjectBadge'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { draggingItem, type ItemRef } from '@/lib/dnd'
import { timeAgo } from '@/lib/format'
import { isLive } from '@/lib/useFlowRuns'
import { useApp } from '@/state/app'
import { BOT_R, World, fitHeight, hash, zoneHalf, type BodySpec } from './world'

const botKey = (id: string) => `b:${id}`
const zoneKey = (id: string) => `p:${id}`

/** "1 bot", "3 bots": número com a palavra no singular ou plural, traduzida. */
const count = (n: number, one: string, many: string) => `${n} ${tr(n === 1 ? one : many)}`

/** Mensagem animada indo de um bot para outro. */
interface Message {
  from: string
  to: string
  start: number
  dur: number
  color: string
  arrived?: number
}

type Chatter = Record<string, 'talking' | 'happy'>

/** Execuções de rotina acontecendo agora, por id da execução (vários gatilhos do mesmo fluxo podem rodar juntos). */
function useRunningFlows(flows: Flow[]): Record<string, FlowRun> {
  const [running, setRunning] = useState<Record<string, FlowRun>>({})
  const ids = flows.map((f) => f.id).join()
  useEffect(() => {
    let alive = true
    for (const id of ids ? ids.split(',') : []) {
      void window.gbot.flows.runs(id).then((runs) => {
        // Execução "rodando" muito antiga sobrou de um app fechado no meio; ignora.
        const live = runs.filter(isLive)
        if (alive && live.length) setRunning((r) => ({ ...r, ...Object.fromEntries(live.map((run) => [run.id, run])) }))
      })
    }
    const off = window.gbot.flows.onRunUpdate((run) =>
      setRunning((r) => {
        const { [run.id]: _, ...rest } = r
        return run.status === 'running' ? { ...rest, [run.id]: run } : rest
      })
    )
    return () => {
      alive = false
      off()
    }
  }, [ids])
  return running
}

// ── Peças do mapa ───────────────────────────────────────────────────

type Register = (id: string, el: HTMLElement | null) => void
type Grab = (id: string, e: React.PointerEvent) => void

function NameTag({ name, dot }: { name: string; dot?: 'busy' | 'alert' }) {
  useLanguage()
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 flex max-w-[150px] -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-sidebar/90 px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap text-fg shadow-sm backdrop-blur-sm">
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', dot === 'alert' ? 'bg-danger' : 'animate-pulse bg-warning')} />}
      <span className="truncate">{name}</span>
    </span>
  )
}

function Bubble({ tone }: { tone: 'chat' | 'work' }) {
  useLanguage()
  return (
    <span
      className={cn(
        'pointer-events-none absolute -top-1 -right-4 flex items-center gap-[3px] rounded-full rounded-bl-[3px] px-1.5 py-[5px] shadow-md',
        tone === 'work' ? 'bg-warning' : 'bg-fg'
      )}
    >
      {[0, 0.15, 0.3].map((d) => (
        <span key={d} className="gbot-dot size-[4px] rounded-full bg-page" style={{ animationDelay: `${d}s` }} />
      ))}
    </span>
  )
}

function Tooltip({ title, children }: { title: string; children: React.ReactNode }) {
  useLanguage()
  return (
    <div className="pointer-events-none invisible absolute top-full left-1/2 mt-2 w-60 -translate-x-1/2 rounded-tile border border-line bg-sidebar p-3 text-left opacity-0 shadow-2xl transition-opacity group-hover:visible group-hover:opacity-100 group-data-[dragging=true]/map:hidden">
      <p className="truncate text-[13px] font-semibold">{title}</p>
      <div className="mt-1 text-[12px] leading-snug text-muted">{children}</div>
    </div>
  )
}

const ZoneNode = memo(function ZoneNode({
  id,
  name,
  color,
  r,
  bots,
  specializations,
  conversations,
  highlight,
  register,
  onOpen
}: {
  id: string
  name: string
  color: string
  r: number
  bots: number
  specializations: number
  conversations: number
  /** Algo sendo arrastado está por cima da ilha. */
  highlight: boolean
  register: Register
  onOpen(): void
}) {
  return (
    <div ref={(el) => register(id, el)} className="absolute top-0 left-0" style={{ width: r * 2, height: r * 2 }}>
      <button
        onClick={onOpen}
        title={[
          name,
          count(bots, 'bot', 'bots'),
          count(specializations, 'especialização', 'especializações'),
          count(conversations, 'conversa', 'conversas')
        ].join(' · ')}
        className={cn('group absolute inset-0 rounded-[28px] transition-[filter,box-shadow] hover:brightness-150', highlight && 'brightness-150')}
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${color}2e, ${color}12 60%, ${color}08)`,
          boxShadow: highlight ? `0 0 0 3px ${color}55, 0 0 40px ${color}33` : undefined
        }}
      >
        {/* Contorno tracejado andando devagar em volta da ilha. */}
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={r * 2} height={r * 2}>
          <rect
            x={0.75}
            y={0.75}
            width={r * 2 - 1.5}
            height={r * 2 - 1.5}
            rx={27}
            fill="none"
            stroke={color}
            strokeOpacity={highlight ? 1 : 0.45}
            strokeWidth={1.5}
            strokeDasharray="6 6"
            className="gbot-march"
          />
        </svg>
        <span
          className="absolute top-3 left-1/2 flex max-w-[80%] -translate-x-1/2 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap"
          style={{ color, background: `${color}1f` }}
        >
          <ProjectIcon project={{ color }} size={13} />
          <span className="truncate">{name}</span>
        </span>
        {bots === 0 && (
          <span className="absolute inset-x-4 top-1/2 text-center text-[11.5px] text-muted">
            {count(conversations, 'conversa', 'conversas')}
            {specializations > 0 && ` · ${count(specializations, 'especialização', 'especializações')}`}
            <br />{tr('arraste bots para cá')}</span>
        )}
      </button>
    </div>
  )
})

const BotNode = memo(function BotNode({
  id,
  name,
  avatar,
  description,
  mood,
  bubble,
  dot,
  status,
  seed,
  register,
  onGrab,
  onOpen
}: {
  id: string
  name: string
  avatar: AvatarDef
  description: string
  mood: AvatarMood
  bubble?: 'chat' | 'work'
  dot?: 'busy' | 'alert'
  /** Linha de contexto no cartão do hover (rotina rodando, projeto, última conversa, rotinas ativas). */
  status: string
  seed: number
  register: Register
  onGrab: Grab
  onOpen(): void
}) {
  const float = { animationDelay: `${-seed * 4}s`, animationDuration: `${2.6 + seed * 1.4}s` }
  return (
    <div ref={(el) => register(id, el)} className="absolute top-0 left-0 z-10 hover:z-40">
      <div className="group relative -translate-x-1/2 -translate-y-1/2" onPointerDown={(e) => onGrab(id, e)}>
        <NameTag name={name} dot={dot} />
        <button onClick={onOpen} aria-label={tr('Abrir {0}', name)} className="relative block cursor-grab p-1 transition-transform duration-200 hover:scale-115">
          <span className="gbot-float block" style={float}>
            <PixelAvatar avatar={avatar} mood={mood} size={48} seed={Math.round(seed * 100)} />
          </span>
          <span className="gbot-shadow absolute bottom-0 left-1/2 h-1.5 w-9 -translate-x-1/2 rounded-full bg-black/70 blur-[2px]" style={float} />
        </button>
        {bubble && <Bubble tone={bubble} />}
        <Tooltip title={name}>
          <p className="line-clamp-3 text-fg-2">{description || tr('Sem descrição')}</p>
          <p className="mt-1.5">{status}</p>
        </Tooltip>
      </div>
    </div>
  )
})

// ── Mapa ────────────────────────────────────────────────────────────

/**
 * Visão geral "viva" da home: projetos como ilhas com os bots dentro e os bots soltos em volta.
 * Os bots trocam mensagens entre si (enfeite) e mostram o que estão fazendo de verdade:
 * respondendo uma conversa, rodando uma rotina ou esperando aprovação/confirmação.
 */
export function LivingMap() {
  useLanguage()
  const app = useApp()
  const appRef = useRef(app)
  appRef.current = app

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const world = useRef(new World())
  const els = useRef(new Map<string, HTMLElement>())
  const [width, setWidth] = useState(0)
  const [chatter, setChatter] = useState<Chatter>({})
  const running = useRunningFlows(app.flows)

  useLayoutEffect(() => {
    const el = wrapRef.current!
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // O que existe no mapa: ilhas dos projetos e os bots (as rotinas vivem dentro do bot).
  const specs = useMemo<BodySpec[]>(() => {
    const projectIds = new Set(app.projects.map((p) => p.id))
    return [
      ...app.projects.map((p) => ({
        id: zoneKey(p.id),
        kind: 'zone' as const,
        r: zoneHalf(app.bots.filter((b) => b.projectId === p.id).length)
      })),
      ...app.bots.map((b) => ({
        id: botKey(b.id),
        kind: 'bot' as const,
        r: BOT_R,
        zone: b.projectId && projectIds.has(b.projectId) ? zoneKey(b.projectId) : undefined
      }))
    ]
  }, [app.bots, app.projects])

  const height = fitHeight(specs, width)

  // Quem está fazendo algo de verdade agora (e em qual rotina, para o cartão do hover).
  const { realMood, routineOf } = useMemo(() => {
    const m: Record<string, AvatarMood> = {}
    const routineOf: Record<string, string> = {}
    for (const run of Object.values(running)) {
      const flow = app.flows.find((f) => f.id === run.flowId)
      if (!flow) continue
      const key = botKey(flow.botId)
      // Confirmação pendente pede atenção; senão, a rotina está trabalhando.
      if (run.steps.some((s) => s.status === 'waiting')) m[key] = 'attention'
      else if (m[key] !== 'attention') m[key] = 'thinking'
      routineOf[key] = run.triggerLabel || tr('Gatilho')
    }
    const conv = app.activeConversation
    if (app.busy && conv) {
      const botId = conv.messages[conv.messages.length - 1]?.botId ?? conv.botId
      if (botId) m[botKey(botId)] = app.mood === 'idle' ? 'thinking' : app.mood
    }
    for (const req of app.approvals) {
      const bot = app.bots.find((b) => b.name === req.requester)
      if (bot) m[botKey(bot.id)] = 'attention'
    }
    return { realMood: m, routineOf }
  }, [running, app.flows, app.activeConversation, app.busy, app.mood, app.approvals, app.bots])

  // Pares que "conversam" no mapa: bots do mesmo projeto.
  const pairs = useMemo(() => {
    const out: [string, string][] = []
    for (const p of app.projects) {
      const ids = app.bots.filter((b) => b.projectId === p.id).map((b) => botKey(b.id))
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]])
    }
    return out
  }, [app.projects, app.bots])

  // Tudo que o laço de animação lê fica em refs, para ele não precisar reiniciar.
  const live = useRef({ pairs, realMood, bots: app.bots })
  live.current = { pairs, realMood, bots: app.bots }

  const place = useCallback((id: string, el: HTMLElement) => {
    const b = world.current.bodies.get(id)
    if (!b) return
    const x = b.kind === 'zone' ? b.x - b.r : b.x
    const y = b.kind === 'zone' ? b.y - b.r : b.y
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
  }, [])

  const register = useCallback<Register>(
    (id, el) => {
      if (el) {
        els.current.set(id, el)
        place(id, el)
      } else els.current.delete(id)
    },
    [place]
  )

  // Arrastar para dentro ou fora das ilhas: bots do próprio mapa (ponteiro) ou itens
  // arrastados do menu e das listas (arrastar nativo). `target` é o que está sendo arrastado e a ilha embaixo.
  const [target, setTarget] = useState<{ item: ItemRef; zone?: string; onMap: boolean }>()
  const suppressClick = useRef(false)

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const aim = (item: ItemRef, zone: string | undefined, onMap: boolean) =>
    setTarget((t) => (t && t.item.id === item.id && t.zone === zone && t.onMap === onMap ? t : { item, zone, onMap }))

  const onGrab = useCallback<Grab>((key, e) => {
    if (e.button !== 0) return
    const body = world.current.bodies.get(key)
    if (!body) return
    const id = key.slice(2)
    const item: ItemRef = { kind: 'bot', id, projectId: appRef.current.getBot(id)?.projectId }
    const start = toLocal(e)
    const off = { x: start.x - body.x, y: start.y - body.y }
    let moved = false
    let zone: string | undefined

    const move = (ev: PointerEvent) => {
      const p = toLocal(ev)
      if (!moved) {
        if (Math.hypot(p.x - start.x, p.y - start.y) < 5) return
        moved = true
        body.pinned = true
        document.body.style.cursor = 'grabbing'
      }
      body.x = p.x - off.x
      body.y = p.y - off.y
      body.vx = body.vy = 0
      zone = world.current.zoneAt(p.x, p.y)?.id
      aim(item, zone, true)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (!moved) return
      document.body.style.cursor = ''
      body.pinned = false
      // Já muda de ilha aqui, para a física não puxar de volta para a antiga até o estado atualizar.
      body.zone = zone
      world.current.alpha = Math.max(world.current.alpha, 0.3)
      setTarget(undefined)
      // O clique que vem logo depois do arraste não deve abrir o item.
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      void appRef.current.moveItem(item, zone?.slice(2))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [])

  const nativeDrop = {
    onDragOver: (e: React.DragEvent) => {
      const item = draggingItem()
      if (!item) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const p = toLocal(e)
      aim(item, world.current.zoneAt(p.x, p.y)?.id, false)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTarget(undefined)
    },
    onDrop: (e: React.DragEvent) => {
      const item = draggingItem()
      setTarget(undefined)
      if (!item) return
      e.preventDefault()
      const p = toLocal(e)
      void app.moveItem(item, world.current.zoneAt(p.x, p.y)?.id.slice(2))
    }
  }

  useLayoutEffect(() => {
    if (!width) return
    world.current.sync(specs, width, height)
    for (const [id, el] of els.current) place(id, el)
    const canvas = canvasRef.current!
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
  }, [specs, width, height, place])

  // Laço de animação: física, mensagens e conversas de enfeite.
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const css = getComputedStyle(document.documentElement)
    const color = (v: string) => css.getPropertyValue(v).trim()
    const C = { success: color('--success') }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const messages: Message[] = []
    let nextChat = performance.now() + 900
    let raf = 0

    const curve = (fromId: string, toId: string) => {
      const p = world.current.bodies.get(fromId)
      const q = world.current.bodies.get(toId)
      if (!p || !q) return undefined
      const dx = q.x - p.x
      const dy = q.y - p.y
      const d = Math.hypot(dx, dy) || 1
      const ux = dx / d
      const uy = dy / d
      const trim = 30
      const s = { x: p.x + ux * trim, y: p.y + uy * trim }
      const e = { x: q.x - ux * trim, y: q.y - uy * trim }
      const bend = (hash(fromId + toId) - 0.5) * 0.5
      const c = { x: (s.x + e.x) / 2 - uy * d * bend, y: (s.y + e.y) / 2 + ux * d * bend }
      return { s, c, e }
    }
    type Curve = NonNullable<ReturnType<typeof curve>>
    const at = ({ s, c, e }: Curve, t: number) => ({
      x: (1 - t) ** 2 * s.x + 2 * (1 - t) * t * c.x + t * t * e.x,
      y: (1 - t) ** 2 * s.y + 2 * (1 - t) * t * c.y + t * t * e.y
    })
    const dot = (x: number, y: number, r: number, fill: string, alpha: number) => {
      ctx.globalAlpha = alpha
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const startChat = (t: number) => {
      const { pairs, realMood, bots } = live.current
      const busy = (id: string) => !!realMood[id] || messages.some((m) => m.from === id || m.to === id)
      let pair: [string, string] | undefined
      if (pairs.length && Math.random() < 0.7) pair = pairs[Math.floor(Math.random() * pairs.length)]
      else if (bots.length >= 2) {
        const a = Math.floor(Math.random() * bots.length)
        const b = (a + 1 + Math.floor(Math.random() * (bots.length - 1))) % bots.length
        pair = [botKey(bots[a].id), botKey(bots[b].id)]
      }
      if (!pair || busy(pair[0]) || busy(pair[1])) return
      // Qualquer um dos dois pode puxar assunto.
      const [from, to] = Math.random() < 0.5 ? [pair[1], pair[0]] : pair
      const sender = bots.find((b) => botKey(b.id) === from)
      messages.push({ from, to, start: t + 500, dur: 1100, color: sender?.avatar.color ?? C.success })
      if (sender) setChatter((c) => ({ ...c, [from]: 'talking' }))
    }

    const frame = (t: number) => {
      const w = world.current
      w.step()
      for (const [id, el] of els.current) place(id, el)

      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w.width, w.height)

      // Mensagens entre bots: bolinha com rastro e um "ping" ao chegar.
      if (!still && t > nextChat) {
        nextChat = t + 1500 + Math.random() * 2200
        if (messages.length < 3) startChat(t)
      }
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        const k = curve(m.from, m.to)
        if (!k) {
          messages.splice(i, 1)
          continue
        }
        if (!m.arrived) {
          const p = (t - m.start) / m.dur
          if (p < 0) continue
          if (p >= 1) {
            m.arrived = t
            setChatter((c) => {
              const { [m.from]: _, ...rest } = c
              return { ...rest, [m.to]: 'happy' }
            })
            continue
          }
          const ease = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
          for (let j = 6; j >= 0; j--) {
            const pt = at(k, Math.max(0, ease - j * 0.025))
            dot(pt.x, pt.y, 3.2 - j * 0.35, m.color, j === 0 ? 1 : 0.5 - j * 0.07)
          }
        } else {
          const age = (t - m.arrived) / 700
          if (age < 1) {
            ctx.globalAlpha = 0.5 * (1 - age)
            ctx.strokeStyle = m.color
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.arc(k.e.x, k.e.y, 18 + age * 26, 0, Math.PI * 2)
            ctx.stroke()
          } else if (t - m.arrived > 1400) {
            messages.splice(i, 1)
            setChatter((c) => {
              if (c[m.to] !== 'happy') return c
              const { [m.to]: _, ...rest } = c
              return rest
            })
          }
        }
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [place])

  // Uma função estável por item, para os nós memorizados não renderizarem à toa.
  const openers = useRef(new Map<string, () => void>())
  const opener = (key: string) => {
    let fn = openers.current.get(key)
    if (!fn) {
      const id = key.slice(2)
      const kind = key[0]
      fn = () => {
        if (suppressClick.current) return
        if (kind === 'b') appRef.current.openBot(id)
        else appRef.current.openProject(id)
      }
      openers.current.set(key, fn)
    }
    return fn
  }

  const empty = !app.bots.length && !app.projects.length
  const now = Date.now()
  const targetProject = app.getProject(target?.zone?.slice(2))
  const hint = !target
    ? undefined
    : targetProject
      ? target.item.projectId === targetProject.id
        ? tr('Já está em {0}', targetProject.name)
        : tr('Soltar para mover para {0}', targetProject.name)
      : target.item.projectId
        ? tr('Soltar aqui tira do projeto')
        : tr('Solte numa ilha para mover para o projeto')

  return (
    <div
      ref={wrapRef}
      {...nativeDrop}
      data-dragging={!!target?.onMap}
      className={cn('group/map relative rounded-card border transition-colors', target && !target.zone ? 'border-muted' : 'border-line')}
      style={{
        height,
        backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)',
        backgroundSize: '22px 22px'
      }}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" style={{ width: '100%', height: '100%' }} />
      {hint && (
        <span className="pointer-events-none absolute top-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-sidebar px-3 py-1 text-[12px] font-medium text-fg-2 shadow-lg">
          {hint}
        </span>
      )}

      {app.projects.map((p) => {
        const id = zoneKey(p.id)
        return (
          <ZoneNode
            key={id}
            id={id}
            name={p.name}
            color={p.color}
            r={specs.find((s) => s.id === id)!.r}
            bots={app.bots.filter((b) => b.projectId === p.id).length}
            specializations={app.specializations.filter((sp) => sp.projectId === p.id).length}
            highlight={target?.zone === id}
            conversations={app.conversations.filter((c) => c.projectId === p.id).length}
            register={register}
            onOpen={opener(id)}
          />
        )
      })}

      {app.bots.map((b) => {
        const id = botKey(b.id)
        const real = realMood[id]
        const chat = chatter[id]
        const last = Math.max(0, ...app.conversations.filter((c) => c.botId === b.id).map((c) => c.updatedAt))
        const project = app.getProject(b.projectId)
        const flow = app.botFlow(b.id)
        const active = flow ? activeTriggers(flow).length : 0
        const routine = routineOf[id]
        const status = [
          routine && tr('na rotina "{0}"', routine),
          project?.name,
          last ? tr('conversou {0}', timeAgo(last, now)) : tr('sem conversas ainda'),
          active ? (active === 1 ? tr('1 rotina ativa') : tr('{0} rotinas ativas', active)) : undefined
        ]
          .filter(Boolean)
          .join(' · ')
        return (
          <BotNode
            key={id}
            id={id}
            name={b.name}
            avatar={b.avatar}
            description={b.description}
            mood={real ?? (chat === 'talking' ? 'talking' : chat === 'happy' ? 'happy' : 'idle')}
            bubble={real === 'thinking' || real === 'talking' ? 'work' : chat === 'talking' ? 'chat' : undefined}
            dot={real === 'attention' ? 'alert' : real ? 'busy' : undefined}
            status={status}
            seed={hash(b.id)}
            register={register}
            onGrab={onGrab}
            onOpen={opener(id)}
          />
        )
      })}

      {empty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <span className="gbot-float block">
            <PixelAvatar avatarId="brasa" size={64} />
          </span>
          <p className="text-[15px] font-medium">{tr('Ainda não tem ninguém por aqui')}</p>
          <p className="max-w-sm text-[13px] text-muted">{tr('Crie bots, junte-os em projetos e dê rotinas a eles — eles aparecem aqui, conversando entre si.')}</p>
          <Button variant="primary" className="mt-1" onClick={() => app.editBot()}>
            <BotIcon size={15} />{tr('Criar o primeiro bot')}</Button>
        </div>
      )}
    </div>
  )
}
