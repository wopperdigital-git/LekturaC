import type { ReactNode } from 'react'

/**
 * One section of the brief sheet: a caps caption in a fixed left column, the
 * control and its hint on the right. Sections stack with hairlines between
 * them, so the brief reads as one proposal form rather than five cards.
 *
 * `htmlFor` makes the caption a real `<label>` (text fields); without it the
 * caption is a plain span that a radio group names through `aria-labelledby`.
 */
export function BriefSection({
  label,
  labelId,
  htmlFor,
  optional = false,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  label: string
  labelId: string
  htmlFor?: string
  optional?: boolean
  hint?: ReactNode
  hintId?: string
  /** Shown at the field (and the caption turns crimson) when Generate finds it unanswered. */
  error?: string | null
  errorId?: string
  children: ReactNode
}) {
  const caption = (
    <>
      {label}
      {optional && <span className="mt-1 block font-medium tracking-normal normal-case">Optional</span>}
    </>
  )
  const captionClass = `caps text-[11px] sm:pt-2.5 ${error ? 'text-app-danger-text' : 'text-app-muted'}`

  return (
    <div
      data-motion="section"
      className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2.5 border-t border-app-border px-5 py-5 first:border-t-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-6 sm:py-6"
    >
      {htmlFor ? (
        <label id={labelId} htmlFor={htmlFor} className={captionClass}>
          {caption}
        </label>
      ) : (
        <span id={labelId} className={captionClass}>
          {caption}
        </span>
      )}
      <div className="min-w-0">
        {children}
        {error && (
          <p id={errorId} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-app-danger-text">
            <svg className="size-3.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 6.5v4M10 13.4v.2" />
            </svg>
            {error}
          </p>
        )}
        {hint && (
          <p id={hintId} className="mt-2 text-xs text-app-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * A fixed choice as a row of chips. Each chip is a native radio inside its
 * label, so the group gets one Tab stop and arrow keys from the browser, and
 * the focus ring keys off the hidden radio (`has-[:focus-visible]:`) because a
 * `focus-visible:` ring on the label itself can never show.
 *
 * The chosen chip is filled in ink and wears the orange lanyard bar, like the
 * dashboard's active view tab.
 */
export function ChoiceChips<T extends string | number>({
  name,
  labelledBy,
  describedBy,
  invalid = false,
  options,
  value,
  onChange,
}: {
  name: string
  labelledBy: string
  describedBy?: string
  invalid?: boolean
  /**
   * `narrow` chips are fixed-width squares (the slide numbers, so all seven
   * fit one phone-width row); `breakBefore` starts a new row for this chip.
   */
  options: { value: T; label: string; narrow?: boolean; breakBefore?: boolean }[]
  value: T | null
  onChange: (value: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="flex flex-wrap gap-2"
    >
      {options.map((option) => {
        const checked = value === option.value
        return [
          option.breakBefore && <span key={`${String(option.value)}-break`} aria-hidden="true" className="basis-full" />,
          <label
            key={String(option.value)}
            // One weight in both states: a bolder checked chip would grow and shove its neighbours.
            className={`relative inline-flex min-h-9 cursor-pointer items-center rounded-app-sm border-[1.5px] text-sm font-medium tabular-nums transition-colors duration-150 select-none pointer-coarse:min-h-11 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-app-accent ${option.narrow ? 'min-w-9 justify-center px-2 pointer-coarse:min-w-11' : 'px-3.5'} ${
              invalid ? 'border-app-danger' : 'border-app-foreground'
            } ${
              checked
                ? 'bg-app-foreground text-app-background'
                : 'bg-app-background text-app-foreground hover:bg-app-surface'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={String(option.value)}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
            {checked && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-1/2 h-1 w-5 -translate-x-1/2 bg-app-accent-on-foreground"
              />
            )}
          </label>,
        ]
      })}
    </div>
  )
}
