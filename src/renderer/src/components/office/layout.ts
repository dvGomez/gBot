/**
 * Planta do escritório da página inicial, sem DOM: uma sala por projeto (mesas em fileiras), um corredor e as áreas
 * comuns na frente (descanso, sala de reunião e copa). Também calcula os caminhos entre os lugares: todo lugar tem uma
 * saída que leva até o corredor por um trecho livre de móveis, então qualquer trajeto é "saída de A → corredor → saída
 * de B ao contrário".
 *
 * Coordenadas em ladrilhos: x cresce para a direita-baixo, y para a esquerda-baixo (visão isométrica). As paredes ficam
 * em y = 0 (fundo) e x = 0 (esquerda).
 */

export interface Pt {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  d: number
}

/** Lugar onde um bot fica parado. */
export interface Spot extends Pt {
  key: string
  /** Altura do bot no lugar (sentado numa cadeira ou sofá). */
  z: number
  /** Do lugar até o corredor, por trechos livres (sem o próprio lugar). */
  exit: Pt[]
}

export type Tone =
  | 'desk' | 'chair' | 'laptop' | 'paper' | 'mug' | 'table' | 'sofa' | 'sofaBack'
  | 'counter' | 'machine' | 'fridge' | 'pot' | 'glass' | 'green' | 'shelf'

export interface BoxSpec extends Rect {
  h: number
  z?: number
  tone: Tone
  /** Cor própria (ex.: pufe); as faces laterais são escurecidas a partir dela. */
  color?: string
}

/** Móvel desenhado como um bloco só (a ordem de desenho é decidida por ele inteiro). */
export interface Piece {
  id: string
  /** Pegada no chão, para decidir quem fica na frente. */
  foot: Rect
  boxes: BoxSpec[]
  /** Mesa de um bot: a luz do notebook acende quando ele trabalha. */
  desk?: { botId: string; x: number; y: number }
  plant?: { x: number; y: number; s: number }
}

export interface RoomSpec {
  id: string
  name: string
  color: string
  botIds: string[]
}

export interface Room {
  id: string
  name: string
  color: string
  count: number
  x: number
  w: number
}

export interface Seat extends Spot {
  /** Coluna livre à direita da mesa: é por ela que se chega e se sai. */
  gapX: number
}

export interface OfficeLayout {
  /** Largura (x) e profundidade (y) do piso. */
  W: number
  D: number
  /** Fundo das salas dos projetos. */
  roomsDepth: number
  corridorY: number
  /** Começo das áreas comuns. */
  commonY: number
  rooms: Room[]
  seats: Record<string, Seat>
  lounge: Spot[]
  meeting: Spot[]
  coffee: Spot[]
  pieces: Piece[]
  /** Divisórias de vidro entre as salas (x da divisória). */
  partitions: number[]
  /** Áreas onde ninguém pode andar (para os testes dos caminhos). */
  obstacles: Rect[]
  /** Nomes escritos no chão. */
  floorLabels: { key: 'lounge' | 'meeting' | 'coffee'; x: number; y: number }[]
  windows: { x0: number; x1: number }[]
  clockX: number
}

const MARGIN = 0.6
const PITCH = 3
const MAX_COLS = 4
const ROW0 = 1.9
const ROW_PITCH = 3
const DESK_W = 2
const DESK_D = 0.9
const ROOM_GAP = 0.4
const MIN_W = 14
const SEAT_Z = 9

/** Monta a planta para as salas dadas (uma por projeto, mais a dos bots sem projeto). */
export function buildLayout(specs: RoomSpec[]): OfficeLayout {
  const rooms: Room[] = []
  const seats: Record<string, Seat> = {}
  const pieces: Piece[] = []
  const obstacles: Rect[] = []
  const partitions: number[] = []
  const desks: { botId: string; x: number; y: number }[] = []

  let x = 0
  let maxRows = 1
  for (const spec of specs) {
    const n = Math.max(1, spec.botIds.length)
    const cols = Math.min(MAX_COLS, n)
    const rows = Math.ceil(n / cols)
    maxRows = Math.max(maxRows, rows)
    const w = MARGIN + cols * PITCH
    rooms.push({ id: spec.id, name: spec.name, color: spec.color, count: spec.botIds.length, x, w })
    spec.botIds.forEach((botId, i) => {
      desks.push({ botId, x: x + MARGIN + (i % cols) * PITCH, y: ROW0 + Math.floor(i / cols) * ROW_PITCH })
    })
    x += w + ROOM_GAP
  }
  const roomsW = Math.max(0, x - ROOM_GAP)
  const W = Math.max(MIN_W, Math.ceil(roomsW + 0.4))
  const roomsDepth = ROW0 + (maxRows - 1) * ROW_PITCH + DESK_D + 1.3
  const corridorY = roomsDepth + 0.55
  const commonY = corridorY + 0.95
  const D = commonY + 4.6

  // Mesas: cadeira atrás (o bot senta de frente para quem olha), notebook virado para ele, caneca e papéis
  for (const desk of desks) {
    const seat: Seat = {
      key: `seat:${desk.botId}`,
      x: desk.x + 1,
      y: desk.y - 0.75,
      z: SEAT_Z,
      gapX: desk.x + DESK_W + 0.5,
      exit: []
    }
    seat.exit = [{ x: seat.gapX, y: seat.y }, { x: seat.gapX, y: corridorY }]
    seats[desk.botId] = seat
    pieces.push({
      id: `chair:${desk.botId}`,
      foot: { x: seat.x - 0.3, y: seat.y - 0.42, w: 0.6, d: 0.72 },
      boxes: [
        { x: seat.x - 0.32, y: seat.y - 0.42, w: 0.64, d: 0.12, h: 30, tone: 'chair' },
        { x: seat.x - 0.3, y: seat.y - 0.3, w: 0.6, d: 0.6, h: SEAT_Z, tone: 'chair' }
      ]
    })
    const foot = { x: desk.x, y: desk.y, w: DESK_W, d: DESK_D }
    obstacles.push(foot)
    pieces.push({
      id: `desk:${desk.botId}`,
      foot,
      desk,
      boxes: [
        { ...foot, h: 18, tone: 'desk' },
        { x: desk.x + 0.65, y: desk.y + 0.2, w: 0.7, d: 0.06, h: 15, z: 18, tone: 'laptop' },
        { x: desk.x + 1.55, y: desk.y + 0.45, w: 0.18, d: 0.18, h: 7, z: 18, tone: 'mug' },
        { x: desk.x + 0.2, y: desk.y + 0.4, w: 0.35, d: 0.3, h: 1.5, z: 18, tone: 'paper' }
      ]
    })
  }

  // Divisórias de vidro entre as salas (param antes do corredor)
  for (const room of rooms.slice(0, -1)) {
    const px = room.x + room.w + ROOM_GAP / 2 - 0.05
    partitions.push(px)
    const foot = { x: px, y: 0, w: 0.1, d: roomsDepth - 0.9 }
    obstacles.push(foot)
    pieces.push({ id: `glass:${room.id}`, foot, boxes: [{ ...foot, h: 46, tone: 'glass' }] })
  }

  // ── Descanso: sofá encostado na parede esquerda e dois pufes ──
  const y0 = commonY
  const sofa = { x: 0.5, y: y0 + 0.3, w: 1.1, d: 3.2 }
  obstacles.push({ x: sofa.x, y: sofa.y, w: 0.3, d: sofa.d })
  pieces.push({
    id: 'sofa',
    foot: sofa,
    boxes: [
      { ...sofa, h: SEAT_Z, tone: 'sofa' },
      { x: sofa.x, y: sofa.y, w: 0.3, d: sofa.d, h: 22, tone: 'sofaBack' },
      { x: sofa.x + 0.3, y: sofa.y, w: 0.8, d: 0.22, h: 15, tone: 'sofaBack' },
      { x: sofa.x + 0.3, y: sofa.y + sofa.d - 0.22, w: 0.8, d: 0.22, h: 15, tone: 'sofaBack' }
    ]
  })
  const lounge: Spot[] = [0.85, 1.9, 2.95].map((dy, i) => ({
    key: `lounge:${i}`,
    x: 1.25,
    y: y0 + dy,
    z: SEAT_Z,
    exit: [{ x: 2.1, y: y0 + dy }, { x: 2.1, y: corridorY }]
  }))
  ;[
    { x: 2.8, color: '#e3a02b' },
    { x: 3.7, color: '#5b8def' }
  ].forEach((bean, i) => {
    const foot = { x: bean.x - 0.35, y: y0 + 3.0, w: 0.7, d: 0.7 }
    pieces.push({ id: `bean:${i}`, foot, boxes: [{ ...foot, h: 7, tone: 'sofa', color: bean.color }] })
    lounge.push({ key: `lounge:${3 + i}`, x: bean.x, y: y0 + 3.35, z: 7, exit: [{ x: bean.x, y: corridorY }] })
  })

  // ── Sala de reunião: quem espera você fica atrás da mesa, de frente ──
  const table = { x: 5.2, y: y0 + 1.3, w: 3.6, d: 1.4 }
  obstacles.push(table)
  pieces.push({
    id: 'meeting',
    foot: table,
    boxes: [
      { ...table, h: 16, tone: 'table' },
      { x: 6.1, y: table.y + 0.4, w: 0.5, d: 0.4, h: 1.5, z: 16, tone: 'paper' },
      { x: 7.3, y: table.y + 0.6, w: 0.4, d: 0.3, h: 1.5, z: 16, tone: 'paper' }
    ]
  })
  const sideChair = { x: 9.0, y: table.y + 0.45, w: 0.5, d: 0.5 }
  obstacles.push(sideChair)
  pieces.push({ id: 'meeting-chair', foot: sideChair, boxes: [{ ...sideChair, h: SEAT_Z, tone: 'chair' }] })
  const meetingXs = [5.6, 6.5, 7.4, 8.3]
  const meeting: Spot[] = [
    ...meetingXs.map((mx, i) => ({ key: `meeting:${i}`, x: mx, y: y0 + 0.65, z: 0, exit: [{ x: mx, y: corridorY }] })),
    ...meetingXs.map((mx, i) => ({
      key: `meeting:${4 + i}`,
      x: mx,
      y: y0 + 3.35,
      z: 0,
      exit: [{ x: 4.6, y: y0 + 3.35 }, { x: 4.6, y: corridorY }]
    }))
  ]

  // ── Copa: balcão com cafeteira e geladeira; quem acabou uma tarefa toma café na frente ──
  const counter = { x: W - 4.0, y: y0 + 0.3, w: 2.6, d: 0.9 }
  const fridge = { x: W - 1.2, y: y0 + 0.25, w: 0.85, d: 0.85 }
  obstacles.push(counter, fridge)
  pieces.push({
    id: 'counter',
    foot: counter,
    boxes: [
      { ...counter, h: 22, tone: 'counter' },
      { x: counter.x + 0.3, y: counter.y + 0.1, w: 0.55, d: 0.5, h: 18, z: 22, tone: 'machine' },
      { x: counter.x + 1.0, y: counter.y + 0.4, w: 0.18, d: 0.18, h: 6, z: 22, tone: 'mug' },
      { x: counter.x + 1.5, y: counter.y + 0.2, w: 0.6, d: 0.5, h: 4, z: 22, tone: 'green' }
    ]
  })
  pieces.push({ id: 'fridge', foot: fridge, boxes: [{ ...fridge, h: 46, tone: 'fridge' }] })
  const coffee: Spot[] = [1.8, 2.8].flatMap((dy, row) =>
    [3.5, 2.6, 1.7].map((dx, i) => ({
      key: `coffee:${row * 3 + i}`,
      x: W - dx,
      y: y0 + dy,
      z: 0,
      exit: [{ x: W - 4.4, y: y0 + dy }, { x: W - 4.4, y: corridorY }]
    }))
  )

  // Plantas nos cantos e uma estante no espaço que sobrar à direita das salas
  const plant = (id: string, px: number, py: number, s = 1) => {
    const foot = { x: px - 0.2, y: py - 0.2, w: 0.4, d: 0.4 }
    obstacles.push(foot)
    pieces.push({ id, foot, plant: { x: px, y: py, s }, boxes: [{ ...foot, h: 12, tone: 'pot' }] })
  }
  plant('plant:back-right', W - 0.4, 0.45)
  plant('plant:front-left', 0.5, D - 0.5, 0.9)
  plant('plant:front-mid', W - 4.8, D - 0.5, 0.9)
  if (W - roomsW > 2.2) {
    const foot = { x: W - 1.6, y: 1.2, w: 1.1, d: 0.5 }
    obstacles.push(foot)
    pieces.push({ id: 'shelf', foot, boxes: [{ ...foot, h: 52, tone: 'shelf' }] })
  }

  const windows = rooms.map((r) => {
    const span = Math.min(3.2, r.w - 1)
    const mid = r.x + r.w / 2
    return { x0: mid - span / 2, x1: mid + span / 2 }
  })
  const clockX = partitions[0] ?? Math.min(W - 1.5, roomsW + 1)

  return {
    W,
    D,
    roomsDepth,
    corridorY,
    commonY,
    rooms,
    seats,
    lounge,
    meeting,
    coffee,
    pieces,
    partitions,
    obstacles,
    floorLabels: [
      { key: 'lounge', x: 0.5, y: D - 0.25 },
      { key: 'meeting', x: 5.2, y: D - 0.45 },
      { key: 'coffee', x: W - 3.8, y: D - 0.45 }
    ],
    windows,
    clockX
  }
}

/** Lugar em pé ao lado da mesa de um bot, para quem vem conversar com ele (`k` = quantos já estão lá). */
export function visitSpot(seat: Seat, corridorY: number, k = 0): Spot {
  return { key: `${seat.key}:visit:${k}`, x: seat.gapX, y: seat.y + k * 0.55, z: 0, exit: [{ x: seat.gapX, y: corridorY }] }
}

/** Caminho de um lugar até outro, passando pelo corredor. Vazio quando é o mesmo lugar. */
export function route(from: Spot, to: Spot): Pt[] {
  if (from.key === to.key) return []
  const pts: Pt[] = [from, ...from.exit, ...[...to.exit].reverse(), to].map((p) => ({ x: p.x, y: p.y }))
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6)
}

/**
 * Novo caminho para quem muda de destino no meio do trajeto: volta ou segue pelo próprio caminho até o corredor
 * (sempre por trechos livres) e de lá vai ao novo lugar. `seg` é o trecho em que o bot está agora.
 */
export function reroute(path: Pt[], seg: number, at: Pt, to: Spot, corridorY: number): Pt[] | undefined {
  const onCorridor = (p: Pt) => Math.abs(p.y - corridorY) < 1e-6
  let lead: Pt[] = []
  if (!onCorridor(at)) {
    const ahead = path.slice(seg + 1)
    const behind = path.slice(0, seg + 1).reverse()
    const fwd = ahead.findIndex(onCorridor)
    const back = behind.findIndex(onCorridor)
    const options = [fwd >= 0 ? ahead.slice(0, fwd + 1) : undefined, back >= 0 ? behind.slice(0, back + 1) : undefined].filter(
      (o): o is Pt[] => !!o
    )
    if (!options.length) return undefined
    lead = options.sort((a, b) => pathLength([at, ...a]) - pathLength([at, ...b]))[0]
  }
  const pts: Pt[] = [at, ...lead, ...[...to.exit].reverse(), to].map((p) => ({ x: p.x, y: p.y }))
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6)
}

/** Comprimento de um caminho, em ladrilhos. */
export function pathLength(pts: Pt[]): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return total
}

/** Ponto a uma fração (0–1) do caminho, para que lado está andando (na tela) e em qual trecho está. */
export function pointAlong(pts: Pt[], f: number): Pt & { dir: number; seg: number } {
  if (pts.length < 2) return { ...(pts[0] ?? { x: 0, y: 0 }), dir: 0, seg: 0 }
  let dist = Math.min(1, Math.max(0, f)) * pathLength(pts)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (dist <= len || i === pts.length - 1) {
      const k = len ? Math.min(1, dist / len) : 1
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dir: b.x - a.x - (b.y - a.y), seg: i - 1 }
    }
    dist -= len
  }
  return { ...pts[pts.length - 1], dir: 0, seg: pts.length - 2 }
}

/**
 * Quem fica na frente na tela: um ponto (o bot) está atrás de um móvel quando não passou da frente dele em nenhum dos
 * dois eixos e está antes dele em pelo menos um. Em cima do móvel (sentado no sofá) conta como na frente.
 */
export function pointInFront(p: Pt, r: Rect): boolean {
  if (p.x >= r.x + r.w || p.y >= r.y + r.d) return true
  return !(p.x <= r.x || p.y <= r.y)
}
