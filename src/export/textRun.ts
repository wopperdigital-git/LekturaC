import type { TextStyle } from '@/engine/textStyle'
import { EMPTY_TEXT_STYLE } from '@/engine/textStyle'
import type { Mark } from '@/engine/marks'
import { textSegments } from '@/engine/marks'

/*
  A theme's `typography.scale` is in rem; PowerPoint wants points. One constant
  converts, chosen so a 1rem body line lands at 18pt — a normal slide body size.

  Deliberately a single multiplier rather than a per-level table: the theme's
  scale encodes its own hierarchy in the ratios between h1/h2/h3/body, and
  assigning each level an absolute point size would flatten exactly the
  distinction the theme is expressing. This is the same argument
  `engine/textStyle.ts` makes for `fontScale` being a multiplier.
*/
export const PT_PER_REM = 18

/**
 * One family name PowerPoint can resolve, out of a CSS font stack.
 *
 * The app stores stacks (`"'Inter', system-ui, sans-serif"`) so a missing
 * webfont degrades within its genre. PowerPoint has no such concept — it takes
 * one face and substitutes on its own if the machine lacks it — so the export
 * keeps the first family and drops the fallbacks.
 */
export function faceName(cssStack: string): string {
  const first = cssStack.split(',')[0].trim()
  return first.replace(/^['"]|['"]$/g, '')
}

/**
 * The style for one run of text.
 *
 * `deckAndCard` is expected to already be `mergeTextStyle(deck, card)`; this
 * adds the third and last level, the run's own `inline[ref].style`. Merged per
 * *field* for the same reason `mergeTextStyle` is: a run that overrode only
 * `align` must still inherit the deck's font and weight.
 */
export function resolveRunStyle(deckAndCard: TextStyle, inline: TextStyle | undefined): TextStyle {
  return { ...deckAndCard, ...(inline ?? EMPTY_TEXT_STYLE) }
}

/** A rem size from the theme's scale, as whole points, with the user's font scale applied. */
export function pointSize(rem: number, fontScale: number | undefined): number {
  return Math.round(rem * (fontScale ?? 1) * PT_PER_REM)
}

/** One entry of a pptxgenjs rich-text array. */
export interface PptxTextRun {
  text: string
  options: Record<string, unknown>
}

/**
 * Splits text into the runs its bold/italic marks require.
 *
 * `textSegments` already produces the shortest uniform split, which is exactly
 * what a pptxgenjs rich-text array wants — so this is a shape change and not a
 * second implementation of mark resolution.
 *
 * A `false` flag is omitted rather than emitted: pptxgenjs treats an absent
 * option as "inherit the text box default", and writing `bold: false` into
 * every unmarked run would override a heading's own weight.
 */
export function markedRuns(text: string, marks: Mark[] | undefined): PptxTextRun[] {
  return textSegments(text, marks).map((segment) => {
    const options: Record<string, unknown> = {}
    if (segment.bold) options.bold = true
    if (segment.italic) options.italic = true
    return { text: segment.text, options }
  })
}

/** pptxgenjs colors are hex without the leading `#`; theme tokens carry one. */
export function hex(color: string): string {
  return color.replace(/^#/, '')
}
