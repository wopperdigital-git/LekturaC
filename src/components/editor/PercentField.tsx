import { useRef, useState, type ReactNode } from 'react'

/* The one place the panel's field chrome is defined. Filled, no border until it is
   hovered or focused — which is how Figma's inputs read as part of the panel rather
   than as boxes dropped into it. */
export const FIELD =
  'flex h-7 items-center rounded-[5px] bg-app-foreground/[0.06] text-[11px] text-app-foreground transition-colors hover:bg-app-foreground/10 focus-within:bg-app-background focus-within:ring-1 focus-within:ring-app-accent'

/**
 * A number entered as a percentage, committed on Enter or when it loses focus.
 *
 * The value is a multiple (1 = 100%), held as text while it is being typed so a
 * half-typed "1" on the way to "120" is not clamped and rewritten under the
 * caret. Anything that is not a number reverts to what it was; a number outside
 * `min`/`max` is handed up as typed and the caller's own clamp decides — the same
 * clamp the step buttons go through, so all routes agree on the range.
 */
export function PercentField({
  label,
  value,
  min,
  max,
  onCommit,
  prefix,
  compact,
}: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (next: number) => void
  /** An icon or letter inside the field, before the value — how Figma names a field without a caption. */
  prefix?: ReactNode
  /** A narrow, borderless variant for the header. */
  compact?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  // Escape must abandon the draft, but blurring the field is what commits it —
  // so the abandon is remembered for the blur that follows.
  const abandon = useRef(false)

  function commit() {
    if (abandon.current) {
      abandon.current = false
      setDraft(null)
      return
    }
    if (draft !== null) {
      const parsed = Number.parseFloat(draft.replace('%', ''))
      if (Number.isFinite(parsed)) onCommit(parsed / 100)
    }
    setDraft(null)
  }

  return (
    <label className={`${FIELD} ${compact ? 'h-6 w-14 gap-0.5 px-1.5' : 'gap-1.5 px-2'}`}>
      {prefix && <span className="shrink-0 text-app-muted">{prefix}</span>}
      <input
        type="text"
        inputMode="numeric"
        aria-label={`${label} (${Math.round(min * 100)}–${Math.round(max * 100)}%)`}
        value={draft ?? String(Math.round(value * 100))}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            abandon.current = true
            e.currentTarget.blur()
          }
        }}
        className={`min-w-0 flex-1 bg-transparent tabular-nums outline-none ${compact ? 'text-right' : ''}`}
      />
      <span aria-hidden="true" className="shrink-0 text-app-muted">
        %
      </span>
    </label>
  )
}
