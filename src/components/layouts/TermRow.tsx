import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT, SLIDE_GAP, SLIDE_HEADING_FONT } from '@/lib/theme-tokens'
import { EditableText } from './EditableText'

/** A row's fixed classes: the grid (one column, two from 640px of slide width), its hairline above and nothing else. */
const ROW_CLASS = 'grid min-w-0 grid-cols-1 border-t border-slide-border @min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'

/**
 * One term and its meaning as a row of a two-column grid: the term (the heading font, accent
 * text at h3, or h2 and heavier when expressive) on the left a third of the width and the
 * meaning on the right, stacked below 640px of slide width. The hairline above it is on the row
 * itself (`border-t`), and the last row of a run (or a lone point) carries one below as well:
 * the `Adjustable` holder around a row is `display: contents`, so a `divide-y` on the run's root
 * would put its borders on holders that draw none. A row is one element, which is what the
 * holder wraps, so nudging, selecting and removing act on the row and nothing else. The term and
 * the meaning are runs under the row's own index (`N:label`, `N:text`).
 *
 * `fill` makes the row take its share of a run that fills the body zone, its words centred in it.
 */
export function TermRow({
  index,
  label,
  text,
  textSize,
  expressive,
  last,
  fill = false,
}: {
  index: number
  label: string
  text: string
  /** The meaning's font size, one for the whole run (`termTextSize`). */
  textSize: string
  expressive: boolean
  /** The last row of its run, or a lone point: closes the table with a hairline below. */
  last: boolean
  fill?: boolean
}) {
  return (
    <div
      data-term-row=""
      className={`${ROW_CLASS}${last ? ' border-b' : ''}${fill ? ' flex-1 items-center' : ' items-baseline'}`}
      style={{
        columnGap: SLIDE_GAP.group,
        rowGap: SLIDE_GAP.tight,
        paddingBlock: SLIDE_GAP.tight,
        fontFamily: SLIDE_BODY_FONT,
        fontSize: 'var(--slide-size-body)',
      }}
    >
      <div
        data-term=""
        className="min-w-0 break-words text-slide-accent"
        style={{
          fontFamily: SLIDE_HEADING_FONT,
          fontSize: expressive ? 'var(--slide-size-h2)' : 'var(--slide-size-h3)',
          fontWeight: expressive ? 800 : 600,
          lineHeight: 1.15,
        }}
      >
        <EditableText textRef={textRef(index, 'label')} value={label} />
      </div>
      <div data-term-text="" className="min-w-0 text-slide-foreground/90" style={{ fontSize: textSize }}>
        <EditableText textRef={textRef(index, 'text')} value={text} />
      </div>
    </div>
  )
}
