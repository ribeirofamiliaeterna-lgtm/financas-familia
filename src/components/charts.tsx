import { useRef, useState } from 'react'
import { brl, brlShort, monthLabel } from '../lib/format'
import { MonthStats } from '../lib/indicators'

/**
 * Gráficos em SVG puro seguindo a paleta validada:
 * marcas finas, ponta arredondada ancorada na base, grid recessivo,
 * legenda para 2+ séries, tooltip por marca.
 */

const S1 = 'var(--series-1)' // azul — receita
const S2 = 'var(--series-2)' // aqua — série 2
const S6 = 'var(--series-6)' // vermelho — despesa

// ---------- Stat tile ----------
export function StatTile(props: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const cls = props.tone === 'good' ? 'value good' : props.tone === 'bad' ? 'value bad' : 'value'
  return (
    <div className="tile">
      <div className="label">{props.label}</div>
      <div className={cls}>{props.value}</div>
      {props.hint && <div className="hint">{props.hint}</div>}
    </div>
  )
}

// ---------- Tooltip helper ----------
function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const show = (e: React.MouseEvent, content: string) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10, content })
  }
  const hide = () => setTip(null)
  const node = tip ? (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }}
      dangerouslySetInnerHTML={{ __html: tip.content }} />
  ) : null
  return { ref, show, hide, node }
}

// ---------- Barras mensais receita × despesa ----------
export function MonthlyBars({ data }: { data: MonthStats[] }) {
  const { ref, show, hide, node } = useTooltip()
  const W = 720, H = 220, padL = 46, padB = 24, padT = 10
  const max = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)))
  const plotW = W - padL - 8, plotH = H - padT - padB
  const groupW = plotW / data.length
  const barW = Math.min(16, groupW * 0.28)
  const y = (v: number) => padT + plotH - (v / max) * plotH
  const ticks = niceTicks(max)

  return (
    <div className="viz" ref={ref}>
      <div className="legend">
        <span className="item"><span className="swatch" style={{ background: S1 }} />Receitas</span>
        <span className="item"><span className="swatch" style={{ background: S6 }} />Despesas</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={hide}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">{brlShort(t)}</text>
          </g>
        ))}
        <line x1={padL} x2={W - 8} y1={y(0)} y2={y(0)} stroke="var(--baseline)" strokeWidth={1} />
        {data.map((d, i) => {
          const cx = padL + groupW * i + groupW / 2
          const tipHtml = `<b>${monthLabel(d.month)}</b><br/>Receitas: ${brl(d.income)}<br/>Despesas: ${brl(d.expense)}<br/>Saldo: ${brl(d.net)}`
          return (
            <g key={d.month} onMouseMove={e => show(e, tipHtml)}>
              <rect x={padL + groupW * i} y={padT} width={groupW} height={plotH} fill="transparent" />
              <rect x={cx - barW - 1} y={y(d.income)} width={barW} height={Math.max(0, y(0) - y(d.income))}
                fill={S1} rx={3} />
              <rect x={cx + 1} y={y(d.expense)} width={barW} height={Math.max(0, y(0) - y(d.expense))}
                fill={S6} rx={3} />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)">{monthLabel(d.month)}</text>
            </g>
          )
        })}
      </svg>
      {node}
    </div>
  )
}

// ---------- Barras empilhadas mensais (compromissos: parcelamento × recorrente) ----------
export interface CommitmentMonth { month: string; parcelamento: number; recorrente: number }

export function StackedMonthlyBars({ data }: { data: CommitmentMonth[] }) {
  const { ref, show, hide, node } = useTooltip()
  const W = 720, H = 220, padL = 46, padB = 24, padT = 10
  const GAP = 2
  const max = Math.max(1, ...data.map(d => d.parcelamento + d.recorrente))
  const plotW = W - padL - 8, plotH = H - padT - padB
  const groupW = plotW / data.length
  const barW = Math.min(28, groupW * 0.45)
  const y = (v: number) => padT + plotH - (v / max) * plotH
  const ticks = niceTicks(max)

  return (
    <div className="viz" ref={ref}>
      <div className="legend">
        <span className="item"><span className="swatch" style={{ background: S1 }} />Parcelamentos</span>
        <span className="item"><span className="swatch" style={{ background: S2 }} />Recorrentes</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={hide}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">{brlShort(t)}</text>
          </g>
        ))}
        <line x1={padL} x2={W - 8} y1={y(0)} y2={y(0)} stroke="var(--baseline)" strokeWidth={1} />
        {data.map((d, i) => {
          const cx = padL + groupW * i + groupW / 2
          const total = d.parcelamento + d.recorrente
          const parcH = Math.max(0, y(0) - y(d.parcelamento))
          const recH = Math.max(0, y(d.parcelamento) - y(total) - (d.parcelamento > 0 && d.recorrente > 0 ? GAP : 0))
          const tipHtml = `<b>${monthLabel(d.month)}</b><br/>Parcelamentos: ${brl(d.parcelamento)}<br/>Recorrentes: ${brl(d.recorrente)}<br/>Total: ${brl(total)}`
          return (
            <g key={d.month} onMouseMove={e => show(e, tipHtml)}>
              <rect x={padL + groupW * i} y={padT} width={groupW} height={plotH} fill="transparent" />
              {d.parcelamento > 0 && (
                <rect x={cx - barW / 2} y={y(d.parcelamento)} width={barW} height={parcH}
                  fill={S1} rx={total === d.parcelamento ? 3 : 0} />
              )}
              {d.recorrente > 0 && (
                <rect x={cx - barW / 2} y={y(total)} width={barW} height={recH} fill={S2} rx={3} />
              )}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)">{monthLabel(d.month)}</text>
            </g>
          )
        })}
      </svg>
      {node}
    </div>
  )
}

// ---------- Linha de tendência (ex.: patrimônio líquido ao longo do tempo) ----------
export interface TrendPoint { month: string; value: number }

export function TrendLine({ data, color = S1 }: { data: TrendPoint[]; color?: string }) {
  const { ref, show, hide, node } = useTooltip()
  const W = 720, H = 220, padL = 56, padB = 24, padT = 10
  const plotW = W - padL - 10, plotH = H - padT - padB
  const n = data.length
  const values = data.map(d => d.value)
  const minV = Math.min(0, ...values)
  const maxV = Math.max(0, ...values, 1)
  const colW = plotW / Math.max(1, n - 1)
  const px = (i: number) => padL + (n <= 1 ? plotW / 2 : i * colW)
  const py = (v: number) => padT + plotH - ((v - minV) / (maxV - minV || 1)) * plotH
  const ticks = niceTicksRange(minV, maxV)

  return (
    <div className="viz" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={hide}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - 10} y1={py(t)} y2={py(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={padL - 6} y={py(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">{brlShort(t)}</text>
          </g>
        ))}
        <line x1={padL} x2={W - 10} y1={py(0)} y2={py(0)} stroke="var(--baseline)" strokeWidth={1} />
        <polyline fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
          points={data.map((d, i) => `${px(i)},${py(d.value)}`).join(' ')} />
        {data.map((d, i) => <circle key={d.month} cx={px(i)} cy={py(d.value)} r={3} fill={color} />)}
        {data.map((d, i) => (
          <rect key={d.month} x={px(i) - colW / 2} y={padT} width={colW} height={plotH} fill="transparent"
            onMouseMove={e => show(e, `<b>${monthLabel(d.month)}</b><br/>${brl(d.value)}`)} />
        ))}
        {data.map((d, i) => (
          <text key={d.month} x={px(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)">{monthLabel(d.month)}</text>
        ))}
      </svg>
      {node}
    </div>
  )
}

// ---------- Meter (indicador único 0–100) ----------
export function Meter({ value, label }: { value: number; label: string }) {
  const tone = value >= 70 ? 'var(--good)' : value >= 40 ? 'var(--warning)' : 'var(--critical)'
  return (
    <div>
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="muted">{label}</span>
        <span className="mono" style={{ fontWeight: 700 }}>{value}/100</span>
      </div>
      <div className="meter"><span className="fill" style={{ width: `${value}%`, background: tone }} /></div>
    </div>
  )
}

// ---------- Barra de composição (parte-de-um-todo, snapshot único) ----------
export function CompositionBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0))
  return (
    <div>
      <div className="comp-bar">
        {segments.map(s => (
          <span key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${brl(s.value)}`} />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        {segments.map(s => (
          <span className="item" key={s.label}>
            <span className="swatch" style={{ background: s.color }} />{s.label} · {brl(s.value)} ({Math.round((s.value / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------- Barras horizontais (gasto por categoria) ----------
export function HBarList({ items, maxItems = 10 }: { items: { name: string; total: number }[]; maxItems?: number }) {
  const shown = items.slice(0, maxItems)
  const max = Math.max(1, ...shown.map(i => i.total))
  return (
    <div>
      {shown.map(i => (
        <div className="hbar-row" key={i.name} title={`${i.name}: ${brl(i.total)}`}>
          <span className="name">{i.name}</span>
          <span className="track"><span className="fill" style={{ width: `${(i.total / max) * 100}%` }} /></span>
          <span className="val">{brl(i.total)}</span>
        </div>
      ))}
      {items.length === 0 && <p className="muted">Sem dados no período.</p>}
    </div>
  )
}

// ---------- Bullet orçado × realizado ----------
export function BulletBudget({ actual, budget }: { actual: number; budget: number }) {
  const max = Math.max(actual, budget, 1) * 1.05
  const over = budget > 0 && actual > budget
  return (
    <div className="bullet" title={`Realizado ${brl(actual)} de ${brl(budget)} orçado`}>
      <span className={over ? 'actual over' : 'actual'} style={{ width: `${(actual / max) * 100}%` }} />
      {budget > 0 && <span className="marker" style={{ left: `${(budget / max) * 100}%` }} />}
    </div>
  )
}

// ---------- Linha: projeção de quitação de dívidas ----------
export interface PayoffSeries { name: string; color?: string; points: { x: number; y: number }[] }

export function PayoffChart({ series, xLabel = 'meses' }: { series: PayoffSeries[]; xLabel?: string }) {
  const { ref, show, hide, node } = useTooltip()
  const W = 720, H = 220, padL = 52, padB = 24, padT = 10
  const colors = [S1, S2]
  const maxX = Math.max(1, ...series.flatMap(s => s.points.map(p => p.x)))
  const maxY = Math.max(1, ...series.flatMap(s => s.points.map(p => p.y)))
  const plotW = W - padL - 10, plotH = H - padT - padB
  const px = (x: number) => padL + (x / maxX) * plotW
  const py = (v: number) => padT + plotH - (v / maxY) * plotH
  const ticks = niceTicks(maxY)

  return (
    <div className="viz" ref={ref}>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s, i) => (
            <span className="item" key={s.name}>
              <span className="swatch" style={{ background: s.color ?? colors[i % colors.length] }} />{s.name}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={hide}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - 10} y1={py(t)} y2={py(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={padL - 6} y={py(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">{brlShort(t)}</text>
          </g>
        ))}
        <line x1={padL} x2={W - 10} y1={py(0)} y2={py(0)} stroke="var(--baseline)" strokeWidth={1} />
        {series.map((s, i) => (
          <polyline key={s.name} fill="none" stroke={s.color ?? colors[i % colors.length]} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round"
            points={s.points.map(p => `${px(p.x)},${py(p.y)}`).join(' ')} />
        ))}
        {/* camada de hover: colunas invisíveis por mês */}
        {Array.from({ length: maxX + 1 }, (_, x) => (
          <rect key={x} x={px(x) - plotW / maxX / 2} y={padT} width={plotW / maxX} height={plotH}
            fill="transparent"
            onMouseMove={e => {
              const lines = series.map((s, i) => {
                const p = s.points.find(pt => pt.x === x)
                return p ? `<span style="color:${s.color ?? colors[i % colors.length]}">●</span> ${s.name}: ${brl(p.y)}` : ''
              }).filter(Boolean).join('<br/>')
              if (lines) show(e, `<b>Mês ${x}</b><br/>${lines}`)
            }} />
        ))}
        <text x={W - 10} y={H - 8} textAnchor="end" fontSize={10} fill="var(--muted)">{xLabel}</text>
      </svg>
      {node}
    </div>
  )
}

function niceTicks(max: number): number[] {
  const raw = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? mag * 10
  const ticks: number[] = []
  for (let t = step; t <= max * 1.001; t += step) ticks.push(t)
  return ticks
}

/** Como niceTicks, mas para faixas que podem incluir valores negativos (ex.: patrimônio líquido) */
function niceTicksRange(min: number, max: number): number[] {
  const span = max - min || 1
  const raw = span / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? mag * 10
  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let t = start; t <= max * 1.001; t += step) ticks.push(t)
  return ticks
}
