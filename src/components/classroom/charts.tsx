import { describeTrend, formatDate, formatPercent } from '@/classroom/format'
import type { ScorePoint, Trend } from '@/classroom/stats'

/*
  Hand-drawn SVG — one sparkline per row does not justify a chart library.
  Colours come from app-* tokens so both light and dark modes work. Every
  chart has a text equivalent nearby (the history table, or an aria-label),
  so nothing is conveyed by the drawing alone.
*/

const STROKE = 'var(--app-accent-text)'

export function Sparkline({ scores, label }: { scores: number[]; label: string }) {
  const width = 72
  const height = 24
  if (scores.length < 2) {
    return <span className="inline-block w-[72px] text-center text-xs text-app-muted">—</span>
  }
  const points = scores
    .map((score, i) => {
      const x = 2 + (i * (width - 4)) / (scores.length - 1)
      const y = height - 2 - score * (height - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <polyline points={points} fill="none" stroke={STROKE} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function ScoreChart({ points }: { points: ScorePoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="mb-2 grid size-9 place-items-center rounded-full bg-app-surface text-app-muted border border-app-border">
          <svg className="size-4.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 13l4-5 3 3 5-8" strokeDasharray="3 3" />
          </svg>
        </div>
        <p className="text-xs font-semibold text-app-foreground">No quiz scores recorded yet</p>
        <p className="mt-0.5 text-[11px] text-app-muted max-w-xs">
          Trajectory graphs and average curves will generate automatically as tests are submitted.
        </p>
      </div>
    )
  }

  const W = 520
  const H = 160
  const padX = 40
  const padY = 16
  const x = (i: number) => (points.length === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (points.length - 1))
  const y = (score: number) => padY + (1 - score) * (H - padY * 2)
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')
  const area = points.length > 1
    ? `${line} ${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} ${x(0).toFixed(1)},${y(0).toFixed(1)}`
    : ''

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full max-w-2xl overflow-visible"
      role="img"
      aria-label={`Scores over time: ${points.map((p) => formatPercent(p.score)).join(', ')}`}
    >
      <defs>
        <linearGradient id="score-chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--app-accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--app-accent)" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Grid guide lines */}
      {[0, 0.5, 1].map((tick) => (
        <g key={tick}>
          <line
            x1={padX}
            x2={W - padX}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--app-border)"
            strokeDasharray={tick === 0 ? undefined : '3 4'}
            opacity="0.8"
          />
          <text
            x={padX - 8}
            y={y(tick)}
            dy="0.32em"
            textAnchor="end"
            fontSize="10"
            fontFamily="monospace"
            fill="var(--app-muted)"
          >
            {tick * 100}%
          </text>
        </g>
      ))}

      {/* Area gradient under curve */}
      {points.length > 1 && (
        <polygon points={area} fill="url(#score-chart-fill)" />
      )}

      {/* Trajectory line */}
      {points.length > 1 && (
        <polyline
          points={line}
          fill="none"
          stroke={STROKE}
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* Node points */}
      {points.map((p, i) => (
        <g key={i} className="cursor-pointer">
          <circle
            cx={x(i)}
            cy={y(p.score)}
            r="4.5"
            fill="var(--app-background)"
            stroke={STROKE}
            strokeWidth="2.5"
            className="transition-transform hover:scale-125"
          >
            <title>{`${formatDate(p.submittedAt)}: ${formatPercent(p.score)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  )
}

const TREND_TONE = {
  improving: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  steady: 'border-app-border bg-app-surface text-app-muted',
  slipping: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
} as const

const TREND_ARROW = { improving: '↑', steady: '→', slipping: '↓' } as const

export function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.kind === 'insufficient') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-surface/60 px-2 py-0.5 text-[11px] font-medium text-app-muted">
        <span className="size-1.5 rounded-full bg-app-muted/60" aria-hidden="true" />
        <span>Pending Data</span>
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TREND_TONE[trend.direction]}`}
    >
      <span aria-hidden="true">{TREND_ARROW[trend.direction]}</span>
      <span>{describeTrend(trend)}</span>
    </span>
  )
}
