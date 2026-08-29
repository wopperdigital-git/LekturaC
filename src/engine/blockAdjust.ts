import { z } from 'zod'

/*
  Per-element nudges on top of the layout the engine already chose.

  The layout engine still arranges every card. What this adds is the ability to
  take one element and move or resize it *in place*, on the slide as it already
  looks — no separate free-form canvas, no mode to switch into, and no moment
  where the card changes appearance. An element nobody has touched has no entry
  here at all and is positioned entirely by its layout component.

  Which is why an adjustment is a **delta, not a position**. Storing absolute
  coordinates would mean deciding where every *other* element goes too, and the
  whole point is that the other elements keep flowing exactly as they did. `dx`
  and `dy` say "this far from wherever the layout put you", so a card whose
  text is later edited — or whose layout variety is switched — still puts the
  nudged element sensibly relative to its neighbours.

  Units are **fractions of the card's content width**, never CSS pixels. A slide
  card is responsive: `max-w-5xl` on a wide window, narrower on a laptop, 800px
  wide in the outline thumbnail, and different again in the presenter view. A
  pixel offset captured at one of those widths is wrong at all the others, while
  a fraction reproduces the same arrangement at every size.

  Height is a fraction of *width* too, not of height. That is deliberate: the
  card has no fixed height (it grows with its content), so there is no stable
  denominator for vertical measurements — and measuring both axes against width
  keeps a resized element's aspect ratio stable as the card resizes, instead of
  distorting it.
*/

export const blockAdjustSchema = z.object({
  /** Horizontal displacement from the layout's own position, ÷ card content width. */
  dx: z.number(),
  /** Vertical displacement, also ÷ card content width — see the note above. */
  dy: z.number(),
  /**
   * Explicit size, ÷ card content width. Absent until the element is actually
   * resized, which is what lets a moved-but-not-resized element keep sizing to
   * its own content — including reflowing when its text is edited.
   */
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  /** Clockwise degrees about the element's centre. */
  rotation: z.number(),
})

export type BlockAdjust = z.infer<typeof blockAdjustSchema>

/** Adjustments for one card, keyed by the block's index in `card.blocks` as a string. */
export const adjustsSchema = z.record(z.string(), blockAdjustSchema)

export type BlockAdjusts = z.infer<typeof adjustsSchema>

/** An untouched element: no displacement, no size override, no rotation. */
export const NO_ADJUST: BlockAdjust = { dx: 0, dy: 0, rotation: 0 }

/**
 * Parses a `cards.adjusts` value from Supabase.
 *
 * Tolerant per *entry*, the same way `parseTextStyle` is tolerant per field: one
 * malformed rectangle drops that single element back to its layout position
 * rather than discarding every other nudge on the card, and a row written by an
 * older build reads back as a card nobody has adjusted — which it was.
 */
export function parseAdjusts(raw: unknown): BlockAdjusts | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: BlockAdjusts = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = blockAdjustSchema.safeParse(value)
    if (parsed.success) out[key] = parsed.data
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/*
  Stored values are rounded to five decimals.

  A drag emits an adjustment per pointer event and floats accumulate noise fast.
  Five decimals of a fraction is about a fifth of a pixel on a 1000px card —
  finer than anything visible — and keeps a deck's JSON readable rather than
  full of `0.31999999999999995`.
*/
const round = (n: number) => Math.round(n * 1e5) / 1e5

export function normalizeAdjust(adjust: BlockAdjust): BlockAdjust {
  return {
    dx: round(adjust.dx),
    dy: round(adjust.dy),
    ...(adjust.w === undefined ? {} : { w: round(adjust.w) }),
    ...(adjust.h === undefined ? {} : { h: round(adjust.h) }),
    rotation: round(adjust.rotation),
  }
}

/** True when an adjustment would render identically to no adjustment at all. */
export function isNeutral(adjust: BlockAdjust): boolean {
  return (
    adjust.dx === 0 &&
    adjust.dy === 0 &&
    adjust.rotation === 0 &&
    adjust.w === undefined &&
    adjust.h === undefined
  )
}

/**
 * The CSS an adjustment turns into, given the card's current content width.
 *
 * `transform` rather than `position: absolute` or margins, and that is the whole
 * trick behind "only the element you touched moves": a transform is applied
 * after layout, so displacing or rotating an element has no effect whatsoever on
 * where its siblings sit. They stay exactly where the layout engine put them.
 *
 * `width`/`height` are the exception and *do* participate in layout — a taller
 * element pushes what follows it down, the way it would in any document. That is
 * the deliberate difference from a free-floating canvas: the element is still in
 * the slide, not on top of it.
 */
export function adjustStyle(
  adjust: BlockAdjust,
  cardWidth: number,
): {
  transform?: string
  width?: string
  height?: string
  maxWidth?: string
  maxHeight?: string
} {
  const px = (fraction: number) => fraction * cardWidth

  const moved = adjust.dx !== 0 || adjust.dy !== 0
  const turned = adjust.rotation !== 0
  const transform = [
    moved ? `translate(${px(adjust.dx)}px, ${px(adjust.dy)}px)` : '',
    turned ? `rotate(${adjust.rotation}deg)` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    ...(transform ? { transform } : {}),
    /*
      `maxWidth: none` alongside the width, and it is not optional.

      Almost every text element in the twelve layouts carries a readability cap
      — `max-w-prose` on paragraphs and bullet lists, `max-w-md`, `max-w-lg`,
      `max-w-2xl` elsewhere. Without lifting it, dragging a paragraph's side
      handle sets a width the cap immediately overrides, and the element simply
      refuses to grow: the box moves, the text does not. The cap has done its
      job by then anyway — it exists to stop *automatic* layout running long,
      and the user has just said how wide they want this one.
    */
    ...(adjust.w === undefined ? {} : { width: `${px(adjust.w)}px`, maxWidth: 'none' }),
    ...(adjust.h === undefined ? {} : { height: `${px(adjust.h)}px`, maxHeight: 'none' }),
  }
}
