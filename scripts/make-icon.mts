/**
 * Gera build/icon.png (1024×1024) a partir do avatar em pixel art.
 * Uso: node scripts/make-icon.mts [avatarId]
 */
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { getAvatar, renderAvatar } from '../src/renderer/src/avatars/sprites.ts'

const SIZE = 1024
const MARGIN = 100 // área útil do ícone no macOS: 824px
const RADIUS = 185
const BG = [0x14, 0x14, 0x14]

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const px = new Uint8Array(SIZE * SIZE * 4)

function insideRounded(x: number, y: number) {
  const lo = MARGIN
  const hi = SIZE - MARGIN
  if (x < lo || y < lo || x >= hi || y >= hi) return false
  const cx = Math.min(Math.max(x, lo + RADIUS), hi - RADIUS)
  const cy = Math.min(Math.max(y, lo + RADIUS), hi - RADIUS)
  return (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2
}

for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    if (!insideRounded(x, y)) continue
    const i = (y * SIZE + x) * 4
    px.set([...BG, 255], i)
  }

const avatar = getAvatar(process.argv[2] ?? 'brasa')
const CELL = 46
const ox = Math.round((SIZE - 12 * CELL) / 2)
const oy = Math.round((SIZE - 13 * CELL) / 2)
for (const p of renderAvatar(avatar, 'idle', 5)) {
  const [r, g, b] = hex(p.color)
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) px.set([r, g, b, 255], ((oy + p.y * CELL + y) * SIZE + ox + p.x * CELL + x) * 4)
}

// PNG mínimo (RGBA, sem filtro)
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
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr.set([8, 6, 0, 0, 0], 8)
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) raw.set(px.subarray(y * SIZE * 4, (y + 1) * SIZE * 4), y * (SIZE * 4 + 1) + 1)

writeFileSync(
  'build/icon.png',
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
)
console.log(`build/icon.png gerado com o avatar ${avatar.name}`)
