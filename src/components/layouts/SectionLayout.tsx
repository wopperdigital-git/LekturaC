import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { blocksOfTypeIndexed } from '@/engine/contentBlocks'
import { Leftovers } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_GAP, SLIDE_HEADING_FONT } from '@/lib/theme-tokens'

const NUMERAL_SIZE = 'calc(var(--slide-size-h1) * 2)'
const TITLE_SIZE = 'var(--slide-size-h1)'
const EXPRESSIVE_TITLE_SIZE = 'calc(var(--slide-size-h1) * 1.15)'

/**
 * A divider slide: the slide's position as a large accent numeral, an accent rule, then the
 * heading at h1, at the foot of the deep ground and left-aligned. The numeral is the
 * slide's own position (`position + 1`), not a count of sections, because a thumbnail or
 * a cover has no deck to count in. It is decoration (`aria-hidden`, no holder). Anything
 * on the card beyond the heading, including a lone photo, is drawn below through
 * `Leftovers`: the picker offers this layout on any title-kind card.
 */
export function SectionLayout({
  blocks,
  variant,
  position,
}: {
  blocks: ContentBlock[]
  variant: VisualStyle
  position: number
}) {
  const heading = blocksOfTypeIndexed(blocks, 'heading')[0]
  const consumed = heading ? [heading.index] : []
  const expressive = variant === 'expressive'
  return (
    <div data-section-root="" className="mt-auto flex flex-col items-start text-left">
      <span
        aria-hidden="true"
        data-section-number=""
        className={`pointer-events-none block select-none ${expressive ? 'font-extrabold' : 'font-bold'} tracking-[var(--slide-letter-spacing)] text-slide-accent`}
        style={{ fontFamily: SLIDE_HEADING_FONT, fontSize: NUMERAL_SIZE, lineHeight: 1 }}
      >
        {String(position + 1).padStart(2, '0')}
      </span>
      <span
        aria-hidden="true"
        data-section-rule=""
        className="pointer-events-none block shrink-0 bg-slide-accent"
        style={{ width: '4rem', height: '3px', marginTop: SLIDE_GAP.group, marginBottom: SLIDE_GAP.group }}
      />
      {heading && (
        <Adjustable index={heading.index}>
          <h1
            data-section-title=""
            className={`${expressive ? 'font-extrabold' : 'font-bold'} tracking-[var(--slide-letter-spacing)] text-slide-foreground`}
            style={{
              fontFamily: SLIDE_HEADING_FONT,
              fontSize: expressive ? EXPRESSIVE_TITLE_SIZE : TITLE_SIZE,
              lineHeight: 1.05,
              maxWidth: '80%',
            }}
          >
            <EditableText textRef={textRef(heading.index, 'text')} value={heading.block.text} />
          </h1>
        </Adjustable>
      )}
      {blocks.length > consumed.length && (
        <div style={{ marginTop: SLIDE_GAP.group }}>
          <Leftovers blocks={blocks} consumed={consumed} />
        </div>
      )}
    </div>
  )
}
