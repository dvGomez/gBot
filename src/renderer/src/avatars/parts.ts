import { t as tr, localized } from '@/i18n'
import type { AvatarDef } from '@shared/types'

/**
 * Partes para montar avatares: corpo + acessório + paleta. Os avatares prontos usam combinações
 * escolhidas a dedo; `generateAvatar` sorteia uma combinação nova.
 */

interface Body {
  /** Linhas 0–11 da grade; o acessório é desenhado acima de `top`. */
  rows: string[]
  top: number
  eyeRow: number
  mouthRow: number
}

const EMPTY = '............'

const BODIES: Record<string, Body> = {
  round: {
    top: 2,
    eyeRow: 5,
    mouthRow: 8,
    rows: [
      EMPTY,
      EMPTY,
      '....bbbb....',
      '..bbbbbbbb..',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbd',
      '.bbbbbbbbbd.',
      '..bbbbbbdd..',
      '....dddd....'
    ]
  },
  box: {
    top: 2,
    eyeRow: 4,
    mouthRow: 8,
    rows: [
      EMPTY,
      EMPTY,
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbd',
      'bbbbbbbbbbbd',
      '.bbbbbbbbbd.',
      '.dd......dd.'
    ]
  },
  ghost: {
    top: 2,
    eyeRow: 5,
    mouthRow: 8,
    rows: [
      EMPTY,
      EMPTY,
      '...bbbbbb...',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbd',
      'bbbbbbbbbbdd',
      'bbb.bbbb.bdd',
      '.b...bb...d.'
    ]
  },
  bean: {
    top: 2,
    eyeRow: 5,
    mouthRow: 8,
    rows: [
      EMPTY,
      EMPTY,
      '....bbbb....',
      '...bbbbbb...',
      '..bbbbbbbb..',
      '..bbbbbbbb..',
      '..bbbbbbbb..',
      '..bbbbbbbb..',
      '..bbbbbbbd..',
      '..bbbbbbbd..',
      '...bbbbdd...',
      '....dddd....'
    ]
  },
  egg: {
    top: 2,
    eyeRow: 6,
    mouthRow: 9,
    rows: [
      EMPTY,
      EMPTY,
      '....bbbb....',
      '...bbbbbb...',
      '..bbbbbbbb..',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbd',
      'bbbbbbbbbbbd',
      '.bbbbbbbbdd.',
      '..dddddddd..'
    ]
  },
  slime: {
    top: 4,
    eyeRow: 6,
    mouthRow: 9,
    rows: [
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      '....bbbb....',
      '..bbbbbbbb..',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbd',
      'bbbbbbbbbbdd',
      '.dddddddddd.'
    ]
  }
}

/** Acessórios: pixels (linha relativa ao topo do corpo, coluna, tipo). */
type Pixel = [dr: number, col: number, ch: 'b' | 'd' | 'x']
const ACCESSORIES: Record<string, Pixel[]> = {
  none: [],
  antenna: [
    [-1, 5, 'd'],
    [-2, 5, 'x']
  ],
  twin: [
    [-1, 3, 'd'],
    [-1, 8, 'd'],
    [-2, 2, 'x'],
    [-2, 9, 'x']
  ],
  horns: [
    [-1, 2, 'x'],
    [-1, 3, 'x'],
    [-1, 8, 'x'],
    [-1, 9, 'x'],
    [-2, 2, 'x'],
    [-2, 9, 'x']
  ],
  ears: [
    [-1, 2, 'b'],
    [-1, 3, 'b'],
    [-1, 8, 'b'],
    [-1, 9, 'b'],
    [-2, 2, 'b'],
    [-2, 9, 'b']
  ],
  sprout: [
    [-1, 6, 'x'],
    [-2, 6, 'x'],
    [-2, 7, 'x'],
    [-2, 5, 'x']
  ],
  crown: [
    [-1, 3, 'x'],
    [-1, 4, 'x'],
    [-1, 5, 'x'],
    [-1, 6, 'x'],
    [-1, 7, 'x'],
    [-1, 8, 'x'],
    [-2, 3, 'x'],
    [-2, 5, 'x'],
    [-2, 6, 'x'],
    [-2, 8, 'x']
  ]
}

interface Palette {
  color: string
  shade: string
  accent: string
}

const PALETTES: Record<string, Palette> = {
  mint: { color: '#5FD3A4', shade: '#3BAA7E', accent: '#2E8B65' },
  sky: { color: '#5BB8F0', shade: '#3A93CC', accent: '#F2C14E' },
  pink: { color: '#F07DB1', shade: '#CC5A8E', accent: '#B8467A' },
  lime: { color: '#A6D35B', shade: '#7FAE3A', accent: '#5E8A24' },
  gold: { color: '#F2C14E', shade: '#CC9A2E', accent: '#F08A4B' },
  red: { color: '#EB5E55', shade: '#C2413A', accent: '#F2C14E' },
  slate: { color: '#8A9BB0', shade: '#677A90', accent: '#5BB8F0' },
  lavender: { color: '#B9A3F5', shade: '#9479DE', accent: '#F2C14E' },
  peach: { color: '#F5A97F', shade: '#D6855A', accent: '#C9652A' },
  rose: { color: '#E87A8F', shade: '#C4566C', accent: '#F2C14E' },
  cyan: { color: '#4FD1D9', shade: '#2FAAB2', accent: '#F07DB1' },
  teal: { color: '#3DAE9F', shade: '#278A7C', accent: '#A6D35B' },
  olive: { color: '#9CB86B', shade: '#7A954B', accent: '#5E8A24' },
  indigo: { color: '#6F7BEA', shade: '#5059C6', accent: '#EB5E55' },
  coral: { color: '#F2836B', shade: '#CF6249', accent: '#5BB8F0' },
  amber: { color: '#F0A93B', shade: '#C9851F', accent: '#FFE08A' }
}

export function composeAvatar(
  id: string,
  name: string,
  personality: string,
  bodyKey: string,
  accessoryKey: string,
  palette: Palette
): AvatarDef {
  const body = BODIES[bodyKey]
  const grid = body.rows.map((r) => [...r])
  for (const [dr, col, ch] of ACCESSORIES[accessoryKey]) {
    const row = body.top + dr
    if (row >= 0 && grid[row][col] === '.') grid[row][col] = ch
  }
  return {
    id,
    name,
    personality,
    ...palette,
    eyeRow: body.eyeRow,
    mouthRow: body.mouthRow,
    sprite: grid.map((r) => r.join(''))
  }
}

const COMPOSED: [id: string, name: string, personality: string, body: string, accessory: string, palette: string][] = localized([['luma', 'Luma', tr('Gentil e cuidadosa'), 'round', 'sprout', 'mint'], ['tico', 'Tico', tr('Rápido e prestativo'), 'box', 'twin', 'sky'], ['nina', 'Nina', tr('Criativa e atenta'), 'bean', 'ears', 'pink'], ['bolota', 'Bolota', tr('Tranquilo e bem-humorado'), 'slime', 'none', 'lime'], ['faisca', 'Faísca', tr('Cheio de ideias'), 'egg', 'antenna', 'gold'], ['zuzu', 'Zuzu', tr('Ousado e franco'), 'ghost', 'horns', 'red'], ['koda', 'Koda', tr('Analítico e calmo'), 'box', 'ears', 'slate'], ['miga', 'Miga', tr('Elegante e organizada'), 'round', 'crown', 'lavender'], ['tuca', 'Tuca', tr('Acolhedora e curiosa'), 'egg', 'ears', 'peach'], ['rubi', 'Rubi', tr('Exigente com detalhes'), 'bean', 'crown', 'rose'], ['gele', 'Gelê', tr('Flexível e adaptável'), 'slime', 'antenna', 'cyan'], ['vento', 'Vento', tr('Leve e objetivo'), 'ghost', 'sprout', 'teal'], ['bambu', 'Bambu', tr('Paciente e persistente'), 'bean', 'sprout', 'olive'], ['nox', 'Nox', tr('Noturno e reflexivo'), 'round', 'horns', 'indigo'], ['pipo', 'Pipo', tr('Animado e falante'), 'egg', 'twin', 'coral'], ['rei', 'Rei', tr('Confiante e decidido'), 'box', 'crown', 'amber']])

export const BUILT_IN_COMPOSED: AvatarDef[] = COMPOSED.map(([id, name, personality, body, acc, pal]) =>
  composeAvatar(id, name, personality, body, acc, PALETTES[pal])
)

const NAMES = [
  'Astro', 'Bento', 'Cora', 'Dino', 'Eli', 'Fubá', 'Guri', 'Iara', 'Juju', 'Kiko', 'Lila', 'Mimo', 'Nilo',
  'Oli', 'Pingo', 'Quinzinho', 'Rita', 'Sol', 'Tobi', 'Uli', 'Vivi', 'Zeca', 'Bia', 'Caju', 'Dudu', 'Mel'
]

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

export function randomName(): string {
  return pick(NAMES)
}

/** Cor aleatória harmoniosa: tom sorteado, saturação e luz fixas; sombra e detalhe derivados. */
function randomPalette(): Palette {
  const h = Math.floor(Math.random() * 360)
  const hsl = (hh: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => {
      const k = (n + hh / 30) % 12
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
      return Math.round(255 * c)
        .toString(16)
        .padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase()
  }
  return { color: hsl(h, 0.72, 0.64), shade: hsl(h, 0.55, 0.5), accent: hsl((h + 150) % 360, 0.8, 0.62) }
}

/** Cria um avatar inédito: corpo, acessório e cor sorteados. */
export function generateAvatar(): AvatarDef {
  const id = `gen-${Math.random().toString(36).slice(2, 10)}`
  return composeAvatar(id, randomName(), tr('Gerado para você'), pick(Object.keys(BODIES)), pick(Object.keys(ACCESSORIES)), randomPalette())
}
