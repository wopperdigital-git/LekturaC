import { z } from 'zod'

/*
  Deck-wide text formatting — the toolbar's Level 1 tools.

  These are *overrides* layered on top of whatever the deck's theme already
  says. Every field is optional and an absent field means "leave the theme
  alone", which is why the persisted shape is `{}` for a deck nobody has
  touched rather than a fully-populated object. Storing resolved values instead
  would freeze a deck's typography at whatever the theme happened to say the
  day the toolbar was first opened, and switching themes afterwards would stop
  changing the type.

  Scope note: this is the deck level. Card-level (Level 2) and character-level
  (Level 3) formatting are deliberately *not* modelled here — Level 3 needs
  marks at text offsets, which changes `ContentBlock` itself, and folding that
  into this flat shape now would build the wrong foundation for it.
*/

export const TEXT_ALIGNMENTS = ['left', 'center', 'right'] as const
export type TextAlign = (typeof TEXT_ALIGNMENTS)[number]

/**
 * Font choices offered by the toolbar. Values are full CSS stacks so a missing
 * webfont degrades to something in the same genre rather than to Times.
 */
export const FONT_CHOICES = [
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Arial Black', value: "'Arial Black', 'Helvetica Neue', sans-serif" },
  { label: 'Courier', value: "'Courier New', ui-monospace, monospace" },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
] as const

/*
  Size is a multiplier, not a pixel value. A theme defines a whole scale
  (h1/h2/h3/body) whose steps carry its hierarchy; setting an absolute size
  would flatten every level to the same number and destroy that. Scaling keeps
  the ratios and just makes the deck larger or smaller.
*/
export const MIN_FONT_SCALE = 0.7
export const MAX_FONT_SCALE = 1.6
export const FONT_SCALE_STEP = 0.1

export const textStyleSchema = z.object({
  fontFamily: z.string().min(1).optional(),
  fontScale: z.number().min(MIN_FONT_SCALE).max(MAX_FONT_SCALE).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(TEXT_ALIGNMENTS).optional(),
})

export type TextStyle = z.infer<typeof textStyleSchema>

export const EMPTY_TEXT_STYLE: TextStyle = {}

/**
 * Parses a `presentations.text_style` value from Supabase.
 *
 * Tolerant by design: a row written by an older build (or hand-edited in the
 * dashboard) must not break loading the deck, so anything unparseable falls
 * back to "no overrides" instead of throwing.
 */
export function parseTextStyle(raw: unknown): TextStyle {
  const result = textStyleSchema.safeParse(raw ?? {})
  return result.success ? result.data : EMPTY_TEXT_STYLE
}

/** Clamps to the toolbar's range and rounds off float drift from repeated stepping. */
export function clampFontScale(scale: number): number {
  const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, scale))
  return Math.round(clamped * 100) / 100
}

/**
 * Resolves the style for one card: card-level fields win, field by field, over
 * the deck's.
 *
 * Per *field*, not whole-object — a card that only sets `align` must still
 * inherit the deck's font and bold, which a plain `card ?? deck` would throw
 * away. This is the only place the precedence order is expressed, so the
 * canvas, the outline thumbnails and the presenter view can't disagree about
 * what a card looks like.
 */
export function mergeTextStyle(deck: TextStyle, card: TextStyle | undefined): TextStyle {
  return { ...deck, ...(card ?? EMPTY_TEXT_STYLE) }
}
