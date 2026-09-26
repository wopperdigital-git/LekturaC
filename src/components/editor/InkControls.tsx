import type { ReactNode } from 'react'
import { INK_COLORS, type InkKeep } from '@/engine/penSettings'

/*
  The controls the pen and shape popovers share: a labelled row, a pressable
  choice, the colour row and the "where does this go" row. Colour and Keep are the
  same setting for both tools, so they are drawn by the same code.

  App chrome (`app-*` tokens). Every button refuses focus on mousedown, like the
  rest of the toolbar, so a live text caret survives a click.
*/

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent'

const KEEPS: readonly { id: InkKeep; label: string; hint: string }[] = [
  { id: 'slide', label: 'On slide', hint: 'Saved with the deck and shown when presenting' },
  { id: 'temporary', label: 'Temporary', hint: 'Kept in this browser only — never saved to the deck' },
]

export function Row({ label, wrap, children }: { label: string; wrap?: boolean; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-app-muted">{label}</p>
      <div className={`flex items-center gap-1 ${wrap ? 'flex-wrap' : ''}`}>{children}</div>
    </div>
  )
}

export function Choice({
  label,
  title,
  pressed,
  onClick,
  className = '',
  children,
}: {
  /** An accessible name, for a choice that is only a picture. */
  label?: string
  title?: string
  pressed: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      // Never take focus: a live text run's caret must survive a click here.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex cursor-pointer items-center rounded-[5px] transition-colors ${FOCUS_RING} ${className} ${
        pressed
          ? 'bg-app-foreground/15 text-app-foreground ring-1 ring-app-accent'
          : 'text-app-foreground/90 hover:bg-app-foreground/10'
      }`}
    >
      {children}
    </button>
  )
}

/** The swatch fill: theme colours are drawn as the accent / a neutral, since the popover is app chrome. */
function swatchBackground(value: string): string {
  if (value === 'accent') return 'var(--app-accent)'
  if (value === 'foreground') return 'var(--app-foreground)'
  return value
}

export function ColorRow({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <Row label="Colour" wrap>
      {INK_COLORS.map((color) => (
        <Choice
          key={color.value}
          label={color.label}
          pressed={value === color.value}
          onClick={() => onChange(color.value)}
          className="size-6 shrink-0 justify-center rounded-full"
        >
          <span
            aria-hidden="true"
            className="size-4 rounded-full border border-app-foreground/25"
            style={{ background: swatchBackground(color.value) }}
          />
        </Choice>
      ))}
    </Row>
  )
}

export function KeepRow({
  value,
  onChange,
  label = 'Keep',
}: {
  value: InkKeep
  onChange: (keep: InkKeep) => void
  label?: string
}) {
  return (
    <Row label={label}>
      {KEEPS.map((keep) => (
        <Choice
          key={keep.id}
          title={keep.hint}
          pressed={value === keep.id}
          onClick={() => onChange(keep.id)}
          className="flex-1 px-2 py-1"
        >
          {keep.label}
        </Choice>
      ))}
    </Row>
  )
}

export function FullNote() {
  return (
    <p role="status" className="text-app-muted">
      This slide is full of ink. Erase something to draw more.
    </p>
  )
}
