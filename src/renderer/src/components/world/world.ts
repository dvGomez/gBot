/**
 * Simulação simples (sem dependências) que posiciona o mapa da home:
 *   - projetos são "ilhas" quadradas que se empurram e ficam perto do centro;
 *   - bots de um projeto ficam presos dentro da ilha dele;
 *   - bots soltos flutuam fora das ilhas.
 * As colisões são resolvidas por posição, então o mapa nunca fica com nada sobreposto.
 */

export type BodyKind = 'zone' | 'bot'

export interface Body {
  id: string
  kind: BodyKind
  /** Raio de colisão; nas ilhas, metade do lado do quadrado. */
  r: number
  x: number
  y: number
  vx: number
  vy: number
  /** Ilha (projeto) em que o bot mora. */
  zone?: string
  /** Sendo arrastado: fica onde o mouse está e a física não mexe nele. */
  pinned?: boolean
}

export interface BodySpec {
  id: string
  kind: BodyKind
  r: number
  zone?: string
}

export const BOT_R = 52
const PAD = 12
/** Até onde o centro de um bot pode chegar das bordas da ilha (o nome do projeto ocupa o topo). */
const INSET_X = 60
const INSET_TOP = 92
const INSET_BOTTOM = 42
/** Os bots são puxados um pouco abaixo do centro, longe do nome do projeto. */
const ZONE_LABEL = 22

/** Metade do lado da ilha, para caber os bots do projeto. */
export const zoneHalf = (members: number) => (members === 0 ? 80 : 44 + 60 * Math.sqrt(members))

/** Número estável entre 0 e 1 a partir de um texto (posições iniciais e fases das animações). */
export function hash(s: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

/** Altura que cabe tudo com folga, para a largura dada. */
export function fitHeight(specs: BodySpec[], width: number): number {
  const area = specs
    .filter((s) => !s.zone)
    .reduce((sum, s) => sum + (s.kind === 'zone' ? (2 * s.r + PAD * 2) ** 2 : Math.PI * (s.r + PAD * 2) ** 2), 0)
  const biggest = Math.max(0, ...specs.map((s) => s.r * 2 + 40))
  return Math.round(Math.min(980, Math.max(440, biggest, (area * 1.6) / Math.max(width, 1))))
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/** Quanto `q` precisa se afastar de `p` para os dois não se sobreporem (undefined = já estão longe). */
function separation(p: Body, q: Body): [number, number] | undefined {
  const dx = q.x - p.x
  const dy = q.y - p.y

  // Ilha com ilha: dois quadrados; afasta pelo eixo de menor sobreposição.
  if (p.kind === 'zone' && q.kind === 'zone') {
    const ox = p.r + q.r + PAD - Math.abs(dx)
    const oy = p.r + q.r + PAD - Math.abs(dy)
    if (ox <= 0 || oy <= 0) return undefined
    return ox < oy ? [ox * (dx < 0 ? -1 : 1), 0] : [0, oy * (dy < 0 ? -1 : 1)]
  }

  // Ilha com bot: círculo contra quadrado.
  if (p.kind === 'zone' || q.kind === 'zone') {
    const [z, c, sign] = p.kind === 'zone' ? [p, q, 1] : [q, p, -1]
    const min = c.r + PAD
    const nx = clamp(c.x, z.x - z.r, z.x + z.r)
    const ny = clamp(c.y, z.y - z.r, z.y + z.r)
    const ex = c.x - nx
    const ey = c.y - ny
    const d = Math.hypot(ex, ey)
    if (d >= min) return undefined
    if (d > 0) return [(ex / d) * (min - d) * sign, (ey / d) * (min - d) * sign]
    // Centro dentro do quadrado: sai pelo lado mais perto.
    const sides: [number, number, number][] = [
      [c.x - (z.x - z.r), -1, 0],
      [z.x + z.r - c.x, 1, 0],
      [c.y - (z.y - z.r), 0, -1],
      [z.y + z.r - c.y, 0, 1]
    ]
    const [pen, sx, sy] = sides.reduce((a, b) => (b[0] < a[0] ? b : a))
    return [sx * (pen + min) * sign, sy * (pen + min) * sign]
  }

  // Bot com bot: dois círculos.
  let ux = dx
  let uy = dy
  let d = Math.hypot(dx, dy)
  const min = p.r + q.r + PAD
  if (d >= min) return undefined
  if (d < 0.01) {
    ux = hash(p.id + q.id) - 0.5
    uy = hash(q.id + p.id) - 0.5
    d = Math.hypot(ux, uy)
  }
  return [(ux / d) * (min - d), (uy / d) * (min - d)]
}

export class World {
  bodies = new Map<string, Body>()
  members = new Map<string, Body[]>()
  width = 0
  height = 0
  alpha = 1

  /** Atualiza o que existe no mapa, mantendo onde já estava quem continua. */
  sync(specs: BodySpec[], width: number, height: number) {
    const sx = this.width ? width / this.width : 1
    const sy = this.height ? height / this.height : 1
    this.width = width
    this.height = height
    const next = new Map<string, Body>()
    const fresh: Body[] = []

    for (const s of specs) {
      const old = this.bodies.get(s.id)
      if (old) {
        next.set(s.id, { ...old, r: s.r, zone: s.zone, x: old.x * sx, y: old.y * sy })
      } else {
        const b: Body = { ...s, x: 0, y: 0, vx: 0, vy: 0 }
        next.set(s.id, b)
        fresh.push(b)
      }
    }
    this.bodies = next
    this.members = new Map()
    for (const b of next.values()) if (b.zone) this.members.set(b.zone, [...(this.members.get(b.zone) ?? []), b])

    // Lugar inicial: ilhas espalhadas na horizontal, bots de projeto dentro delas, os soltos onde der.
    const zones = specs.filter((s) => s.kind === 'zone')
    for (const b of fresh.filter((f) => f.kind === 'zone')) {
      const i = zones.findIndex((z) => z.id === b.id)
      b.x = (width * (i + 0.5)) / Math.max(zones.length, 1)
      b.y = height * (0.4 + (i % 2) * 0.2)
    }
    for (const b of fresh.filter((f) => f.kind === 'bot')) {
      const z = b.zone ? next.get(b.zone) : undefined
      if (z) {
        const ang = hash(b.id) * Math.PI * 2
        const dist = Math.max(0, z.r - INSET_X) * 0.6
        b.x = z.x + Math.cos(ang) * dist
        b.y = z.y + ZONE_LABEL + Math.sin(ang) * dist
      } else {
        b.x = width * (0.1 + 0.8 * hash(b.id, 1))
        b.y = height * (0.15 + 0.7 * hash(b.id, 2))
      }
    }

    this.alpha = fresh.length || sx !== 1 || sy !== 1 ? 1 : Math.max(this.alpha, 0.3)
    // Assenta antes de desenhar, para não abrir a tela com tudo embolado.
    if (fresh.length) for (let i = 0; i < 360; i++) this.step()
  }

  private move(b: Body, dx: number, dy: number) {
    b.x += dx
    b.y += dy
    if (b.kind === 'zone') for (const m of this.members.get(b.id) ?? []) {
      if (m.pinned) continue
      m.x += dx
      m.y += dy
    }
  }

  /** Ilha sob o ponto (coordenadas do mapa). */
  zoneAt(x: number, y: number): Body | undefined {
    for (const b of this.bodies.values()) {
      if (b.kind === 'zone' && Math.abs(x - b.x) <= b.r && Math.abs(y - b.y) <= b.r) return b
    }
    return undefined
  }

  step() {
    const list = [...this.bodies.values()]
    const a = this.alpha
    const cx = this.width / 2
    const cy = this.height / 2

    if (a > 0.002) {
      for (const b of list) {
        const z = b.zone ? this.bodies.get(b.zone) : undefined
        if (z) {
          b.vx += (z.x - b.x) * 0.02 * a
          b.vy += (z.y + ZONE_LABEL - b.y) * 0.02 * a
        } else {
          const g = b.kind === 'zone' ? 0.01 : 0.006
          b.vx += (cx - b.x) * g * a * 0.4
          b.vy += (cy - b.y) * g * a
        }
      }
    }

    for (const b of list) {
      b.vx *= 0.6
      b.vy *= 0.6
      if (!b.pinned) this.move(b, b.vx, b.vy)
    }

    // Colisões: entre coisas soltas (ilhas e bots soltos) e entre bots da mesma ilha.
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i]
        const q = list[j]
        if (p.pinned || q.pinned || ((p.zone || q.zone) && p.zone !== q.zone)) continue
        const sep = separation(p, q)
        if (!sep) continue
        const mp = p.r * p.r
        const mq = q.r * q.r
        const wp = mq / (mp + mq)
        this.move(p, -sep[0] * wp, -sep[1] * wp)
        this.move(q, sep[0] * (1 - wp), sep[1] * (1 - wp))
      }
    }

    for (const b of list) {
      if (b.pinned) continue
      const z = b.zone ? this.bodies.get(b.zone) : undefined
      if (z) {
        // Bot de projeto não sai da ilha.
        const x = clamp(b.x, z.x - z.r + INSET_X, Math.max(z.x - z.r + INSET_X, z.x + z.r - INSET_X))
        const y = clamp(b.y, z.y - z.r + INSET_TOP, Math.max(z.y - z.r + INSET_TOP, z.y + z.r - INSET_BOTTOM))
        b.x = x
        b.y = y
        continue
      }
      // Bordas: bots precisam de espaço em cima para o nome.
      const top = b.kind === 'zone' ? b.r + 8 : b.r + 20
      const x = clamp(b.x, b.r + 8, Math.max(b.r + 8, this.width - b.r - 8))
      const y = clamp(b.y, top, Math.max(top, this.height - b.r - 8))
      if (x !== b.x || y !== b.y) this.move(b, x - b.x, y - b.y)
    }

    this.alpha *= 0.992
  }
}
