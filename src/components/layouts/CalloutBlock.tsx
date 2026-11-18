import type { VisualStyle } from '@/engine/contentBlocks'
import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT, SLIDE_GAP, SLIDE_SIZE } from '@/lib/theme-tokens'
import { EditableText } from './EditableText'
import { CALLOUT_FILLED_ATTR } from './adjustContext'
import { SMALL_CAPS_STYLE, smallCapsWeight } from './smallCaps'

/** The tint a callout that is not the accent owner sits on (the comparison panel's rule: surface in a deep ground, page in a zone panel). */
const QUIET_PANEL_BG = 'var(--slide-panel-bg, var(--slide-ground-tint))'

/**
 * The key idea of a slide: a rounded panel filled with the theme accent, its label in small capitals
 * above the text (the kicker's look, in the panel's ink), the text at the lead size. It is the slide's
 * one accent fill (`accentOwner` names the first callout), so it marks itself `data-accent-owner` only
 * when it is that block; a second callout is filled too but carries no mark. The ink is
 * `text-slide-accent-foreground`, which the stylesheet's colour rules leave alone, and on a deep slide
 * the re-pointed (inverted) accent, like any accent fill there. One element, so the `Adjustable` around
 * it moves, sizes and selects the whole panel. Only the owner is filled: any other callout on the slide is
 * drawn on the tint (`data-callout-quiet`), accent-text label, foreground text, so the slide keeps one fill.
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
      {...(owner ? { 'data-accent-owner': '', [CALLOUT_FILLED_ATTR]: '' } : { 'data-callout-quiet': '' })}
      className={`min-w-0 max-w-prose rounded-slide ${owner ? 'bg-slide-accent text-slide-accent-foreground' : 'text-slide-foreground'}`}
      style={{
        fontFamily: SLIDE_BODY_FONT,
        padding: SLIDE_GAP.group,
        ...(owner ? {} : { background: QUIET_PANEL_BG }),
      }}
    >
      {label && (
        <p
          data-callout-label=""
          className={`${smallCapsWeight(variant)} uppercase${owner ? '' : ' text-slide-accent'}`}
          style={SMALL_CAPS_STYLE}
        >
          <EditableText textRef={textRef(index, 'label')} value={label} />
        </p>
      )}
      <p style={{ fontSize: SLIDE_SIZE.lead, lineHeight: 1.35 }}>
        <EditableText textRef={textRef(index, 'text')} value={text} />
      </p>
    </div>
  )
}
