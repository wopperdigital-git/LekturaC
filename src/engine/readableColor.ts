import { contrastRatio } from '@/lib/theme-tokens'
import type { Card } from './contentBlocks'
import { HEX_COLOR, type TextStyle } from './textStyle'

/*
  A picked text colour that cannot be read on the deck's theme is dropped.

  Colours are fixed hexes on purpose, so a pick survives a theme switch — but
  that also carries "Black", picked on a light theme, onto Deep Space or Solar
  Flare, where it is near-black on near-black and the text all but vanishes.
  Dropping it hands the text back to the theme's own colour, which every
  palette is AA-checked for.

  Applies to every place a colour is stored: the deck's, each card's, each
  element's own style, and colour marks on characters. Only colours below
  `MIN_TEXT_CONTRAST` against the slide background go; a readable pick stays,
  whatever the theme.

  Pure; the store runs it when the theme changes and when a deck is opened.
*/

/** WCAG's floor for large text, and so a floor nobody could mean to go below on a slide. */
export const MIN_TEXT_CONTRAST = 3

/** Whether `color` can be read on `background`. Anything that is not a `#rrggbb` is left to the theme and counts as readable. */
export function isReadableOn(color: unknown, background: string): boolean {
  if (typeof color !== 'string' || !HEX_COLOR.test(color) || !HEX_COLOR.test(background)) return true
  return contrastRatio(color, background) >= MIN_TEXT_CONTRAST
}

function readableStyle(style: TextStyle | undefined, background: string): TextStyle | undefined {
  if (!style || isReadableOn(style.color, background)) return style
  const { color: _unreadable, ...rest } = style
  return rest
}

function readableCard(card: Card, background: string): Card {
  const textStyle = readableStyle(card.textStyle, background)

  let inline = card.inline
  if (inline) {
    let changed = false
    const next: NonNullable<Card['inline']> = {}
    for (const [ref, entry] of Object.entries(inline)) {
      const style = readableStyle(entry.style, background)
      const marks = entry.marks?.filter((mark) => mark.type !== 'color' || isReadableOn(mark.value, background))
      if (style === entry.style && marks?.length === entry.marks?.length) {
        next[ref] = entry
        continue
      }
      changed = true
      const kept = { ...entry, style, marks }
      if (!style || Object.keys(style).length === 0) delete kept.style
      if (!marks || marks.length === 0) delete kept.marks
      if (Object.keys(kept).length > 0) next[ref] = kept
    }
    if (changed) inline = next
  }

  return textStyle === card.textStyle && inline === card.inline ? card : { ...card, textStyle, inline }
}

/**
 * The deck with every unreadable colour on `background` removed. Returns the
 * inputs themselves (the same objects) wherever nothing had to go.
 */
export function dropUnreadableColors(
  cards: Card[],
  textStyle: TextStyle,
  background: string,
): { cards: Card[]; textStyle: TextStyle } {
  const nextCards = cards.map((card) => readableCard(card, background))
  return {
    cards: nextCards.some((card, i) => card !== cards[i]) ? nextCards : cards,
    textStyle: readableStyle(textStyle, background) ?? textStyle,
  }
}
