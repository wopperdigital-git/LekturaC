import { bookendMeta } from '@/avatar/costLine'

/**
 * One intro or outro box in the video dialog: a labelled textarea, and its length and price (or "No
 * clip"). It writes through the same bookends store as the Narrate tab, so both show the same words.
 */
export function BookendBox({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="caps text-[0.6875rem] text-app-muted" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={3}
        placeholder="Empty means no clip."
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="scrollbar-subtle w-full resize-none rounded-app-sm border-[1.5px] border-app-foreground bg-app-background px-3 py-2 text-sm leading-relaxed text-app-foreground outline-none transition-shadow duration-150 focus:ring-3 focus:ring-app-accent/35 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <p className="text-xs text-app-muted tabular-nums">{bookendMeta(value)}</p>
    </div>
  )
}
