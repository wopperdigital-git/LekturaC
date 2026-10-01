import type { Card } from './contentBlocks'
import type { TextStyle, TextStylePatch } from './textStyle'

/*
  A wider style write reaches everything inside it.

  Text style resolves narrowest-first: an element's own style beats its card's,
  which beats the deck's. Left at that, a slide or element that was ever styled on
  its own stops answering to the deck for good — change the deck's colour and the
  title slide, styled once by hand, stays as it was, which reads as broken.

  So a write at a wider scope clears the same fields at the narrower ones: setting
  the deck's colour drops every card's and element's own colour, and setting a
  card's drops its elements'. Only the fields being written, so a slide that was
  given its own alignment keeps it through a deck-wide colour change. Removing a
  field at the wider scope clears the narrower ones too: "use the theme colour"
  for the deck means the whole deck.

  Character marks (a few words made red, a run in another font) are left alone:
  they are emphasis inside a run, not an element's style, and live in `marks`.

  Pure, and shared by the store's writers and the font preview so what a hover
  shows is what a click does.
*/

type StyleKey = keyof TextStyle

/** The fields a patch writes, whether it sets or clears them. */
export function patchKeys(patch: TextStylePatch): StyleKey[] {
  return Object.keys(patch) as StyleKey[]
}

/** An element's style lives in `inline` under its bare block index; a run's entry has an `index:field` key. */
const ELEMENT_KEY = /^\d+$/

function without(style: TextStyle, keys: readonly StyleKey[]): TextStyle {
  const next: TextStyle = { ...style }
  for (const key of keys) delete next[key]
  return next
}

function touches(style: TextStyle | undefined, keys: readonly StyleKey[]): boolean {
  return style !== undefined && keys.some((key) => key in style)
}

/**
 * `card` with `keys` removed from every element's own style — and from the
 * card's own style too with `includeCard`, which is what a deck-wide write wants.
 * A card with nothing to clear is returned as it was, the same object.
 */
export function clearStyleOverrides(card: Card, keys: readonly StyleKey[], includeCard: boolean): Card {
  let next = card

  if (includeCard && touches(card.textStyle, keys)) {
    next = { ...next, textStyle: without(card.textStyle!, keys) }
  }

  const inline = card.inline
  if (inline && Object.entries(inline).some(([ref, entry]) => ELEMENT_KEY.test(ref) && touches(entry.style, keys))) {
    const cleared: NonNullable<Card['inline']> = {}
    for (const [ref, entry] of Object.entries(inline)) {
      if (!ELEMENT_KEY.test(ref) || !touches(entry.style, keys)) {
        cleared[ref] = entry
        continue
      }
      const style = without(entry.style!, keys)
      const { style: _dropped, ...rest } = entry
      const kept = Object.keys(style).length > 0 ? { ...rest, style } : rest
      // An entry left with nothing in it is not kept as an empty shell.
      if (Object.keys(kept).length > 0) cleared[ref] = kept
    }
    next = { ...next, inline: cleared }
  }

  return next
}

/** Every card with `keys` cleared at card and element level. The same array when nothing changed. */
export function clearDeckOverrides(cards: Card[], keys: readonly StyleKey[]): Card[] {
  const next = cards.map((card) => clearStyleOverrides(card, keys, true))
  return next.some((card, i) => card !== cards[i]) ? next : cards
}
