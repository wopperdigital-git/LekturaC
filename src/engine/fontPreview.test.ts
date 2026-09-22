import { describe, expect, it } from 'vitest'
import type { Card } from './contentBlocks'
import { previewFont, type FontPreviewTarget } from './fontPreview'

const FONT = 'Georgia, serif'

const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  orderIndex: 0,
  blocks: [
    { type: 'heading', text: 'Title' },
    { type: 'paragraph', text: 'Some prose' },
  ],
  layout: 'auto',
  visualStyle: 'structured',
  ...extra,
})

const target = (over: Partial<FontPreviewTarget>): FontPreviewTarget => ({
  scope: { kind: 'deck' },
  typographyRef: null,
  run: null,
  ...over,
})

describe('previewFont', () => {
  it('previews on the deck when nothing is selected, leaving every card alone', () => {
    const cards = [card('a'), card('b')]
    const result = previewFont(cards, {}, target({}), FONT)
    expect(result.textStyle).toEqual({ fontFamily: FONT })
    expect(result.cards).toBe(cards)
  })

  it('previews on the selected card only', () => {
    const cards = [card('a'), card('b')]
    const result = previewFont(cards, {}, target({ scope: { kind: 'card', cardId: 'a' } }), FONT)
    expect(result.cards[0].textStyle).toEqual({ fontFamily: FONT })
    expect(result.cards[1]).toBe(cards[1])
    expect(result.textStyle).toEqual({})
  })

  it('previews on the selected element under its bare block index', () => {
    const cards = [card('a')]
    const result = previewFont(
      cards,
      {},
      target({ scope: { kind: 'element', cardId: 'a', blockIndex: 1 }, typographyRef: '1' }),
      FONT,
    )
    expect(result.cards[0].inline?.['1']?.style).toEqual({ fontFamily: FONT })
    // No other element and not the card as a whole.
    expect(result.cards[0].textStyle).toBeUndefined()
  })

  it('sends the font to the selected characters when there are any, and nowhere wider', () => {
    const cards = [card('a')]
    const result = previewFont(
      cards,
      {},
      target({
        scope: { kind: 'element', cardId: 'a', blockIndex: 1 },
        typographyRef: '1',
        run: { cardId: 'a', ref: '1:text', range: { start: 0, end: 4 } },
      }),
      FONT,
    )
    expect(result.cards[0].inline?.['1:text']?.marks).toEqual([
      { type: 'fontFamily', start: 0, end: 4, value: FONT },
    ])
    expect(result.cards[0].inline?.['1']).toBeUndefined()
  })

  it('treats a collapsed caret as no selection, so the element takes the preview', () => {
    const result = previewFont(
      [card('a')],
      {},
      target({
        scope: { kind: 'element', cardId: 'a', blockIndex: 1 },
        typographyRef: '1',
        run: { cardId: 'a', ref: '1:text', range: { start: 2, end: 2 } },
      }),
      FONT,
    )
    expect(result.cards[0].inline?.['1']?.style).toEqual({ fontFamily: FONT })
  })

  it('previews the theme font (null) by clearing the override', () => {
    const cards = [card('a', { textStyle: { fontFamily: FONT, bold: true } })]
    const result = previewFont(cards, {}, target({ scope: { kind: 'card', cardId: 'a' } }), null)
    expect(result.cards[0].textStyle).toEqual({ bold: true })
  })

  it('never mutates its inputs', () => {
    const cards = [card('a', { textStyle: { bold: true } })]
    const deck = { italic: true }
    previewFont(cards, deck, target({ scope: { kind: 'card', cardId: 'a' } }), FONT)
    previewFont(cards, deck, target({}), FONT)
    expect(cards[0].textStyle).toEqual({ bold: true })
    expect(deck).toEqual({ italic: true })
  })
})
