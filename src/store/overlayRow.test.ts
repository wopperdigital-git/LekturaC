import { describe, expect, it } from 'vitest'
import { cardFromRowForTest, cardRowForTest, overlaysToWrite } from './presentationStore'
import type { Card } from '@/engine/contentBlocks'
import type { Stroke } from '@/engine/overlay'

const stroke = (id: string): Stroke => ({
  id,
  kind: 'stroke',
  tool: 'pen',
  color: 'accent',
  width: 0.007,
  points: [[0.1, 0.1], [0.2, 0.2]],
})

const baseCard: Card = {
  id: 'card-1',
  orderIndex: 0,
  blocks: [{ type: 'heading', text: 'Title' }],
  layout: 'auto',
  visualStyle: 'structured',
}

describe('overlay and the card row', () => {
  /*
    The rule this whole design rests on: `cardRow` is the upsert every card write
    goes through, so a column named there is a column that must exist for *any*
    card to save. Ink is written on its own instead.
  */
  it('never names the overlay column in the row every card save writes', () => {
    const inked: Card = { ...baseCard, overlay: [stroke('a')] }
    expect(Object.keys(cardRowForTest('pres-1', inked))).not.toContain('overlay')
    expect(Object.keys(cardRowForTest('pres-1', baseCard))).not.toContain('overlay')
  })

  it('reads a stored overlay back off a row', () => {
    const row = { ...cardRowForTest('pres-1', baseCard), visual_style: 'structured', overlay: [stroke('a')] }
    expect(cardFromRowForTest(row).overlay).toEqual([stroke('a')])
  })

  // The column defaults to '[]'; reading that as "has ink" would mark every old deck as drawn on.
  it('reads the empty default, and a database without the column, as no ink', () => {
    const row = { ...cardRowForTest('pres-1', baseCard), visual_style: 'structured' }
    expect(cardFromRowForTest({ ...row, overlay: [] }).overlay).toBeUndefined()
    expect(cardFromRowForTest(row).overlay).toBeUndefined()
  })
})

describe('overlaysToWrite', () => {
  const a: Card = { ...baseCard, id: 'a', overlay: [stroke('s1')] }
  const b: Card = { ...baseCard, id: 'b', orderIndex: 1 }

  it('lists only the cards whose ink differs', () => {
    const drawnOn: Card = { ...b, overlay: [stroke('s2')] }
    expect(overlaysToWrite([a, b], [a, drawnOn]).map((c) => c.id)).toEqual(['b'])
    expect(overlaysToWrite([a, b], [a, b])).toEqual([])
  })

  it('includes a card whose ink was just erased, so the cleared list is written', () => {
    const erased: Card = { ...a, overlay: undefined }
    expect(overlaysToWrite([a, b], [erased, b]).map((c) => c.id)).toEqual(['a'])
  })

  // Undoing a card's deletion re-inserts its row through the plain upsert, which
  // has no overlay column; its ink has to be written back separately.
  it('includes a card that reappears with ink (undo of a delete)', () => {
    expect(overlaysToWrite([b], [a, b]).map((c) => c.id)).toEqual(['a'])
  })

  it('does not write a card that reappears with no ink', () => {
    expect(overlaysToWrite([a], [a, b]).map((c) => c.id)).toEqual([])
  })
})
