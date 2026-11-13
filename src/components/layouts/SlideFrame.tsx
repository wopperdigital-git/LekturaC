import type { ReactElement, ReactNode } from 'react'
import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { slotsOf } from '@/engine/composition'
import { SLIDE_GAP } from '@/lib/theme-tokens'
import { BlockRenderer, Heading } from './BlockRenderer'
import { textRef } from '@/engine/marks'

/**
 * The frame an ordinary slide is drawn in: a head zone at the top-left holding the
 * claim (the first heading) and the lead (the paragraph right after it), then a body
 * zone below it holding every other block. The slide no longer centres its content;
 * the claim sits in the same place on every slide, and a slide with more content than
 * the 16:9 floor simply grows (no fixed height or clipping anywhere in here).
 *
 * Which block plays which part comes from `slotsOf`, which returns indices only. Each
 * block is drawn once, under its own original index (the claim and lead through
 * `Heading` and `BlockRenderer`, which wrap themselves in `Adjustable`), so nudges,
 * marks and selection address it exactly as before. Zone wrappers sit outside those
 * holders and are not elements of their own.
 *
 * A card with no heading has no head element at all. `aside` draws a photo beside
 * the text column from the slide's 640px width up (stacked below it); without it the
 * photo's index stays in the body list, so the caller draws it where it sits. A card
 * with a second photo keeps that one in the body, drawn where it sits.
 */
export function SlideFrame({
  blocks,
  variant,
  children,
  aside,
}: {
  blocks: ContentBlock[]
  variant: VisualStyle
  /** Draws the body zone. Receives the body indices from `slotsOf`, ascending. */
  children: (body: number[]) => ReactNode
  /**
   * The photo drawn beside the text column; absent = the photo index stays in `body`.
   * `index` names the block the caller drew as the aside, so the frame leaves exactly
   * that index out of `body`; without it the frame leaves out the card's lone photo
   * (`slotsOf().aside`), which is none when the card holds two or more.
   */
  aside?: { node: ReactNode; side: 'left' | 'right'; width: 'half' | 'wide'; index?: number }
}): ReactElement {
  const slots = slotsOf(blocks)
  const claim = slots.claim !== null ? blocks[slots.claim] : null
  const lead = slots.lead !== null ? blocks[slots.lead] : null
  // Everything that is not the claim or the lead, ascending; the aside's own index
  // is taken out only when the caller draws an aside.
  const rest = slots.aside === null ? slots.body : [...slots.body, slots.aside].sort((a, b) => a - b)
  const asideIndex = aside ? (aside.index ?? slots.aside) : null
  const body = asideIndex === null ? rest : rest.filter((index) => index !== asideIndex)

  const head =
    slots.claim !== null && claim?.type === 'heading' ? (
      <div
        data-slot="head"
        className="flex flex-col"
        style={{ gap: SLIDE_GAP.tight, maxWidth: aside ? '100%' : '80%' }}
      >
        <Heading
          text={claim.text}
          textRef={textRef(slots.claim, 'text')}
          size={claim.size}
          variant={variant}
        />
        {slots.lead !== null && lead && (
          <BlockRenderer block={lead} index={slots.lead} lead />
        )}
      </div>
    ) : null

  const text = (
    <>
      {head}
      <div
        data-slot="body"
        className="flex flex-1 flex-col"
        style={head ? { marginTop: SLIDE_GAP.section } : undefined}
      >
        {children(body)}
      </div>
    </>
  )

  if (!aside) return <div className="flex flex-1 flex-col">{text}</div>

  const columns =
    aside.width === 'half'
      ? '@min-[640px]:grid-cols-[1fr_1fr]'
      : aside.side === 'left'
        ? '@min-[640px]:grid-cols-[3fr_2fr]'
        : '@min-[640px]:grid-cols-[2fr_3fr]'
  const photo = (
    <div data-slot="aside" className="min-w-0">
      {aside.node}
    </div>
  )
  return (
    <div
      className={`flex flex-1 flex-col @min-[640px]:grid @min-[640px]:items-start ${columns}`}
      style={{ gap: SLIDE_GAP.section }}
    >
      {aside.side === 'left' && photo}
      <div className="flex min-w-0 flex-1 flex-col">{text}</div>
      {aside.side === 'right' && photo}
    </div>
  )
}
