import { describe, expect, it } from 'vitest'
import { cardFromRowForTest, cardRowForTest } from './presentationStore'
import type { Card } from '@/engine/contentBlocks'

const baseCard: Card = {
  id: 'card-1',
  orderIndex: 0,
  blocks: [{ type: 'heading', text: 'Title' }],
  layout: 'auto',
  visualStyle: 'structured',
}

describe('narration round-trip through the card row', () => {
  it('writes a script to the row and reads it back unchanged', () => {
    const card: Card = { ...baseCard, narration: { text: 'Spoken.', generated: 'Spoken.' } }
    const row = cardRowForTest('pres-1', card)
    expect(row.narration).toEqual({ text: 'Spoken.', generated: 'Spoken.' })
    expect(cardFromRowForTest({ ...row, visual_style: 'structured' }).narration).toEqual({
      text: 'Spoken.',
      generated: 'Spoken.',
    })
  })

  it('keeps an edit distinct from the generated copy across the round-trip', () => {
    const card: Card = { ...baseCard, narration: { text: 'Mine.', generated: 'Theirs.' } }
    const row = cardRowForTest('pres-1', card)
    expect(cardFromRowForTest({ ...row, visual_style: 'structured' }).narration).toEqual({
      text: 'Mine.',
      generated: 'Theirs.',
    })
  })

  it('writes the empty object for a card with no script', () => {
    expect(cardRowForTest('pres-1', baseCard).narration).toEqual({})
  })

  /*
    Every row written before migration 0008 reads back as '{}'. Treating that as
    a script would mark an entire pre-existing deck as narrated.
  */
  it('reads a pre-0008 row back as a card with no script', () => {
    const row = cardRowForTest('pres-1', baseCard)
    const card = cardFromRowForTest({ ...row, visual_style: 'structured', narration: {} })
    expect(card.narration).toBeUndefined()
  })

  it('reads a row missing the column entirely back as a card with no script', () => {
    const row = cardRowForTest('pres-1', baseCard)
    const withoutColumn: Record<string, unknown> = { ...row, visual_style: 'structured' }
    delete withoutColumn.narration
    const card = cardFromRowForTest(withoutColumn)
    expect(card.narration).toBeUndefined()
  })
})
