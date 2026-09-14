import { describe, expect, it } from 'vitest'
import {
  selectionAfterCardPress,
  selectionAfterElementPress,
  typographyScope,
  type Selection,
} from './textScope'

const NOTHING: Selection = { cardId: null, blockIndex: null }

describe('selectionAfterElementPress', () => {
  /*
    The rule the whole scope model rests on. A press on a card nobody has
    selected yet lands on the *card*, however precisely it hit one of its
    elements — which is what makes "this whole slide" a state the user can
    actually get into. Selecting the element in the same press left the card
    scope unreachable in practice, since every element press also selects its
    card and almost every pixel of a card belongs to some element.
  */
  it('selects the card, not the element, when the card was not already selected', () => {
    expect(selectionAfterElementPress(NOTHING, { cardId: 'a', blockIndex: 2 })).toEqual({
      cardId: 'a',
      blockIndex: null,
    })
  })

  it('selects the element once its card is already selected', () => {
    const cardSelected: Selection = { cardId: 'a', blockIndex: null }
    expect(selectionAfterElementPress(cardSelected, { cardId: 'a', blockIndex: 2 })).toEqual({
      cardId: 'a',
      blockIndex: 2,
    })
  })

  it('moves between elements of the selected card without a press in between', () => {
    const onBlockTwo: Selection = { cardId: 'a', blockIndex: 2 }
    expect(selectionAfterElementPress(onBlockTwo, { cardId: 'a', blockIndex: 5 })).toEqual({
      cardId: 'a',
      blockIndex: 5,
    })
  })

  /*
    Crossing to another card drops the element with it. Carrying the index over
    would point the selection box at whatever block happened to sit at that
    position on the new card — a different element, or none.
  */
  it('drops the previous card element when the press lands on a different card', () => {
    const onBlockTwo: Selection = { cardId: 'a', blockIndex: 2 }
    expect(selectionAfterElementPress(onBlockTwo, { cardId: 'b', blockIndex: 2 })).toEqual({
      cardId: 'b',
      blockIndex: null,
    })
  })
})

describe('selectionAfterCardPress', () => {
  // A press that reached the card means it landed *around* the elements, which
  // is the way back out to slide-wide formatting.
  it('selects the card and clears any element', () => {
    expect(selectionAfterCardPress('a')).toEqual({ cardId: 'a', blockIndex: null })
  })

  it('clears everything when the press was on the canvas', () => {
    expect(selectionAfterCardPress(null)).toEqual(NOTHING)
  })
})

describe('typographyScope', () => {
  it('targets the element when one is selected', () => {
    expect(typographyScope({ cardId: 'a', blockIndex: 2 })).toEqual({
      kind: 'element',
      cardId: 'a',
      blockIndex: 2,
    })
  })

  it('targets the whole card when a card is selected but nothing inside it', () => {
    expect(typographyScope({ cardId: 'a', blockIndex: null })).toEqual({ kind: 'card', cardId: 'a' })
  })

  it('targets the deck when nothing is selected', () => {
    expect(typographyScope(NOTHING)).toEqual({ kind: 'deck' })
  })

  // A block index without a card is not a state the editor can reach, but it
  // must not resolve to an element scope with nowhere to write it.
  it('ignores an orphaned block index', () => {
    expect(typographyScope({ cardId: null, blockIndex: 2 })).toEqual({ kind: 'deck' })
  })
})

describe('the press-to-scope path end to end', () => {
  /*
    The two halves are only correct together, and this is the pairing the
    feature is sold on: one press formats the slide, a second press formats the
    one thing you pressed.
  */
  it('formats the slide on the first press and the element on the second', () => {
    const first = selectionAfterElementPress(NOTHING, { cardId: 'a', blockIndex: 2 })
    expect(typographyScope(first)).toEqual({ kind: 'card', cardId: 'a' })

    const second = selectionAfterElementPress(first, { cardId: 'a', blockIndex: 2 })
    expect(typographyScope(second)).toEqual({ kind: 'element', cardId: 'a', blockIndex: 2 })
  })

  it('goes back to the whole slide when the press lands around the elements', () => {
    const onElement: Selection = { cardId: 'a', blockIndex: 2 }
    expect(typographyScope(selectionAfterCardPress('a'))).toEqual({ kind: 'card', cardId: 'a' })
    expect(typographyScope(onElement)).toEqual({ kind: 'element', cardId: 'a', blockIndex: 2 })
  })
})
