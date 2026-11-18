import { describe, expect, it } from 'vitest'
import { cardFromRowForTest, cardRowForTest } from './presentationStore'
import type { Card } from '@/engine/contentBlocks'

/*
  The editor holds `kicker: ""` while its run is open, and a debounced save can land before
  editing ends. The read boundary says what a deck reads back as: no kicker.
*/
const card = (kicker: string): Card => ({
  id: 'c',
  orderIndex: 0,
  layout: 'auto',
  visualStyle: 'structured',
  blocks: [{ type: 'heading', text: 'Loops', kicker }, { type: 'paragraph', text: 'Body' }],
  inline: { '0:kicker': { marks: [{ type: 'bold', start: 0, end: 1 }] } },
})

describe('kicker at the read boundary', () => {
  it.each([[''], ['  ']])('reads a stored %j kicker back as absent, with its marks', (kicker) => {
    const row = cardRowForTest('p', card(kicker))
    const back = cardFromRowForTest({ ...row, visual_style: 'structured' })
    expect('kicker' in back.blocks[0]).toBe(false)
    expect(back.inline?.['0:kicker']).toBeUndefined()
  })

  it('keeps a kicker with words, and its marks', () => {
    const row = cardRowForTest('p', card('Part one'))
    const back = cardFromRowForTest({ ...row, visual_style: 'structured' })
    expect(back.blocks[0]).toMatchObject({ kicker: 'Part one' })
    expect(back.inline?.['0:kicker']).toBeDefined()
  })
})
