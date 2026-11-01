import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Largura do elemento, acompanhando redimensionamentos. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current!
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/** Valores "redondos" para as linhas de grade (0, 25 mil, 50 mil...). */
function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}

/** Retângulo com os cantos de cima arredondados (ponta da coluna) e a base reta. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

export interface Series {
  key: string
  label: string
  color: string
}

export interface Column {
  label: string
  /** Rótulo longo, para o tooltip. */
  title: string
  values: Record<string, number>
}

const CHART_H = 220
const AXIS_W = 56
const AXIS_H = 22
const GAP = 2

/**
 * Colunas empilhadas por série, com grade discreta, tooltip por coluna e legenda acima.
 * `format` formata os valores (tokens ou peso).
 */
export function StackedColumns({
  series,
  columns,
  format
}: {
  series: Series[]
  columns: Column[]
  format: (v: number) => string
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number>()
  const totals = columns.map((c) => series.reduce((s, x) => s + (c.values[x.key] ?? 0), 0))
  const ticks = niceTicks(Math.max(...totals, 0))
  const top = ticks[ticks.length - 1] || 1
  const plotW = Math.max(0, width - AXIS_W)
  const band = columns.length ? plotW / columns.length : 0
  const barW = Math.max(2, Math.min(24, band * 0.68))
  const y = (v: number) => CHART_H - (v / top) * CHART_H
  // Rótulos do eixo X espaçados para não encostarem.
  const every = Math.max(1, Math.ceil(44 / Math.max(band, 1)))
  const used = series.filter((s) => totals.some((_, i) => (columns[i].values[s.key] ?? 0) > 0))

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {used.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[12px] text-fg-2">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative" onPointerLeave={() => setHover(undefined)}>
        {width > 0 && (
          <svg width={width} height={CHART_H + AXIS_H} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={AXIS_W} x2={width} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                <text x={AXIS_W - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px]">
                  {format(t)}
                </text>
              </g>
            ))}
            {columns.map((c, i) => {
              const x = AXIS_W + i * band + (band - barW) / 2
              let acc = 0
              const stack = series.filter((s) => (c.values[s.key] ?? 0) > 0)
              return (
                <g key={i} opacity={hover === undefined || hover === i ? 1 : 0.55}>
                  {stack.map((s, j) => {
                    const v = c.values[s.key]
                    const y0 = y(acc)
                    acc += v
                    const y1 = y(acc)
                    // Fenda de 2px entre os segmentos (a cor do fundo separa, não um contorno).
                    const h = Math.max(0, y0 - y1 - (j > 0 ? GAP : 0))
                    if (h < 0.5) return null
                    return j === stack.length - 1 ? (
                      <path key={s.key} d={topRounded(x, y1, barW, h, 4)} fill={s.color} />
                    ) : (
                      <rect key={s.key} x={x} y={y1} width={barW} height={h} fill={s.color} />
                    )
                  })}
                  {i % every === 0 && (
                    <text x={x + barW / 2} y={CHART_H + 15} textAnchor="middle" className="fill-muted text-[11px]">
                      {c.label}
                    </text>
                  )}
                  {/* Área de toque maior que a coluna. */}
                  <rect
                    x={AXIS_W + i * band}
                    y={0}
                    width={band}
                    height={CHART_H}
                    fill="transparent"
                    onPointerEnter={() => setHover(i)}
                  />
                </g>
              )
            })}
          </svg>
        )}
        {hover !== undefined && totals[hover] > 0 && (
          <Tip left={AXIS_W + hover * band + band / 2} width={width}>
            <p className="text-[12px] text-muted">{columns[hover].title}</p>
            <p className="text-[14px] font-semibold">{format(totals[hover])}</p>
            {series
              .filter((s) => (columns[hover].values[s.key] ?? 0) > 0)
              .map((s) => (
                <p key={s.key} className="mt-1 flex items-center gap-2 text-[12px]">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                  <span className="font-medium">{format(columns[hover].values[s.key])}</span>
                  <span className="whitespace-nowrap text-muted">{s.label}</span>
                </p>
              ))}
          </Tip>
        )}
      </div>
    </div>
  )
}

function Tip({ left, width, children }: { left: number; width: number; children: ReactNode }) {
  const w = 250
  const x = Math.min(Math.max(left - w / 2, 0), Math.max(0, width - w))
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 rounded-tile border border-line bg-sidebar px-3 py-2.5 shadow-xl"
      style={{ left: x, width: w }}
    >
      {children}
    </div>
  )
}

/** Barras horizontais de uma série só (sem legenda: o título do cartão diz o que é). */
export function HBars({
  rows,
  format,
  color
}: {
  rows: { key: string; label: string; value: number; detail?: string }[]
  format: (v: number) => string
  color: string
}) {
  const max = Math.max(...rows.map((r) => r.value), 1e-12)
  const total = rows.reduce((s, r) => s + r.value, 0) || 1
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} title={r.detail}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium">{r.label}</span>
            <span className="shrink-0 text-fg-2">
              {format(r.value)} <span className="text-muted">· {Math.round((r.value / total) * 100)}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-2.5">
            <div
              className="h-full rounded-r-[4px]"
              style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, maxWidth: '100%', background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
