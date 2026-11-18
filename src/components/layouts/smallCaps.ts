import type { CSSProperties } from 'react'
import type { VisualStyle } from '@/engine/contentBlocks'
import { SLIDE_GAP, SLIDE_HEADING_FONT, SLIDE_SIZE } from '@/lib/theme-tokens'

/**
 * The small-capitals label look, shared by the kicker and the callout's label (its colour is the
 * caller's): the heading face at the eyebrow size, wide-tracked, `SLIDE_GAP.tight` above what it labels.
 */
export const SMALL_CAPS_STYLE: CSSProperties = {
  fontFamily: SLIDE_HEADING_FONT,
  fontSize: SLIDE_SIZE.eyebrow,
  letterSpacing: '0.12em',
  lineHeight: 1.2,
  marginBottom: SLIDE_GAP.tight,
}

/** The expressive treatment sets small capitals a step heavier. */
export function smallCapsWeight(variant: VisualStyle | undefined): string {
  return variant === 'expressive' ? 'font-bold' : 'font-semibold'
}
