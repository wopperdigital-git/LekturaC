import type { CSSProperties, ReactNode } from 'react'
import type { VisualStyle } from '@/engine/contentBlocks'
import { SLIDE_GAP, SLIDE_HEADING_FONT, SLIDE_SIZE } from '@/lib/theme-tokens'
import { EditableText } from './EditableText'

/**
 * The small heading over a heading: small capitals in the accent colour, `SLIDE_GAP.tight` above
 * its title. Accent as text is free; it is never a fill, and it is plain text (no role, no
 * aria). It is a run of its own (`textRef(index, 'kicker')`), so it takes marks and edits in
 * place like any other text, and it is drawn inside the heading's own `Adjustable` holder
 * (see `WithKicker`), not as an element of its own.
 */
export function Kicker({
  text,
  textRef,
  variant,
}: {
  text: string
  textRef: string
  /** The expressive treatment sets it a step heavier; the colour and size are the same. */
  variant?: VisualStyle
}) {
  return (
    <p
      data-kicker=""
      className={`${variant === 'expressive' ? 'font-bold' : 'font-semibold'} uppercase text-slide-accent`}
      style={{
        fontFamily: SLIDE_HEADING_FONT,
        fontSize: SLIDE_SIZE.eyebrow,
        letterSpacing: '0.12em',
        lineHeight: 1.2,
        marginBottom: SLIDE_GAP.tight,
      }}
    >
      <EditableText textRef={textRef} value={text} />
    </p>
  )
}

/**
 * A heading's title, with its kicker above it when it has one. Used inside the heading's
 * `Adjustable` holder, which wraps exactly one child: with a kicker the two are one block
 * (`data-kicker-group`), so nudging, resizing and selecting the heading moves both. Without a
 * kicker it returns the title untouched, so a heading that has none draws exactly as it did
 * before the field existed.
 *
 * `style` goes on the group, for a width cap the title would otherwise carry itself (a
 * percentage of a shrink-to-fit group would not mean what it means on the title).
 */
export function WithKicker({
  kicker,
  kickerRef,
  variant,
  style,
  children,
}: {
  kicker: string | undefined
  kickerRef: string
  variant?: VisualStyle
  style?: CSSProperties
  children: ReactNode
}) {
  if (!kicker) return <>{children}</>
  return (
    <div data-kicker-group="" style={style}>
      <Kicker text={kicker} textRef={kickerRef} variant={variant} />
      {children}
    </div>
  )
}
