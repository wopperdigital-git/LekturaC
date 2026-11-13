import { useId, useState, type ReactNode } from 'react'
import {
  axisTicks,
  bucketLabel,
  bucketTitle,
  changeOf,
  labelIndices,
  sumOf,
  type BucketUnit,
  type Entry,
} from '@/admin/overview'

/*
  The admin page's pieces. Series colours are `--viz-1..4` (index.css,
  validated per mode); a single series is always `--viz-1`. Nothing is read
  from colour alone: over-time charts have a legend for two or more series, a
  hover/focus tooltip with exact numbers and a table view; bars print their
  number beside them; tiles say the change in words.
*/

const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)'] as const

export function Card({
  title,
  aside,
  children,
  className = '',
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-app border border-app-border bg-app-background p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-app-foreground">{title}</h2>
        {aside && <span className="text-xs text-app-muted tabular-nums">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

const CHANGE_TONE: Record<string, string> = {
  up: 'text-app-foreground',
  down: 'text-app-foreground',
  flat: 'text-app-muted',
  new: 'text-app-foreground',
}

const CHANGE_ARROW: Record<string, string> = { up: '▲', down: '▼', flat: '', new: '▲' }

/**
 * A headline number. `compare` (current/previous of the range) adds the change
 * against the previous period in words; direction is shown by an arrow and
 * sign, not by colour, since "more" is not always good (failed research).
 */
export function StatTile({
  label,
  value,
  hint,
  compare,
  previousLabel,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  compare?: { current: number | null; previous: number | null; asPoints?: boolean }
  previousLabel?: string
}) {
  const change = compare ? changeOf(compare.current, compare.previous, compare.asPoints) : null
  return (
    <div className="rounded-app border border-app-border bg-app-background p-4">
      <div className="text-xs font-medium text-app-muted">{label}</div>
      <div className="mt-1 text-[1.75rem] leading-tight font-bold text-app-foreground tabular-nums">{value}</div>
      {change && (
        <div className="mt-1 text-xs tabular-nums">
          <span className={`font-semibold ${CHANGE_TONE[change.direction]}`}>
            {CHANGE_ARROW[change.direction] && (
              <span aria-hidden="true" className="mr-0.5 text-[9px]">
                {CHANGE_ARROW[change.direction]}
              </span>
            )}
            {change.text}
          </span>
          {previousLabel && <span className="text-app-muted"> vs {previousLabel}</span>}
        </div>
      )}
      {hint && <div className="mt-0.5 text-xs text-app-muted">{hint}</div>}
    </div>
  )
}

/** Horizontal bars, label left, value right; widths are shares of the biggest value. */
export function BarList({
  entries,
  empty = 'Nothing yet',
  format,
}: {
  entries: Entry[]
  empty?: string
  format?: (n: number) => string
}) {
  if (entries.length === 0 || entries.every((e) => e.value === 0)) {
    return <p className="py-2 text-sm text-app-muted">{empty}</p>
  }
  const max = Math.max(...entries.map((e) => e.value), 1)
  const total = sumOf(entries.map((e) => e.value))
  return (
    <ul className="flex flex-col gap-2.5">
      {entries.map((e) => (
        <li
          key={e.key}
          className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm"
          title={`${e.label}: ${e.value} (${total > 0 ? Math.round((e.value / total) * 100) : 0}%)`}
        >
          <span className="truncate text-app-foreground">{e.label}</span>
          <span className="h-2 rounded-full bg-app-surface" aria-hidden="true">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${e.value === 0 ? 0 : Math.max((e.value / max) * 100, 2)}%`,
                background: VIZ[0],
              }}
            />
          </span>
          <span className="min-w-14 text-right text-app-muted tabular-nums">
            {format ? format(e.value) : e.value}
            <span className="ml-1 text-[11px] opacity-80">{total > 0 ? `${Math.round((e.value / total) * 100)}%` : ''}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export interface ChartSeries {
  key: string
  label: string
}

export interface ChartBucket {
  start: string
  /** One value per series, in series order. */
  values: number[]
}

const PLOT_HEIGHT = 160

/**
 * Columns over time, stacked when there is more than one series: a number
 * scale with gridlines, dated labels under the columns, a legend for two or
 * more series, a tooltip with every value on hover or keyboard focus (the
 * whole column height is the target), and a table view of the same numbers.
 */
export function TimeChart({
  buckets,
  series,
  unit,
  noun,
}: {
  buckets: ChartBucket[]
  series: ChartSeries[]
  unit: BucketUnit
  /** What one unit is, plural: "sign-ups", "decks". */
  noun: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()

  if (buckets.length === 0) return <p className="py-2 text-sm text-app-muted">Nothing yet</p>

  const totals = buckets.map((b) => sumOf(b.values))
  const ticks = axisTicks(Math.max(...totals, 0))
  const top = ticks[ticks.length - 1]!
  const labelled = new Set(labelIndices(buckets.length))
  const stacked = series.length > 1
  const current = active === null ? null : buckets[active]

  return (
    <div>
      {stacked && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-app-muted">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: VIZ[i] }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        {/* the number scale */}
        <div className="relative w-7 shrink-0 text-right text-[11px] text-app-muted tabular-nums" style={{ height: PLOT_HEIGHT }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${100 - (t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="relative" style={{ height: PLOT_HEIGHT }} onMouseLeave={() => setActive(null)}>
            {/* gridlines, recessive; the zero line a step stronger */}
            {ticks.map((t) => (
              <span
                key={t}
                aria-hidden="true"
                className={`absolute inset-x-0 border-t ${t === 0 ? 'border-app-border' : 'border-app-border/50 border-dashed'}`}
                style={{ top: `${100 - (t / top) * 100}%` }}
              />
            ))}

            <ol className="absolute inset-0 flex items-stretch gap-[2px]" aria-label={`${noun} by ${unit}`}>
              {buckets.map((b, i) => {
                const total = totals[i]!
                const text = `${bucketTitle(b.start, unit)}: ${total} ${noun}${
                  stacked ? ` (${series.map((s, k) => `${s.label} ${b.values[k] ?? 0}`).join(', ')})` : ''
                }`
                return (
                  <li
                    key={b.start}
                    tabIndex={0}
                    aria-label={text}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="group relative flex min-w-0 flex-1 cursor-default flex-col-reverse rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
                  >
                    {/* hover band: the whole column is the target, wider than the mark */}
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 rounded-t-[4px] ${active === i ? 'bg-app-surface/70' : ''}`}
                    />
                    <span
                      aria-hidden="true"
                      className="relative mx-auto flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-[4px]"
                      style={{ height: `${top > 0 ? (total / top) * 100 : 0}%` }}
                    >
                      {b.values.map((v, k) =>
                        v > 0 ? (
                          <span
                            key={series[k]?.key ?? k}
                            className="block w-full border-app-background [&:not(:first-child)]:border-b-2"
                            style={{ height: `${(v / total) * 100}%`, background: VIZ[k] }}
                          />
                        ) : null,
                      )}
                    </span>
                  </li>
                )
              })}
            </ol>

            {current && active !== null && (
              <Tooltip
                left={((active + 0.5) / buckets.length) * 100}
                title={bucketTitle(current.start, unit)}
                total={totals[active]!}
                noun={noun}
                rows={stacked ? series.map((s, k) => ({ label: s.label, value: current.values[k] ?? 0, color: VIZ[k] })) : []}
              />
            )}
          </div>

          {/* dated labels */}
          <div className="relative mt-1.5 h-4 text-[11px] text-app-muted" aria-hidden="true">
            {buckets.map((b, i) =>
              labelled.has(i) ? (
                <span
                  key={b.start}
                  className={`absolute whitespace-nowrap ${
                    i === 0 ? 'left-0' : i === buckets.length - 1 ? 'right-0' : '-translate-x-1/2'
                  }`}
                  style={i === 0 || i === buckets.length - 1 ? undefined : { left: `${((i + 0.5) / buckets.length) * 100}%` }}
                >
                  {bucketLabel(b.start, unit)}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((v) => !v)}
        className="mt-3 cursor-pointer text-xs font-medium text-app-accent-text underline-offset-4 hover:underline"
      >
        {showTable ? 'Hide table' : 'Show table'}
      </button>
      {showTable && (
        <div id={tableId} className="mt-2 max-h-64 overflow-auto rounded-app-sm border border-app-border">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="sticky top-0 bg-app-surface text-app-muted">
              <tr>
                <th className="px-3 py-1.5 font-medium">{unit === 'month' ? 'Month' : unit === 'week' ? 'Week of' : 'Day'}</th>
                {stacked && series.map((s) => <th key={s.key} className="px-3 py-1.5 text-right font-medium">{s.label}</th>)}
                <th className="px-3 py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={b.start} className="border-t border-app-border">
                  <td className="px-3 py-1.5 text-app-foreground">{bucketLabel(b.start, unit)}</td>
                  {stacked && b.values.map((v, k) => <td key={series[k]?.key ?? k} className="px-3 py-1.5 text-right text-app-muted">{v}</td>)}
                  <td className="px-3 py-1.5 text-right font-semibold text-app-foreground">{totals[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Tooltip({
  left,
  title,
  total,
  noun,
  rows,
}: {
  /** Column centre, % of the plot width. */
  left: number
  title: string
  total: number
  noun: string
  rows: { label: string; value: number; color: string }[]
}) {
  // kept inside the plot: anchored to the column, flipped near either edge
  const align = left < 25 ? 'translate-x-0' : left > 75 ? '-translate-x-full' : '-translate-x-1/2'
  return (
    <div
      role="presentation"
      className={`pointer-events-none absolute top-0 z-10 min-w-36 rounded-app-sm border border-app-border bg-app-background px-3 py-2 text-xs shadow-lg ${align}`}
      style={{ left: `${left}%` }}
    >
      <div className="font-semibold text-app-foreground">{title}</div>
      <div className="mt-0.5 text-app-muted tabular-nums">
        <span className="font-semibold text-app-foreground">{total}</span> {noun}
      </div>
      {rows.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 tabular-nums">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-app-muted">
                <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: r.color }} />
                {r.label}
              </span>
              <span className="text-app-foreground">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function RangePicker<K extends string>({
  value,
  options,
  onChange,
}: {
  value: K
  options: readonly { key: K; label: string }[]
  onChange: (key: K) => void
}) {
  return (
    <div role="group" aria-label="Time range" className="inline-flex rounded-app-sm border border-app-border bg-app-surface/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.key === value}
          onClick={() => onChange(o.key)}
          className={`cursor-pointer rounded-app-sm px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
            o.key === value ? 'bg-app-background text-app-foreground shadow-sm' : 'text-app-muted hover:text-app-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
