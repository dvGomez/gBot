import type { AvatarMood } from '@shared/types'

/**
 * Avatares em pixel art, desenhados como texto numa grade 12×12:
 *   `.` vazio · `b` corpo · `d` sombra
 * Olhos e boca são desenhados por cima, de acordo com o humor (ver `renderAvatar`).
 */
export interface AvatarDef {
  id: string
  name: string
  personality: string
  color: string
  shade: string
  /** Linha dos olhos e da boca dentro da grade. */
  eyeRow: number
  mouthRow: number
  sprite: string[]
}

export const AVATARS: AvatarDef[] = [
  {
    id: 'brasa',
    name: 'Brasa',
    personality: 'Energético e direto ao ponto',
    color: '#F08A4B',
    shade: '#C9652A',
    eyeRow: 6,
    mouthRow: 9,
    sprite: [
      '.....b......',
      '....bb......',
      '....bbb..b..',
      '...bbbb.bb..',
      '..bbbbbbbb..',
      '..bbbbbbbbb.',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbd',
      '.bbbbbbbbdd.',
      '..ddddddd...'
    ]
  },
  {
    id: 'nuvem',
    name: 'Nuvem',
    personality: 'Calmo e paciente',
    color: '#5B8DEF',
    shade: '#3B6BD0',
    eyeRow: 4,
    mouthRow: 8,
    sprite: [
      '....bbbb....',
      '..bbbbbbbb..',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbd',
      '.bbbbbbbbbd.',
      '.bbbbbbbbdd.',
      '..bbbbbddd..',
      '....dddd....'
    ]
  },
  {
    id: 'eco',
    name: 'Eco',
    personality: 'Curioso e brincalhão',
    color: '#3DBE8B',
    shade: '#259A6C',
    eyeRow: 4,
    mouthRow: 8,
    sprite: [
      '...bbbbbb...',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbd',
      'bbbbbbbbbbdd',
      'bbb.bbbb.bdd',
      '.b...bb...d.'
    ]
  },
  {
    id: 'bit',
    name: 'Bit',
    personality: 'Metódico e preciso',
    color: '#9B7BF0',
    shade: '#7656D6',
    eyeRow: 5,
    mouthRow: 9,
    sprite: [
      '.....dd.....',
      '.....bb.....',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbd',
      '.bbbbbbbbbd.',
      '.bbbbbbbbdd.',
      '..dd....dd..'
    ]
  }
]

export const DEFAULT_AVATAR_ID = AVATARS[0].id

export function getAvatar(id: string): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0]
}

export const MOOD_LABELS: Record<AvatarMood, string> = {
  idle: 'Ocioso',
  thinking: 'Pensando',
  talking: 'Falando',
  happy: 'Feliz',
  attention: 'Atenção'
}

const EYE = '#141414'
const SHINE = '#FFFFFF'

export interface Pixel {
  x: number
  y: number
  color: string
}

/**
 * Calcula os pixels de um quadro da animação.
 * `tick` avança a cada ~120ms; `seed` desencontra a piscada entre avatares diferentes.
 */
export function renderAvatar(avatar: AvatarDef, mood: AvatarMood, tick: number, seed = 0): Pixel[] {
  const face = new Map<string, string>()
  const set = (r: number, c: number, color = EYE) => face.set(`${r},${c}`, color)
  const E = avatar.eyeRow
  const M = avatar.mouthRow
  const k = tick + seed * 7
  const blink = (mood === 'idle' || mood === 'talking') && k % 30 < 2

  // Olhos
  if (mood === 'happy') {
    for (const [r, c] of [[E, 3], [E, 4], [E, 7], [E, 8], [E + 1, 2], [E + 1, 5], [E + 1, 6], [E + 1, 9]]) set(r, c)
  } else if (blink) {
    for (const c of [3, 4, 7, 8]) set(E + 1, c)
  } else {
    const [dr, dc] = mood === 'thinking' ? [-1, 1] : [0, 0]
    for (const c0 of [3, 7]) {
      const r = E + dr
      const c = c0 + dc
      set(r, c, SHINE)
      set(r, c + 1)
      set(r + 1, c)
      set(r + 1, c + 1)
    }
  }

  // Boca
  if (mood === 'idle') {
    set(M, 5)
    set(M, 6)
  } else if (mood === 'thinking') {
    set(M, 6)
    set(M, 7)
  } else if (mood === 'talking') {
    set(M, 5)
    set(M, 6)
    if (Math.floor(tick / 2) % 3 !== 0) {
      set(M + 1, 5)
      set(M + 1, 6)
    }
  } else if (mood === 'happy') {
    set(M - 1, 4)
    set(M - 1, 7)
    set(M, 5)
    set(M, 6)
  } else if (mood === 'attention') {
    set(M, 5)
    set(M, 6)
    set(M + 1, 5)
    set(M + 1, 6)
  }

  // Pulinho (bob) para dar vida
  let bob = 0
  if (mood === 'idle') bob = Math.floor((tick + seed * 3) / 6) % 2
  else if (mood === 'happy') bob = Math.floor(tick / 2) % 2
  else if (mood === 'talking') bob = Math.floor(tick / 3) % 2
  else if (mood === 'attention') bob = tick % 2

  const pixels: Pixel[] = []
  avatar.sprite.forEach((row, r) => {
    ;[...row].forEach((ch, c) => {
      if (ch === '.') return
      const color = face.get(`${r},${c}`) ?? (ch === 'd' ? avatar.shade : avatar.color)
      pixels.push({ x: c, y: r + 1 - bob, color })
    })
  })
  return pixels
}
