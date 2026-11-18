import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { blocksOfTypeIndexed } from '@/engine/contentBlocks'
import { Leftovers } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_BODY_FONT, SLIDE_GAP, SLIDE_HEADING_FONT, SLIDE_SIZE } from '@/lib/theme-tokens'

const HEADING_SIZE = 'var(--slide-size-h1)'
const STATEMENT_WIDTH = 'calc(var(--slide-size-h1) * 22)'
const EXPRESSIVE_HEADING_SIZE = 'calc(var(--slide-size-h1) * 1.15)'

/**
 * One idea on the tint: the heading at h1 and a single short line under it, left-aligned and
 * centred vertically on its own root (`my-auto`). The block is capped at 22 times the h1
 * step, so the line breaks like a statement and not like a paragraph. The first heading
 * and first paragraph are drawn here; anything else on the card is a leftover, since the
 * picker offers this layout for a heading and a paragraph of any length.
 */
export function StatementLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const heading = blocksOfTypeIndexed(blocks, 'heading')[0]
  const paragraph = blocksOfTypeIndexed(blocks, 'paragraph')[0]
  const consumed = [...(heading ? [heading] : []), ...(paragraph ? [paragraph] : [])].map((entry) => entry.index)
  const expressive = variant === 'expressive'
  const hasLeftovers = blocks.length > consumed.length
  return (
    <div
      data-statement-root=""
      className="my-auto flex flex-col items-start text-left"
      style={{ gap: SLIDE_GAP.group, maxWidth: STATEMENT_WIDTH }}
    >
      {heading && (
        <Adjustable index={heading.index}>
          <h1
            data-statement-title=""
            className={`${expressive ? 'font-extrabold' : 'font-bold'} tracking-[var(--slide-letter-spacing)] text-slide-foreground`}
            style={{
              fontFamily: SLIDE_HEADING_FONT,
              fontSize: expressive ? EXPRESSIVE_HEADING_SIZE : HEADING_SIZE,
              lineHeight: 1.08,
            }}
          >
            <EditableText textRef={textRef(heading.index, 'text')} value={heading.block.text} />
          </h1>
        </Adjustable>
      )}
      {paragraph && (
        <Adjustable index={paragraph.index}>
          <p
            data-statement-lead=""
            className="text-slide-muted"
            style={{ fontFamily: SLIDE_BODY_FONT, fontSize: SLIDE_SIZE.lead, lineHeight: 1.35 }}
          >
            <EditableText textRef={textRef(paragraph.index, 'text')} value={paragraph.block.text} />
          </p>
        </Adjustable>
      )}
      {hasLeftovers && <Leftovers blocks={blocks} consumed={consumed} />}
    </div>
  )
}
