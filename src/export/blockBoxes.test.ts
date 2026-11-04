import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@/engine/contentBlocks'
import { CALIBRATION_SCALE, cardBoxes } from './blockBoxes'

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')
const blocks: ContentBlock[] = [
  { type: 'heading', text: 'Heading' },
  { type: 'paragraph', text: words(40) },
  { type: 'bulletList', items: ['a', 'b', 'c'] },
  { type: 'stat', value: '50%', label: 'lost' },
  { type: 'quote', text: words(30), attribution: 'Someone' },
]
const card = { blocks, adjusts: undefined }

describe('cardBoxes follows the theme type scale', () => {
  it('is the calibrated baseline at the calibration scale (and with none given)', () => {
    expect(cardBoxes(card, CALIBRATION_SCALE)).toEqual(cardBoxes(card))
    // 40 words of 'word ' = 199 chars over 62 per line = 4 lines of 0.028.
    expect(cardBoxes(card).boxes['1'].h).toBeCloseTo(4 * 0.028, 6)
  })

  it('gives every text block a taller box at a larger scale', () => {
    const base = cardBoxes(card).boxes
    const big = cardBoxes(card, [3.5, 2.5, 1.625, 1.25]).boxes
    for (const key of ['0', '1', '2', '3', '4']) {
      expect(big[key].h, `block ${key}`).toBeGreaterThan(base[key].h)
    }
  })

  it('fits fewer characters on a line when the body is larger', () => {
    // 62 chars fit one line at the calibration scale, but not at 1.25x.
    const one: ContentBlock[] = [{ type: 'paragraph', text: 'x'.repeat(62) }]
    expect(cardBoxes({ blocks: one, adjusts: undefined }).boxes['0'].h).toBeCloseTo(0.028, 6)
    expect(
      cardBoxes({ blocks: one, adjusts: undefined }, [3.5, 2.5, 1.625, 1.25]).boxes['0'].h,
    ).toBeCloseTo(2 * 0.028 * 1.25, 6)
  })
})
