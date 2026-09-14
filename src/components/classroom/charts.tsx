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
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function ScoreChart({ points }: { points: ScorePoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-app-muted">No submitted quizzes yet.</p>
  }
  const W = 480
  const H = 160
  const padX = 36
  const padY = 14
  const x = (i: number) => (points.length === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (points.length - 1))
  const y = (score: number) => padY + (1 - score) * (H - padY * 2)
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full max-w-xl"
      role="img"
      aria-label={`Scores over time: ${points.map((p) => formatPercent(p.score)).join(', ')}`}
    >
      {[0, 0.5, 1].map((tick) => (
        <g key={tick}>
          <line
            x1={padX}
            x2={W - padX}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--app-border)"
            strokeDasharray={tick === 0 ? undefined : '3 4'}
          />
          <text x={padX - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--app-muted)">
            {tick * 100}%
          </text>
        </g>
      ))}
      {points.length > 1 && (
        <polyline points={line} fill="none" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.score)} r="3.5" fill="var(--app-background)" stroke={STROKE} strokeWidth="2">
          <title>{`${formatDate(p.submittedAt)}: ${formatPercent(p.score)}`}</title>
        </circle>
      ))}
    </svg>
  )
}

const TREND_TONE = {
  improving: 'text-app-highlight-text',
  steady: 'text-app-muted',
  slipping: 'text-red-600 dark:text-red-400',
} as const

const TREND_ARROW = { improving: '↑', steady: '→', slipping: '↓' } as const

export function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.kind === 'insufficient') {
    return <span className="text-xs text-app-muted">Not enough data</span>
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${TREND_TONE[trend.direction]}`}>
      <span aria-hidden="true">{TREND_ARROW[trend.direction]}</span>
      {describeTrend(trend)}
    </span>
  )
}
