import type { Card } from './contentBlocks'
import { applyValueMark, type TextRange } from './marks'
import type { TypographyScope } from './textScope'
import { applyTextStylePatch, type TextStyle } from './textStyle'

/*
  Previewing a font while the pointer is over it.

  The preview is a *derived copy* of the deck's data with the font applied exactly
  where a click would write it — nothing is stored, nothing is pushed to history,
  and moving the pointer away simply stops deriving. That is the whole reason it
  is a pure function over the same three scopes the toolbar writes to: the preview
  and the real edit cannot disagree about what they change.
*/

export interface FontPreviewTarget {
  /** What the font tool would write to: the element, else the card, else the deck. */
  scope: TypographyScope
  /** The `card.inline` key for the selected element (its bare block index), when there is one. */
  typographyRef: string | null
  /**
   * Characters selected inside a run being edited. The narrowest scope there is,
   * so when it is present the font goes to those characters and nothing wider —
   * the same routing the toolbar uses.
   */
  run: { cardId: string; ref: string; range: TextRange } | null
}

export interface PreviewedDeck {
  cards: Card[]
  textStyle: TextStyle
}

/**
 * The deck as it would look with `fontFamily` applied at `target`. `null` previews
 * the theme's own font (clearing any override); the inputs are never mutated and a
 * card the preview does not touch keeps its identity.
 */
export function previewFont(
  cards: Card[],
  deckTextStyle: TextStyle,
  target: FontPreviewTarget,
  fontFamily: string | null,
): PreviewedDeck {
  const patch = { fontFamily }

  if (target.run && target.run.range.end > target.run.range.start) {
    const { cardId, ref, range } = target.run
    return {
      textStyle: deckTextStyle,
      cards: cards.map((card) => {
        if (card.id !== cardId) return card
        const entry = card.inline?.[ref] ?? {}
        const marks = applyValueMark(entry.marks ?? [], range, 'fontFamily', fontFamily)
        return { ...card, inline: { ...card.inline, [ref]: { ...entry, marks } } }
      }),
    }
  }

  const { scope } = target
  if (scope.kind === 'deck') {
    return { cards, textStyle: applyTextStylePatch(deckTextStyle, patch) }
  }

  return {
    textStyle: deckTextStyle,
    cards: cards.map((card) => {
      if (card.id !== scope.cardId) return card
      if (scope.kind === 'card') {
        return { ...card, textStyle: applyTextStylePatch(card.textStyle ?? {}, patch) }
      }
      // An element with no addressable style key has nothing to preview on.
      if (target.typographyRef === null) return card
      const entry = card.inline?.[target.typographyRef] ?? {}
      const style = applyTextStylePatch(entry.style ?? {}, patch)
      return { ...card, inline: { ...card.inline, [target.typographyRef]: { ...entry, style } } }
    }),
  }
}
