import type { VisualStyle } from '@/engine/contentBlocks'
import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT, SLIDE_GAP, SLIDE_SIZE } from '@/lib/theme-tokens'
import { EditableText } from './EditableText'
import { SMALL_CAPS_STYLE, smallCapsWeight } from './smallCaps'

/**
 * The key idea of a slide: a rounded panel filled with the theme accent, its label in small capitals
 * above the text (the kicker's look, in the panel's ink), the text at the lead size. It is the slide's
 * one accent fill (`accentOwner` names the first callout), so it marks itself `data-accent-owner` only
 * when it is that block; a second callout is filled too but carries no mark. The ink is
 * `text-slide-accent-foreground`, which the stylesheet's colour rules leave alone, and on a deep slide
 * the re-pointed (inverted) accent, like any accent fill there. One element, so the `Adjustable` around
 * it moves, sizes and selects the whole panel.
 */
export function CalloutBlock({
  index,
  label,
  text,
  owner,
  variant,
}: {
  index: number
  label?: string
  text: string
  /** Whether this is the slide's accent owner (`SlideFacts.accentOwner`). */
  owner: boolean
  variant?: VisualStyle
}) {
  return (
    <div
      data-callout=""
      data-accent-owner={owner ? '' : undefined}
      className="min-w-0 max-w-prose rounded-slide bg-slide-accent text-slide-accent-foreground"
      style={{ fontFamily: SLIDE_BODY_FONT, padding: SLIDE_GAP.group }}
    >
      {label && (
        <p data-callout-label="" className={`${smallCapsWeight(variant)} uppercase`} style={SMALL_CAPS_STYLE}>
          <EditableText textRef={textRef(index, 'label')} value={label} />
        </p>
      )}
      <p style={{ fontSize: SLIDE_SIZE.lead, lineHeight: 1.35 }}>
        <EditableText textRef={textRef(index, 'text')} value={text} />
      </p>
    </div>
  )
}
