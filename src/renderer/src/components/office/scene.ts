/**
 * Desenha e anima o escritório isométrico direto no SVG (sem passar pelo React a cada quadro): móveis, paredes e os
 * bots andando entre os lugares. Tudo é roteiro fixo: o React só diz o que cada bot está fazendo (`update`).
 */
import type { AvatarDef, AvatarMood } from '@shared/types'
import { renderAvatar } from '@/avatars/sprites'
import type { PlanKind } from './behavior'
import {
  pathLength,
  pointAlong,
  pointInFront,
  reroute,
  route,
  visitSpot,
  type BoxSpec,
  type OfficeLayout,
  type Pt,
  type Spot,
  type Tone
} from './layout'

const NS = 'http://www.w3.org/2000/svg'
const TW = 64
const TH = 32
const WALL = 96
/** Velocidade de caminhada, em ladrilhos por segundo. */
const SPEED = 2.6
/** Tamanho de cada pixel do avatar (o sprite tem 12 × 13). */
const PX = 3

export const project = (x: number, y: number, z = 0): [number, number] => [((x - y) * TW) / 2, ((x + y) * TH) / 2 - z]

const TONES: Record<Tone, [string, string, string]> = {
  desk: ['#3b3b3b', '#2b2b2b', '#222222'],
  chair: ['#303030', '#262626', '#1f1f1f'],
  laptop: ['#555555', '#474747', '#3c3c3c'],
  paper: ['#cfcfcf', '#aaaaaa', '#999999'],
  mug: ['#dddddd', '#bbbbbb', '#999999'],
  table: ['#3d3d3d', '#2d2d2d', '#242424'],
  sofa: ['#3a3f4f', '#2c3040', '#242836'],
  sofaBack: ['#41475a', '#33384a', '#2a2e3d'],
  counter: ['#3e3e3e', '#2d2d2d', '#262626'],
  machine: ['#222222', '#1a1a1a', '#141414'],
  fridge: ['#4a4a4a', '#3a3a3a', '#303030'],
  pot: ['#5a4636', '#4a3a2c', '#3d3024'],
  glass: ['rgba(255,255,255,.10)', 'rgba(160,190,255,.05)', 'rgba(160,190,255,.08)'],
  green: ['#2fae6b', '#259a6c', '#1f7f59'],
  shelf: ['#333333', '#292929', '#222222']
}

/** Escurece uma cor hex (faces laterais de um bloco com cor própria). */
function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (s: number) => Math.round(((n >> s) & 255) * f)
  return `rgb(${c(16)},${c(8)},${c(0)})`
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  parent?.appendChild(e)
  return e
}

const pts = (list: [number, number][]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/** Bloco isométrico: as duas faces visíveis e o tampo. Devolve a caixa ocupada na tela. */
function drawBox(g: SVGGElement, b: BoxSpec) {
  const z = b.z ?? 0
  const [top, left, right] = b.color ? [b.color, darken(b.color, 0.78), darken(b.color, 0.62)] : TONES[b.tone]
  const stroke = 'rgba(255,255,255,.04)'
  const P = (x: number, y: number, h: number) => project(x, y, h)
  const { x, y, w, d, h } = b
  el('polygon', { points: pts([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)]), fill: left, stroke }, g)
  el('polygon', { points: pts([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)]), fill: right, stroke }, g)
  el('polygon', { points: pts([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)]), fill: top, stroke }, g)
  const corners = [P(x, y, z + h), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z), P(x + w, y, z + h)]
  return {
    x0: Math.min(...corners.map((c) => c[0])),
    x1: Math.max(...corners.map((c) => c[0])),
    y0: Math.min(...corners.map((c) => c[1])),
    y1: Math.max(...corners.map((c) => c[1]))
  }
}

/** Texto deitado no chão (eixo x) ou pendurado numa parede (fundo: eixo x; esquerda: eixo y). */
const FLOOR = (x: number, y: number) => `matrix(0.894,0.447,-0.894,0.447,${project(x, y)[0]},${project(x, y)[1]})`
const BACK_WALL = (x: number, z: number) => `matrix(0.894,0.447,0,1,${project(x, 0, z)[0]},${project(x, 0, z)[1]})`
const LEFT_WALL = (y: number, z: number) => `matrix(0.894,-0.447,0,1,${project(0, y, z)[0]},${project(0, y, z)[1]})`

export interface ActorInfo {
  id: string
  name: string
  avatar: AvatarDef
  seed: number
}

export type BubbleTone = 'work' | 'talk' | 'wait' | 'done' | 'error' | 'info'

/** O que mostrar de cada bot (textos já traduzidos pelo React). */
export interface Display {
  kind: PlanKind
  partner?: string
  mood: AvatarMood
  /** Cor do pontinho ao lado do nome. */
  dot: string
  bubble?: { tone: BubbleTone; title: string; sub?: string; progress?: number; action?: string; accent?: string; typing?: boolean }
  /** Balão ao passar o mouse quando não há outro. */
  hover: { title: string; sub?: string }
}

export interface SceneData {
  layout: OfficeLayout
  actors: ActorInfo[]
  display: Map<string, Display>
  labels: { rooms: Record<string, string>; lounge: string; meeting: string; coffee: string; board: string }
  board: string[]
}

interface Bubble {
  el: HTMLDivElement
  key: string
  w: number
  h: number
}

interface Actor {
  info: ActorInfo
  g: SVGGElement
  shadow: SVGEllipseElement
  halo: SVGEllipseElement
  sprite: SVGGElement
  bubble: Bubble
  tag: HTMLDivElement
  zzz: HTMLDivElement
  envelope?: SVGGElement
  at: Spot
  target: Spot
  walk?: { pts: Pt[]; t0: number; dur: number; to: Spot; seg: number }
  arrivedAt: number
  pos: Pt & { z: number }
  flip: number
  display: Display
  spriteKey: string
  hover: boolean
  celebrateAt?: number
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export class OfficeScene {
  private floor: SVGGElement
  private walls: SVGGElement
  private objs: SVGGElement
  private fx: SVGGElement
  private pieces: { g: SVGGElement; foot: OfficeLayout['pieces'][number]['foot']; box: { x0: number; x1: number; y0: number; y1: number } }[] = []
  private deskFx = new Map<string, { glow: SVGEllipseElement; led: SVGCircleElement }>()
  private actors = new Map<string, Actor>()
  private layout?: OfficeLayout
  private sig = ''
  private clock?: { h: SVGLineElement; m: SVGLineElement }
  private sky: SVGStopElement[] = []
  private board: SVGTextElement[] = []
  private boardTitle?: SVGTextElement
  private raf = 0
  private confetti: { el: SVGRectElement; x: number; y: number; vx: number; vy: number; t0: number }[] = []
  private uid = Math.random().toString(36).slice(2, 8)

  constructor(
    private svg: SVGSVGElement,
    private overlay: HTMLElement,
    private onOpen: (botId: string) => void
  ) {
    this.floor = el('g', {}, svg)
    this.walls = el('g', {}, svg)
    this.objs = el('g', {}, svg)
    this.fx = el('g', {}, svg)
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.svg.replaceChildren()
    this.overlay.replaceChildren()
  }

  update(data: SceneData) {
    const sig = JSON.stringify([data.layout.W, data.layout.D, data.layout.rooms, Object.keys(data.layout.seats), data.labels])
    if (sig !== this.sig) {
      this.sig = sig
      this.layout = data.layout
      this.buildStatic(data)
      // Lugares mudaram: todo mundo reaparece já no lugar certo
      for (const a of this.actors.values()) this.removeActor(a)
      this.actors.clear()
    }
    this.layout = data.layout
    this.updateBoard(data)

    const ids = new Set(data.actors.map((a) => a.id))
    for (const [id, a] of this.actors) {
      if (!ids.has(id)) {
        this.removeActor(a)
        this.actors.delete(id)
      }
    }
    const targets = this.assignSpots(data)
    const now = performance.now()
    for (const info of data.actors) {
      const display = data.display.get(info.id)
      const target = targets.get(info.id)
      if (!display || !target) continue
      let a = this.actors.get(info.id)
      if (!a) {
        a = this.createActor(info, display, target)
        this.actors.set(info.id, a)
      }
      if (display.kind === 'done' && a.display.kind !== 'done' && !reducedMotion()) a.celebrateAt = now
      a.info = info
      a.display = display
      a.target = target
      this.renderBubble(a)
    }
  }

  /**
   * Cada bot ganha um lugar: a própria mesa, a mesa do colega, a reunião, a copa ou o sofá. Quem já está num lugar
   * certo para o que faz continua nele (ninguém troca de sofá só porque um colega levantou).
   */
  private assignSpots(data: SceneData): Map<string, Spot> {
    const L = data.layout
    const out = new Map<string, Spot>()
    const taken = new Set<string>()
    const pool = (kind: PlanKind) => (kind === 'wait' ? L.meeting : kind === 'coffee' ? L.coffee : kind === 'sleep' ? L.lounge : undefined)
    for (const info of data.actors) {
      const d = data.display.get(info.id)
      const current = this.actors.get(info.id)?.target
      const spots = d && pool(d.kind)
      if (spots && current && !taken.has(current.key) && spots.some((s) => s.key === current.key)) {
        out.set(info.id, current)
        taken.add(current.key)
      }
    }
    const visits = new Map<string, number>()
    for (const info of data.actors) {
      const d = data.display.get(info.id)
      const seat = L.seats[info.id]
      if (!d || !seat || out.has(info.id)) continue
      let spot: Spot = seat
      const spots = pool(d.kind)
      if (spots) spot = spots.find((s) => !taken.has(s.key)) ?? seat
      else if (d.kind === 'visit' && d.partner && L.seats[d.partner]) {
        const k = visits.get(d.partner) ?? 0
        visits.set(d.partner, k + 1)
        spot = visitSpot(L.seats[d.partner], L.corridorY, k)
      }
      taken.add(spot.key)
      out.set(info.id, spot)
    }
    return out
  }

  // ── Cenário fixo ──────────────────────────────────────────────

  private buildStatic(data: SceneData) {
    const L = data.layout
    for (const g of [this.floor, this.walls, this.objs, this.fx]) g.replaceChildren()
    this.pieces = []
    this.deskFx.clear()
    this.confetti = []

    const [minX] = project(0, L.D)
    const [maxX] = project(L.W, 0)
    const [, maxY] = project(L.W, L.D)
    this.svg.setAttribute('viewBox', `${minX - 24} ${-WALL - 40} ${maxX - minX + 48} ${maxY + WALL + 64}`)

    // Gradientes (ids únicos por cena)
    const defs = el('defs', {}, this.floor)
    const sky = el('linearGradient', { id: `sky-${this.uid}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs)
    this.sky = [0, 0.55, 1].map((o) => el('stop', { offset: o }, sky))
    const amber = el('radialGradient', { id: `amber-${this.uid}` }, defs)
    el('stop', { offset: 0, 'stop-color': '#e3a02b', 'stop-opacity': 0.35 }, amber)
    el('stop', { offset: 1, 'stop-color': '#e3a02b', 'stop-opacity': 0 }, amber)

    // Piso, grade e tapetes das salas
    const P = (x: number, y: number, z = 0) => project(x, y, z)
    el('polygon', { points: pts([P(0, 0), P(L.W, 0), P(L.W, L.D), P(0, L.D)]), fill: '#191919' }, this.floor)
    for (let i = 0; i <= L.W; i++) el('line', { x1: P(i, 0)[0], y1: P(i, 0)[1], x2: P(i, L.D)[0], y2: P(i, L.D)[1], stroke: '#202020' }, this.floor)
    for (let j = 0; j <= Math.floor(L.D); j++) el('line', { x1: P(0, j)[0], y1: P(0, j)[1], x2: P(L.W, j)[0], y2: P(L.W, j)[1], stroke: '#202020' }, this.floor)
    for (const room of L.rooms) {
      const x0 = room.x + 0.15
      const x1 = room.x + room.w - 0.15
      const y1 = L.roomsDepth - 0.15
      el('polygon', { points: pts([P(x0, 0.25), P(x1, 0.25), P(x1, y1), P(x0, y1)]), fill: room.color, 'fill-opacity': 0.07, stroke: room.color, 'stroke-opacity': 0.4, 'stroke-dasharray': '4 4' }, this.floor)
      const label = el('text', { transform: FLOOR(room.x + 0.4, L.roomsDepth - 0.4), 'font-size': 11, 'font-weight': 600, 'letter-spacing': '0.05em', fill: room.color, 'fill-opacity': 0.75 }, this.floor)
      label.textContent = data.labels.rooms[room.id] ?? room.name
    }
    el('polygon', { points: pts([P(0.3, L.commonY + 0.2), P(4.2, L.commonY + 0.2), P(4.2, L.D - 0.6), P(0.3, L.D - 0.6)]), fill: 'rgba(255,255,255,.025)', stroke: 'rgba(255,255,255,.08)', 'stroke-dasharray': '4 4' }, this.floor)
    for (const f of L.floorLabels) {
      const t = el('text', { transform: FLOOR(f.x, f.y), 'font-size': 10.5, 'font-weight': 600, 'letter-spacing': '0.05em', fill: 'rgba(242,242,242,.22)' }, this.floor)
      t.textContent = data.labels[f.key]
    }

    // Paredes
    el('polygon', { points: pts([P(0, 0), P(L.W, 0), P(L.W, 0, WALL), P(0, 0, WALL)]), fill: '#1f1f1f' }, this.walls)
    el('polygon', { points: pts([P(0, 0), P(0, L.D), P(0, L.D, WALL), P(0, 0, WALL)]), fill: '#1a1a1a' }, this.walls)
    el('polygon', { points: pts([P(-0.25, -0.25, WALL), P(L.W, -0.25, WALL), P(L.W, 0, WALL), P(0, 0, WALL), P(0, L.D, WALL), P(-0.25, L.D, WALL)]), fill: '#2a2a2a' }, this.walls)
    el('polyline', { points: pts([P(0, L.D, 4), P(0, 0, 4), P(L.W, 0, 4)]), fill: 'none', stroke: '#2a2a2a', 'stroke-width': 2 }, this.walls)
    // Janelas sobre as salas (o céu segue a hora do dia)
    for (const w of L.windows) {
      el('polygon', { points: pts([P(w.x0, 0, 34), P(w.x1, 0, 34), P(w.x1, 0, 82), P(w.x0, 0, 82)]), fill: `url(#sky-${this.uid})`, stroke: '#2f2f2f', 'stroke-width': 3 }, this.walls)
      const panes = Math.max(1, Math.round((w.x1 - w.x0) / 1.1))
      for (let i = 1; i < panes; i++) {
        const x = w.x0 + ((w.x1 - w.x0) * i) / panes
        el('line', { x1: P(x, 0, 34)[0], y1: P(x, 0, 34)[1], x2: P(x, 0, 82)[0], y2: P(x, 0, 82)[1], stroke: '#2f2f2f', 'stroke-width': 3 }, this.walls)
      }
    }
    // Relógio com a hora real
    const clock = el('g', { transform: BACK_WALL(L.clockX, 66) }, this.walls)
    el('circle', { r: 12, fill: '#242424', stroke: '#3a3a3a', 'stroke-width': 2 }, clock)
    this.clock = {
      h: el('line', { x1: 0, y1: 0, x2: 0, y2: -6.5, stroke: '#f2f2f2', 'stroke-width': 2, 'stroke-linecap': 'round' }, clock),
      m: el('line', { x1: 0, y1: 0, x2: 0, y2: -9.5, stroke: '#8e9196', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, clock)
    }
    // Quadro "Próximas rotinas" na parede esquerda, na altura do corredor
    const board = el('g', { transform: LEFT_WALL(Math.min(L.D - 0.4, L.corridorY + 2.6), 84) }, this.walls)
    el('rect', { width: 176, height: 66, rx: 6, fill: '#202020', stroke: '#333', 'stroke-width': 1.5 }, board)
    this.boardTitle = el('text', { x: 10, y: 15, fill: '#8e9196', 'font-size': 9.5, 'font-weight': 600, 'letter-spacing': '0.05em' }, board)
    this.board = [0, 1, 2].map((i) => el('text', { x: 10, y: 31 + i * 14, fill: '#c9cacc', 'font-size': 10.5, 'font-family': 'var(--font-mono)' }, board))

    // Móveis, em ordem de profundidade
    const sorted = [...L.pieces].sort((a, b) => a.foot.x + a.foot.w / 2 + a.foot.y + a.foot.d / 2 - (b.foot.x + b.foot.w / 2 + b.foot.y + b.foot.d / 2))
    for (const piece of sorted) {
      const g = el('g', {}, this.objs)
      let box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
      for (const b of piece.boxes) {
        const r = drawBox(g, b)
        box = { x0: Math.min(box.x0, r.x0), x1: Math.max(box.x1, r.x1), y0: Math.min(box.y0, r.y0), y1: Math.max(box.y1, r.y1) }
      }
      if (piece.desk) {
        const { x, y, botId } = piece.desk
        const [gx, gy] = P(x + 1, y + 0.3, 18)
        const glow = el('ellipse', { cx: gx, cy: gy, rx: 44, ry: 17, fill: '#fff', opacity: 0 }, g)
        g.insertBefore(glow, g.children[3] ?? null)
        const [lx, ly] = P(x + 1, y + 0.26, 26)
        const led = el('circle', { cx: lx, cy: ly, r: 2.3, fill: '#333' }, g)
        this.deskFx.set(botId, { glow, led })
      }
      if (piece.plant) {
        const { x, y, s } = piece.plant
        const [px, py] = P(x, y, 12)
        for (const [dx, dy, r, c] of [[0, -14, 11, '#2fae6b'], [-8, -8, 8, '#259a6c'], [8, -9, 8, '#259a6c'], [2, -24, 7, '#3dbe8b']] as const) {
          el('circle', { cx: px + dx * s, cy: py + dy * s, r: r * s, fill: c }, g)
        }
        box.y0 = Math.min(box.y0, py - 32 * s)
      }
      this.pieces.push({ g, foot: piece.foot, box })
    }
  }

  private updateBoard(data: SceneData) {
    if (this.boardTitle) this.boardTitle.textContent = data.labels.board
    this.board.forEach((t, i) => (t.textContent = data.board[i] ?? ''))
  }

  // ── Bots ──────────────────────────────────────────────────────

  private createActor(info: ActorInfo, display: Display, spot: Spot): Actor {
    const g = el('g', { style: 'cursor:pointer' }, this.objs)
    const shadow = el('ellipse', { rx: 15, ry: 6, fill: 'rgba(0,0,0,.45)' }, g)
    const halo = el('ellipse', { rx: 34, ry: 15, fill: `url(#amber-${this.uid})`, opacity: 0 }, g)
    const sprite = el('g', {}, g)
    const bubbleEl = document.createElement('div')
    bubbleEl.className = 'gbot-office-bubble'
    bubbleEl.addEventListener('click', () => this.onOpen(info.id))
    const tag = document.createElement('div')
    tag.className = 'gbot-office-name'
    const zzz = document.createElement('div')
    zzz.className = 'gbot-office-zzz'
    zzz.textContent = 'z'
    this.overlay.append(bubbleEl, tag, zzz)
    const a: Actor = {
      info,
      g,
      shadow,
      halo,
      sprite,
      bubble: { el: bubbleEl, key: '', w: 0, h: 0 },
      tag,
      zzz,
      at: spot,
      target: spot,
      arrivedAt: performance.now(),
      pos: { x: spot.x, y: spot.y, z: spot.z },
      flip: 1,
      display,
      spriteKey: '',
      hover: false
    }
    g.addEventListener('click', () => this.onOpen(info.id))
    g.addEventListener('mouseenter', () => {
      a.hover = true
      this.renderBubble(a)
    })
    g.addEventListener('mouseleave', () => {
      a.hover = false
      this.renderBubble(a)
    })
    return a
  }

  private removeActor(a: Actor) {
    a.g.remove()
    a.envelope?.remove()
    a.bubble.el.remove()
    a.tag.remove()
    a.zzz.remove()
  }

  /** Monta o conteúdo do balão (só quando muda) com textContent: nomes e rotinas são texto do usuário. */
  private renderBubble(a: Actor) {
    const b = a.display.bubble ?? (a.hover ? { tone: 'info' as const, title: a.display.hover.title, sub: a.display.hover.sub } : undefined)
    const key = b ? JSON.stringify(b) : ''
    if (key === a.bubble.key) return
    a.bubble.key = key
    const root = a.bubble.el
    root.replaceChildren()
    if (!b) return
    root.className = `gbot-office-bubble is-${b.tone}`
    root.style.borderLeftColor = b.tone === 'talk' && b.accent ? b.accent : ''
    const title = document.createElement('b')
    title.textContent = b.title
    root.append(title)
    if (b.sub || b.progress !== undefined || b.typing) {
      const meta = document.createElement('div')
      meta.className = 'gbot-office-meta'
      if (b.progress !== undefined) {
        const bar = document.createElement('span')
        bar.className = 'gbot-office-bar'
        const fill = document.createElement('i')
        fill.style.width = `${Math.round(Math.min(1, Math.max(0, b.progress)) * 100)}%`
        bar.append(fill)
        meta.append(bar)
      }
      if (b.sub) {
        const sub = document.createElement('span')
        sub.className = 'gbot-office-sub'
        sub.textContent = b.sub
        meta.append(sub)
      }
      if (b.typing) {
        const dots = document.createElement('span')
        dots.className = 'gbot-dots inline-flex gap-0.5'
        dots.append(document.createElement('span'), document.createElement('span'), document.createElement('span'))
        meta.append(dots)
      }
      root.append(meta)
    }
    if (b.action) {
      const act = document.createElement('span')
      act.className = 'gbot-office-action'
      act.textContent = b.action
      root.append(act)
    }
    a.bubble.w = root.offsetWidth
    a.bubble.h = root.offsetHeight
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    if (!this.layout || !this.svg.isConnected) return
    const reduced = reducedMotion()
    const t = now / 1000
    const tick = reduced ? 0 : Math.floor(now / 120)
    const ctm = this.svg.getScreenCTM()
    const box = this.overlay.getBoundingClientRect()
    if (!ctm || !box.width) return
    const toScreen = (x: number, y: number) => ({ x: ctm.a * x + ctm.e - box.left, y: ctm.d * y + ctm.f - box.top })

    for (const fx of this.deskFx.values()) {
      fx.glow.setAttribute('opacity', '0')
      fx.led.setAttribute('fill', '#333')
    }

    const bubbles: { a: Actor; ax: number; ay: number; rank: number }[] = []
    for (const a of this.actors.values()) {
      // Mudou de destino no meio do caminho: vira ali mesmo, voltando ao corredor por trechos livres
      if (a.walk && a.walk.to.key !== a.target.key) {
        const path = reroute(a.walk.pts, a.walk.seg, a.pos, a.target, this.layout.corridorY)
        if (path && path.length >= 2) a.walk = { pts: path, t0: now, dur: Math.max(300, (pathLength(path) / SPEED) * 1000), to: a.target, seg: 0 }
      }
      // Começa a andar quando o destino muda
      if (!a.walk && a.target.key !== a.at.key) {
        const path = route(a.at, a.target)
        if (reduced || path.length < 2) {
          a.at = a.target
          a.arrivedAt = now
        } else {
          a.walk = { pts: path, t0: now, dur: Math.max(400, (pathLength(path) / SPEED) * 1000), to: a.target, seg: 0 }
        }
      }
      let hop = 0
      if (a.walk) {
        const f = (now - a.walk.t0) / a.walk.dur
        const p = pointAlong(a.walk.pts, f)
        a.pos = { x: p.x, y: p.y, z: 0 }
        a.walk.seg = p.seg
        if (p.dir) a.flip = p.dir < 0 ? -1 : 1
        hop = Math.abs(Math.sin(t * 13)) * 3.5
        if (f >= 1) {
          a.at = a.walk.to
          a.walk = undefined
          a.arrivedAt = now
          a.flip = 1
        }
      }
      if (!a.walk) a.pos = { x: a.at.x, y: a.at.y, z: a.at.z }
      const walking = !!a.walk
      const d = a.display
      const mood: AvatarMood = walking ? 'idle' : d.mood

      const [sx, sy] = project(a.pos.x, a.pos.y)
      const z = a.pos.z
      a.shadow.setAttribute('cx', String(sx))
      a.shadow.setAttribute('cy', String(sy))
      a.shadow.setAttribute('opacity', z ? '0' : '1')
      a.halo.setAttribute('cx', String(sx))
      a.halo.setAttribute('cy', String(sy))
      a.halo.setAttribute('opacity', !walking && d.kind === 'wait' ? String(0.6 + Math.sin(t * 4) * 0.4) : '0')
      const rock = !reduced && !walking && d.kind === 'work' ? Math.sin(t * 4 + a.info.seed) * 3 : 0
      a.sprite.setAttribute('transform', `translate(${sx},${sy - z - hop}) rotate(${rock.toFixed(2)}) scale(${PX * a.flip},${PX}) translate(-6,-13)`)
      const spriteKey = `${mood}|${tick}`
      if (spriteKey !== a.spriteKey) {
        a.spriteKey = spriteKey
        a.sprite.innerHTML = renderAvatar(a.info.avatar, mood, tick, a.info.seed)
          .map((p) => `<rect x="${p.x}" y="${p.y}" width="1.02" height="1.02" fill="${p.color}"/>`)
          .join('')
      }

      // Notebook aceso enquanto trabalha na própria mesa
      const atSeat = !walking && a.at.key === `seat:${a.info.id}`
      const fx = this.deskFx.get(a.info.id)
      if (fx && atSeat && (d.kind === 'work' || d.kind === 'host' || d.kind === 'error')) {
        fx.led.setAttribute('fill', d.kind === 'error' ? '#e5554d' : a.info.avatar.color)
        fx.glow.setAttribute('fill', d.kind === 'error' ? '#e5554d' : a.info.avatar.color)
        fx.glow.setAttribute('opacity', String(0.12 + (reduced ? 0 : Math.sin(t * 3 + a.info.seed) * 0.04)))
      }

      // Nome embaixo e "z z z" de quem dorme
      const foot = toScreen(sx, sy + 6)
      a.tag.style.transform = `translate(${foot.x}px, ${foot.y}px) translateX(-50%)`
      // Quem dorme só mostra o nome com o mouse em cima (o sofá fica limpo)
      a.tag.style.opacity = !walking && d.kind === 'sleep' && !a.hover ? '0' : '1'
      if (a.tag.dataset.k !== `${a.info.name}|${d.dot}`) {
        a.tag.dataset.k = `${a.info.name}|${d.dot}`
        a.tag.replaceChildren()
        const dot = document.createElement('i')
        dot.style.background = d.dot
        a.tag.append(dot, a.info.name)
      }
      if (!walking && d.kind === 'sleep' && !reduced) {
        const k = (t * 0.8 + a.info.seed * 0.37) % 1
        const head = toScreen(sx + 14 + k * 10, sy - z - 44 - k * 18)
        a.zzz.style.opacity = String(1 - k)
        a.zzz.style.fontSize = `${9 + k * 6}px`
        a.zzz.style.transform = `translate(${head.x}px, ${head.y}px)`
      } else a.zzz.style.opacity = '0'

      // Confete quando termina uma rotina
      if (a.celebrateAt !== undefined) {
        const origin = { x: sx, y: sy - z - 40 }
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2 + a.info.seed
          const speed = 30 + ((i * 37) % 40)
          const c = el('rect', { width: 4, height: 4, fill: [a.info.avatar.color, '#f2f2f2', '#e3a02b', '#2fae6b'][i % 4] }, this.fx)
          this.confetti.push({ el: c, x: origin.x, y: origin.y, vx: Math.cos(ang) * speed, vy: -Math.abs(Math.sin(ang)) * speed - 10, t0: now })
        }
        a.celebrateAt = undefined
      }

      // Envelopes indo e voltando enquanto conversam na mesa do colega
      const host = d.kind === 'visit' && d.partner ? this.actors.get(d.partner) : undefined
      if (host && !walking && !host.walk && !reduced) {
        if (!a.envelope) {
          a.envelope = el('g', {}, this.fx)
          el('rect', { x: -6, y: -4, width: 12, height: 8, rx: 1.5, fill: a.info.avatar.color }, a.envelope)
          el('path', { d: 'M-6 -4 L0 1 L6 -4', stroke: '#141414', 'stroke-width': 1.3, fill: 'none' }, a.envelope)
        }
        const period = 2.6
        const since = (now - a.arrivedAt) / 1000
        const f = (since % period) / 0.9
        const forward = Math.floor(since / period) % 2 === 0
        if (since > 0.4 && f <= 1) {
          const [hx, hy] = project(host.pos.x, host.pos.y)
          const from = forward ? [sx, sy - z - 30] : [hx, hy - host.pos.z - 30]
          const to = forward ? [hx, hy - host.pos.z - 30] : [sx, sy - z - 30]
          const ex = from[0] + (to[0] - from[0]) * f
          const ey = from[1] + (to[1] - from[1]) * f - Math.sin(f * Math.PI) * 30
          a.envelope.setAttribute('transform', `translate(${ex},${ey})`)
          a.envelope.setAttribute('opacity', '1')
        } else a.envelope.setAttribute('opacity', '0')
      } else if (a.envelope) a.envelope.setAttribute('opacity', '0')

      // Balão (escondido enquanto anda)
      const show = !walking && a.bubble.key !== ''
      a.bubble.el.style.opacity = show ? '1' : '0'
      a.bubble.el.style.pointerEvents = show ? 'auto' : 'none'
      if (show) {
        const head = toScreen(sx, sy - z - 44)
        bubbles.push({ a, ax: head.x, ay: head.y, rank: d.kind === 'wait' ? 0 : a.hover ? 1 : 2 })
      }
    }
    this.placeBubbles(bubbles)
    this.stepConfetti(now)
    this.sortDepth()

    const date = new Date()
    if (this.clock) {
      this.clock.h.setAttribute('transform', `rotate(${(date.getHours() % 12) * 30 + date.getMinutes() / 2})`)
      this.clock.m.setAttribute('transform', `rotate(${date.getMinutes() * 6})`)
    }
    this.paintSky(date.getHours())
  }

  /** Balões vizinhos não se cobrem: desliza para o lado (a setinha continua apontando para o bot) ou sobe. */
  private placeBubbles(list: { a: Actor; ax: number; ay: number; rank: number }[]) {
    const placed: { x: number; y: number; w: number; h: number }[] = []
    const hit = (r: { x: number; y: number; w: number; h: number }) =>
      placed.find((p) => r.x < p.x + p.w + 6 && r.x + r.w + 6 > p.x && r.y < p.y + p.h + 6 && r.y + r.h + 6 > p.y)
    for (const { a, ax, ay } of list.sort((x, y) => x.rank - y.rank || y.ay - x.ay)) {
      const { w, h } = a.bubble
      let dx = 0
      let dy = 0
      for (let i = 0; i < 6; i++) {
        const other = hit({ x: ax + dx - w / 2, y: ay + dy - h, w, h })
        if (!other) break
        const right = other.x + other.w + 6 - (ax - w / 2)
        const left = other.x - 6 - w - (ax - w / 2)
        const side = Math.abs(right) < Math.abs(left) ? right : left
        if (Math.abs(side) <= w * 0.42 && dy === 0) dx = side
        else dy = other.y - 6 - ay
      }
      placed.push({ x: ax + dx - w / 2, y: ay + dy - h, w, h })
      a.bubble.el.style.transform = `translate(${ax + dx - w / 2}px, ${ay + dy - h}px)`
      a.bubble.el.style.setProperty('--ax', `${Math.min(w - 14, Math.max(14, w / 2 - dx))}px`)
      a.bubble.el.classList.toggle('is-lifted', dy !== 0)
    }
  }

  private stepConfetti(now: number) {
    this.confetti = this.confetti.filter((c) => {
      const f = (now - c.t0) / 1400
      if (f >= 1) {
        c.el.remove()
        return false
      }
      const s = f * 1.4
      c.el.setAttribute('x', String(c.x + c.vx * s))
      c.el.setAttribute('y', String(c.y + c.vy * s + 70 * s * s))
      c.el.setAttribute('opacity', String(1 - f))
      return true
    })
  }

  /** Coloca cada bot logo depois do último móvel (que ele cobre na tela) do qual está na frente. */
  private sortDepth() {
    const after = new Map<number, Actor[]>()
    for (const a of this.actors.values()) {
      const [sx, sy] = project(a.pos.x, a.pos.y)
      const bx0 = sx - 20
      const bx1 = sx + 20
      const by0 = sy - a.pos.z - 46
      const by1 = sy + 6
      let idx = -1
      this.pieces.forEach((p, i) => {
        if (p.box.x1 < bx0 || p.box.x0 > bx1 || p.box.y1 < by0 || p.box.y0 > by1) return
        if (pointInFront(a.pos, p.foot)) idx = i
      })
      const list = after.get(idx) ?? []
      list.push(a)
      after.set(idx, list)
    }
    const order: SVGGElement[] = []
    const push = (i: number) => {
      for (const a of (after.get(i) ?? []).sort((x, y) => x.pos.x + x.pos.y - (y.pos.x + y.pos.y))) order.push(a.g)
    }
    push(-1)
    this.pieces.forEach((p, i) => {
      order.push(p.g)
      push(i)
    })
    order.forEach((g, i) => {
      if (this.objs.children[i] !== g) this.objs.insertBefore(g, this.objs.children[i] ?? null)
    })
  }

  private skyHour = -1
  private paintSky(hour: number) {
    if (hour === this.skyHour || !this.sky.length) return
    this.skyHour = hour
    const palette =
      hour >= 7 && hour < 17 ? ['#5d8fd0', '#8fb8e6', '#cfe3f5'] : hour >= 17 && hour < 19 ? ['#2b3a5c', '#7a4f6b', '#e0915a'] : hour >= 5 && hour < 7 ? ['#3a4a73', '#b07a8a', '#f2b37a'] : ['#0b1222', '#141f38', '#22304f']
    this.sky.forEach((s, i) => s.setAttribute('stop-color', palette[i]))
  }
}
