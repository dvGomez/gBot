/**
 * Gera o ícone do app e as imagens da marca a partir do avatar em pixel art (o Brasa, por padrão).
 *
 *   build/icon.png              ícone do app (1024×1024, o electron-builder gera o .icns/.ico a partir dele)
 *   brand/gbot-icon-{1024,512,256}.png
 *   brand/gbot-icon.svg         ícone em vetor
 *   brand/gbot-mascote.png      só o mascote, fundo transparente (1024×1024)
 *   brand/gbot-mascote.svg      só o mascote, em vetor
 *
 * Uso: node scripts/make-icon.mts [avatarId]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { getAvatar, renderAvatar, type Pixel } from '../src/renderer/src/avatars/sprites.ts'

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

const avatar = getAvatar(process.argv[2] ?? 'brasa')
const pixels = renderAvatar(avatar, 'idle', 5)
const GLOW = hex(avatar.color)

// Geometria no grid de 1024 do macOS: área útil de 824px com cantos arredondados.
const BOX = 412 // meia largura da caixa
const RADIUS = 185
const CELL = 40 // tamanho de cada "pixel" do mascote
const SHADOW_Y = 10
const SHADOW_BLUR = 26

/** Distância até a borda da caixa arredondada (negativa dentro). */
function boxDistance(x: number, y: number) {
  const qx = Math.abs(x - 512) - (BOX - RADIUS)
  const qy = Math.abs(y - 512) - (BOX - RADIUS)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RADIUS
}

/** Canvas RGBA em ponto flutuante com composição "over". */
class Canvas {
  size: number
  px: Float32Array
  constructor(size: number) {
    this.size = size
    this.px = new Float32Array(size * size * 4)
  }
  blend(x: number, y: number, [r, g, b]: RGB, a: number) {
    if (a <= 0) return
    const i = (y * this.size + x) * 4
    const da = this.px[i + 3]
    const oa = a + da * (1 - a)
    const mix = (s: number, d: number) => (s * a + d * da * (1 - a)) / oa
    this.px[i] = mix(r, this.px[i])
    this.px[i + 1] = mix(g, this.px[i + 1])
    this.px[i + 2] = mix(b, this.px[i + 2])
    this.px[i + 3] = oa
  }
  png() {
    const { size } = this
    const raw = Buffer.alloc(size * (size * 4 + 1))
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        const o = y * (size * 4 + 1) + 1 + x * 4
        raw[o] = Math.round(this.px[i])
        raw[o + 1] = Math.round(this.px[i + 1])
        raw[o + 2] = Math.round(this.px[i + 2])
        raw[o + 3] = Math.round(this.px[i + 3] * 255)
      }
    return encodePng(size, raw)
  }
}

/** Mascote centralizado; `scale` converte do grid de 1024 para o tamanho final. */
function drawMascot(c: Canvas, scale: number, cell: number, withShadow: boolean) {
  const cols = 12
  const rows = 12
  const ox = Math.round((c.size - cols * cell) / 2)
  const oy = Math.round((c.size - rows * cell) / 2 + 18 * scale)
  if (withShadow) {
    // Sombra suave no "chão", embaixo do mascote.
    const cx = c.size / 2
    const cy = oy + rows * cell + 6 * scale
    const rx = cols * cell * 0.42
    const ry = 26 * scale
    for (let y = Math.floor(cy - ry * 2); y < cy + ry * 2; y++)
      for (let x = Math.floor(cx - rx * 2); x < cx + rx * 2; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        c.blend(x, y, [0, 0, 0], 0.45 * Math.exp(-d * 1.6))
      }
  }
  for (const p of pixels)
    for (let y = 0; y < cell; y++)
      for (let x = 0; x < cell; x++) c.blend(ox + p.x * cell + x, oy + p.y * cell + y, hex(p.color), 1)
}

function drawIcon(size: number) {
  const c = new Canvas(size)
  const s = size / 1024
  const SS = 3 // supersampling da borda
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const X = (x + 0.5) / s
      const Y = (y + 0.5) / s
      // Sombra da caixa (como os ícones do macOS)
      const ds = boxDistance(X, Y - SHADOW_Y)
      const d = boxDistance(X, Y)
      if (d > -2) c.blend(x, y, [0, 0, 0], 0.32 * clamp(1 - ds / SHADOW_BLUR) ** 2)
      // Cobertura da caixa com antisserrilhado
      if (d > 2 / s) continue
      let cover = 1
      if (d > -2 / s) {
        let n = 0
        for (let j = 0; j < SS; j++)
          for (let i = 0; i < SS; i++) if (boxDistance((x + (i + 0.5) / SS) / s, (y + (j + 0.5) / SS) / s) <= 0) n++
        cover = n / (SS * SS)
      }
      if (!cover) continue
      // Fundo: gradiente vertical escuro + brilho quente atrás do mascote
      const t = clamp((Y - 100) / 824)
      const base: RGB = [0x24 + (0x10 - 0x24) * t, 0x24 + (0x10 - 0x24) * t, 0x24 + (0x10 - 0x24) * t]
      const r = Math.hypot(X - 512, Y - 560) / 380
      const glow = 0.3 * clamp(1 - r) ** 2
      const col = base.map((v, k) => v + (GLOW[k] - v) * glow) as RGB
      // Contorno interno sutil, mais claro em cima
      const edge = clamp(1 + d / 5) * (0.05 + 0.1 * clamp((512 - Y) / 412))
      const final = col.map((v) => v + (255 - v) * edge) as RGB
      c.blend(x, y, final, cover)
    }
  drawMascot(c, s, Math.round(CELL * s), true)
  return c
}

function drawMascotOnly(size: number) {
  const c = new Canvas(size)
  drawMascot(c, size / 1024, Math.floor((size * 0.86) / 12), false)
  return c
}

// ── SVG ──
/** Junta pixels vizinhos da mesma cor numa linha para o SVG ficar pequeno. */
function rects(list: Pixel[], cell: number, ox: number, oy: number) {
  const byRow = new Map<number, Pixel[]>()
  for (const p of list) byRow.set(p.y, [...(byRow.get(p.y) ?? []), p])
  const out: string[] = []
  for (const [y, row] of byRow) {
    row.sort((a, b) => a.x - b.x)
    for (let i = 0; i < row.length; ) {
      let j = i
      while (j + 1 < row.length && row[j + 1].x === row[j].x + 1 && row[j + 1].color === row[i].color) j++
      out.push(`<rect x="${ox + row[i].x * cell}" y="${oy + y * cell}" width="${(j - i + 1) * cell}" height="${cell}" fill="${row[i].color}"/>`)
      i = j + 1
    }
  }
  return out.join('\n  ')
}

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#242424"/><stop offset="1" stop-color="#101010"/></linearGradient>
    <radialGradient id="glow" cx="512" cy="560" r="380" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${avatar.color}" stop-opacity="0.3"/><stop offset="1" stop-color="${avatar.color}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)" shape-rendering="geometricPrecision"/>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#glow)" shape-rendering="geometricPrecision"/>
  ${rects(pixels, CELL, (1024 - 12 * CELL) / 2, (1024 - 12 * CELL) / 2 + 18)}
</svg>
`
const mascotSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">
  ${rects(pixels, 1, 0, 0)}
</svg>
`

// ── PNG mínimo (RGBA, sem filtro) ──
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf: Buffer) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
function encodePng(size: number, raw: Buffer) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

mkdirSync('brand', { recursive: true })
const icon = drawIcon(1024).png()
writeFileSync('build/icon.png', icon)
writeFileSync('brand/gbot-icon-1024.png', icon)
for (const size of [512, 256]) writeFileSync(`brand/gbot-icon-${size}.png`, drawIcon(size).png())
writeFileSync('brand/gbot-icon.svg', iconSvg)
writeFileSync('brand/gbot-mascote.png', drawMascotOnly(1024).png())
writeFileSync('brand/gbot-mascote.svg', mascotSvg)
console.log(`Ícone e imagens da marca gerados com o avatar ${avatar.name}`)
