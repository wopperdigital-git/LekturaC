import { describe, expect, it } from 'vitest'
import type { Card, ContentBlock } from './contentBlocks'
import { pointRun, rowPlusCarrier, withBlockInserted } from './insertBlock'
import { MAX_BLOCKS } from './newContent'
import { withBlockRemoved } from './removeElement'
import { textRef } from './marks'

const heading: ContentBlock = { type: 'heading', text: 'Title', kicker: 'Part one' }
const paragraph = (text: string): ContentBlock => ({ type: 'paragraph', text })
const point = (label: string): ContentBlock => ({ type: 'point', label, text: `${label} means` })
const bullets: ContentBlock = { type: 'bulletList', items: ['a', 'b', 'c'] }
const group: ContentBlock = { type: 'comparisonGroup', heading: 'Side', items: ['x', 'y'] }

const bold = { marks: [{ type: 'bold' as const, start: 0, end: 2 }] }
const nudge = (dx: number) => ({ dx, dy: 0.02, rotation: 0 })

type Editable = Pick<Card, 'blocks' | 'inline' | 'adjusts'>

/** Every block carries a mark, its own typography and a nudge, and a list carries per-item runs. */
const FIXTURE: Editable = {
  blocks: [heading, point('A'), point('B'), bullets, paragraph('p'), group],
  inline: {
    [textRef(0, 'text')]: bold,
    [textRef(0, 'kicker')]: bold,
    '0': { style: { align: 'center' } },
    [textRef(1, 'label')]: bold,
    [textRef(1, 'text')]: bold,
    '1': { style: { color: '#112233' } },
    [textRef(2, 'label')]: bold,
    '2': { style: { align: 'right' } },
    [textRef(3, 'items', 0)]: bold,
    [textRef(3, 'items', 2)]: bold,
    '3': { style: { fontScale: 1.2 } },
    [textRef(4, 'text')]: bold,
    '4': { style: { align: 'left' } },
    [textRef(5, 'heading')]: bold,
    [textRef(5, 'items', 1)]: bold,
    '5': { style: { fontScale: 0.9 } },
  },
  adjusts: { '0': nudge(0.1), '1': nudge(0.11), '2': nudge(0.12), '3': nudge(0.13), '4': nudge(0.14), '5': nudge(0.15) },
}

describe('withBlockInserted', () => {
  it('inserts the block at the index and keeps the others in order', () => {
    const result = withBlockInserted(FIXTURE, 2, point('New'))!
    expect(result.blocks).toHaveLength(7)
    expect(result.blocks[2]).toEqual(point('New'))
    expect(result.blocks.slice(0, 2)).toEqual(FIXTURE.blocks.slice(0, 2))
    expect(result.blocks.slice(3)).toEqual(FIXTURE.blocks.slice(2))
  })

  it('renumbers runs, bare-index typography, item runs and nudges from the insert point up', () => {
    const result = withBlockInserted(FIXTURE, 2, point('New'))!
    const keys = Object.keys(result.inline ?? {}).sort()
    expect(keys).toEqual(
      [
        '0:text', '0:kicker', '0',
        '1:label', '1:text', '1',
        '3:label', '3',
        '4:items:0', '4:items:2', '4',
        '5:text', '5',
        '6:heading', '6:items:1', '6',
      ].sort(),
    )
    // The element that was block 3 (the list) is now 4, with its own style and runs.
    expect(result.inline?.['4']).toEqual({ style: { fontScale: 1.2 } })
    expect(result.inline?.['2']).toBeUndefined()
    expect(Object.keys(result.adjusts ?? {}).sort()).toEqual(['0', '1', '3', '4', '5', '6'])
    expect(result.adjusts?.['4']).toEqual(nudge(0.13))
    expect(result.adjusts?.['3']).toEqual(nudge(0.12))
    expect(result.adjusts?.['2']).toBeUndefined()
  })

  it('at 0 shifts everything', () => {
    const result = withBlockInserted(FIXTURE, 0, point('New'))!
    expect(result.adjusts?.['0']).toBeUndefined()
    expect(result.adjusts?.['1']).toEqual(nudge(0.1))
    expect(result.adjusts?.['6']).toEqual(nudge(0.15))
    expect(result.inline?.['1:text']).toEqual(bold)
    expect(result.inline?.['0:text']).toBeUndefined()
    expect(result.inline?.['1:kicker']).toEqual(bold)
    expect(result.inline?.['0:kicker']).toBeUndefined()
  })

  it('at the end shifts nothing', () => {
    const result = withBlockInserted(FIXTURE, FIXTURE.blocks.length, point('New'))!
    expect(result.inline).toEqual(FIXTURE.inline)
    expect(result.adjusts).toEqual(FIXTURE.adjusts)
    expect(result.blocks.at(-1)).toEqual(point('New'))
  })

  it('keeps keys that are not addresses', () => {
    const card: Editable = { blocks: [heading, paragraph('a')], inline: { 'notAnAddress': bold, '1:text': bold } }
    const result = withBlockInserted(card, 1, paragraph('n'))!
    expect(result.inline?.notAnAddress).toEqual(bold)
    expect(result.inline?.['2:text']).toEqual(bold)
  })

  it('stores undefined, not empty records, for a card with nothing keyed', () => {
    const result = withBlockInserted({ blocks: [heading] }, 0, paragraph('n'))!
    expect(result.inline).toBeUndefined()
    expect(result.adjusts).toBeUndefined()
  })

  it('never mutates its input', () => {
    const before = structuredClone(FIXTURE)
    withBlockInserted(FIXTURE, 1, point('New'))
    expect(FIXTURE).toEqual(before)
  })

  it('refuses out of range and a full card', () => {
    expect(withBlockInserted(FIXTURE, -1, point('N'))).toBeNull()
    expect(withBlockInserted(FIXTURE, FIXTURE.blocks.length + 1, point('N'))).toBeNull()
    const full: Editable = { blocks: Array.from({ length: MAX_BLOCKS }, () => paragraph('x')) }
    expect(withBlockInserted(full, 3, point('N'))).toBeNull()
    expect(withBlockInserted({ blocks: full.blocks.slice(1) }, 3, point('N'))).not.toBeNull()
  })

  /*
    Review focus 2: add a row in the middle of a card whose later blocks are nudged and bolded,
    then undo. Undo restores a snapshot, but an insert that cannot be inverted by the removal
    that shares its key rules means the two would drift apart.
  */
  it.each(Array.from({ length: FIXTURE.blocks.length + 1 }, (_, i) => i))(
    'removing what was inserted at %i gives back the original card',
    (at) => {
      const inserted = withBlockInserted(FIXTURE, at, point('New'))!
      const restored = withBlockRemoved(inserted, at)!
      expect(restored.blocks).toEqual(FIXTURE.blocks)
      expect(restored.inline).toEqual(FIXTURE.inline)
      expect(restored.adjusts).toEqual(FIXTURE.adjusts)
    },
  )

  it('the inserted block’s own formatting is empty, so nothing lands on it', () => {
    const inserted = withBlockInserted(FIXTURE, 2, point('New'))!
    expect(inserted.inline?.['2']).toBeUndefined()
    expect(inserted.inline?.['2:label']).toBeUndefined()
    expect(inserted.adjusts?.['2']).toBeUndefined()
  })
})

describe('pointRun', () => {
  it('is the consecutive run of points around an index', () => {
    const blocks = [heading, point('A'), point('B'), point('C'), paragraph('p'), point('D')]
    expect(pointRun(blocks, 1)).toEqual({ start: 1, end: 3 })
    expect(pointRun(blocks, 2)).toEqual({ start: 1, end: 3 })
    expect(pointRun(blocks, 3)).toEqual({ start: 1, end: 3 })
    expect(pointRun(blocks, 5)).toEqual({ start: 5, end: 5 })
  })

  it('is null for anything that is not a point', () => {
    const blocks = [heading, point('A'), paragraph('p')]
    expect(pointRun(blocks, 0)).toBeNull()
    expect(pointRun(blocks, 2)).toBeNull()
    expect(pointRun(blocks, 9)).toBeNull()
  })

  it('a block between two points splits them', () => {
    const blocks = [point('A'), heading, point('B')]
    expect(pointRun(blocks, 0)).toEqual({ start: 0, end: 0 })
    expect(pointRun(blocks, 2)).toEqual({ start: 2, end: 2 })
  })
})

describe('rowPlusCarrier', () => {
  const blocks = [heading, point('A'), point('B'), point('C'), paragraph('p'), point('D')]

  it('is the last row of the run holding the selected point, whichever row is selected', () => {
    expect(rowPlusCarrier(blocks, 1)).toBe(3)
    expect(rowPlusCarrier(blocks, 2)).toBe(3)
    expect(rowPlusCarrier(blocks, 3)).toBe(3)
  })

  it('is the point itself when it is a run of one', () => {
    expect(rowPlusCarrier(blocks, 5)).toBe(5)
  })

  it('is null for a block that is not a point, or an index out of range', () => {
    expect(rowPlusCarrier(blocks, 0)).toBeNull()
    expect(rowPlusCarrier(blocks, 4)).toBeNull()
    expect(rowPlusCarrier(blocks, 99)).toBeNull()
  })

  it('is null when the card is full, since a row could not be added', () => {
    const full = [point('A'), ...Array.from({ length: MAX_BLOCKS - 1 }, () => paragraph('x'))]
    expect(full).toHaveLength(MAX_BLOCKS)
    expect(rowPlusCarrier(full, 0)).toBeNull()
    expect(rowPlusCarrier(full.slice(1), 0)).toBeNull()
    expect(rowPlusCarrier([point('A'), ...full.slice(2)], 0)).toBe(0)
  })
})
