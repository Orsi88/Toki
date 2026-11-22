import type { GeneratedItem } from '../domain/export.ts'

const W = 480
const H = 280
const PAD = 28

function num(text: string | undefined) {
  return Number(String(text ?? '').replace(',', '.'))
}

// Plano cartesiano com os pontos do lote; em "Pontos de função" eles são ligados em ordem de x.
export function CartesianPlot({ items, line }: { items: GeneratedItem[]; line?: boolean }) {
  const points = items
    .map((item) => ({ x: num(item.fields.find((field) => field.key === 'x')?.v), y: num(item.fields.find((field) => field.key === 'y')?.v) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (!points.length) return null
  const xs = [...points.map((point) => point.x), 0]
  const ys = [...points.map((point) => point.y), 0]
  const span = (list: number[]) => {
    const lo = Math.min(...list)
    const hi = Math.max(...list)
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.08
    return [lo - pad, hi + pad]
  }
  const [x0, x1] = span(xs)
  const [y0, y1] = span(ys)
  const sx = (x: number) => PAD + ((x - x0) / (x1 - x0)) * (W - PAD * 2)
  const sy = (y: number) => H - PAD - ((y - y0) / (y1 - y0)) * (H - PAD * 2)
  const ordered = line ? [...points].sort((a, b) => a.x - b.x) : points
  const label = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return (
    <figure className="plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Plano cartesiano com ${points.length} ${points.length === 1 ? 'ponto' : 'pontos'}`}>
        {[0.25, 0.5, 0.75].map((t) => (
          <g key={t} className="plot-grid">
            <line x1={PAD + t * (W - PAD * 2)} y1={PAD} x2={PAD + t * (W - PAD * 2)} y2={H - PAD} />
            <line x1={PAD} y1={PAD + t * (H - PAD * 2)} x2={W - PAD} y2={PAD + t * (H - PAD * 2)} />
          </g>
        ))}
        <line className="plot-axis" x1={PAD} y1={sy(0)} x2={W - PAD} y2={sy(0)} />
        <line className="plot-axis" x1={sx(0)} y1={PAD} x2={sx(0)} y2={H - PAD} />
        <text className="plot-label" x={W - PAD} y={sy(0) - 6} textAnchor="end">x</text>
        <text className="plot-label" x={sx(0) + 6} y={PAD + 4}>y</text>
        <text className="plot-label" x={PAD} y={H - 8}>{label(x0)}</text>
        <text className="plot-label" x={W - PAD} y={H - 8} textAnchor="end">{label(x1)}</text>
        {line && ordered.length > 1 ? <polyline className="plot-line" points={ordered.map((point) => `${sx(point.x)},${sy(point.y)}`).join(' ')} /> : null}
        {ordered.map((point, index) => (
          <circle key={index} className="plot-dot" cx={sx(point.x)} cy={sy(point.y)} r={points.length > 60 ? 2.5 : 4}>
            <title>({label(point.x)}; {label(point.y)})</title>
          </circle>
        ))}
      </svg>
    </figure>
  )
}
