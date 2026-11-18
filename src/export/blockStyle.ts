import type { Card } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { TextStyle } from '@/engine/textStyle'
import { parseTextRef } from '@/engine/blockText'
import { faceName, resolveRunStyle } from './textRun'

/*
  How a card's stored formatting reaches one run of exported text: the type-scale
  steps, the two faces, and the marks and typography stored for a run's address.
  Shared by the arrangements in `slideRenderers.ts` and the structured blocks in
  `structuredBlocks.ts`, so both read a run's style the same way.
*/

/** Index into `theme.typography.scale`. */
export const H1 = 0
export const H2 = 1
export const H3 = 2
export const BODY = 3

export function headingFace(theme: ThemeTokens, style: TextStyle): string {
  return faceName(style.fontFamily ?? theme.typography.headingFont)
}

export function bodyFace(theme: ThemeTokens, style: TextStyle): string {
  return faceName(style.fontFamily ?? theme.typography.bodyFont)
}

/** Marks stored for one run of text, or undefined if nobody formatted it. */
export function marksFor(card: Card, ref: string) {
  return card.inline?.[ref]?.marks
}

/** The merged style for one run, with its own inline overrides on top. */
export function styleFor(card: Card, ref: string, style: TextStyle): TextStyle {
  /*
    Three levels, narrowest last: deck and card (already merged into `style`),
    then the element the run belongs to, then the run itself.

    The element's own typography — what the toolbar writes while an element is
    selected — lives under the bare block index, not under any run's ref (see
    `blockStyleKey` in the editor). It used to be skipped here, so a font, size,
    alignment or colour set on one selected element showed on screen and vanished
    from the exported file. Written as `String(index)` because `src/export/` may
    not import from a component.
  */
  return resolveRunStyle(resolveRunStyle(style, elementStyleOf(card, ref)), card.inline?.[ref]?.style)
}

/** The typography set on the whole element a run belongs to, or undefined if nobody set any. */
export function elementStyleOf(card: Card, ref: string | null): TextStyle | undefined {
  const block = ref ? parseTextRef(ref)?.blockIndex : undefined
  return block === undefined ? undefined : card.inline?.[String(block)]?.style
}

/**
 * `true` when `ref` carries a bold mark anywhere in its text, else `undefined`
 * (never `false`) — so setting it on a `FitParagraph` can only ever *add*
 * bold to the measurement, never strip a box-level bold already carried by
 * `sizing.bold` (e.g. a heading). Conservative on purpose: a paragraph with
 * even one bold word is measured as if it were entirely bold, which can only
 * overestimate its width and never under-fit it. `ref` is `null` for the
 * composite lines (`flattenBlocks`'s stat/timeline/quote-with-attribution
 * text) that join two separately-addressed runs with no single ref to read.
 */
export function markBold(card: Card, ref: string | null): true | undefined {
  if (!ref) return undefined
  return marksFor(card, ref)?.some((mark) => mark.type === 'bold') ? true : undefined
}

/**
 * The largest size multiple any size mark on `ref` sets, or `undefined` if none
 * enlarges it. Only enlargement matters to the fit — a run set *smaller* than the
 * box's size cannot make its paragraph taller — and, like `markBold`, it is
 * deliberately conservative: a paragraph with one enlarged word is measured as if
 * every word were that size.
 */
export function markScale(card: Card, ref: string | null): number | undefined {
  if (!ref) return undefined
  let largest = 1
  for (const mark of marksFor(card, ref) ?? []) {
    if (mark.type === 'fontScale' && typeof mark.value === 'number') largest = Math.max(largest, mark.value)
  }
  return largest > 1 ? largest : undefined
}

