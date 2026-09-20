import { describe, expect, it } from 'vitest'
import type { Card, ContentBlock } from './contentBlocks'
import { withBlockRemoved, withItemRemoved } from './removeElement'

const heading: ContentBlock = { type: 'heading', text: 'Title' }
const paragraph = (text: string): ContentBlock => ({ type: 'paragraph', text })
const bullets = (items: string[]): ContentBlock => ({ type: 'bulletList', items })
const group = (items: string[]): ContentBlock => ({ type: 'comparisonGroup', heading: 'Side', items })

const bold = { marks: [{ type: 'bold' as const, start: 0, end: 3 }] }
const nudge = { dx: 0.1, dy: 0, rotation: 0 }

type Removable = Pick<Card, 'blocks' | 'inline' | 'adjusts'>

describe('withBlockRemoved', () => {
  it('drops the block and keeps the rest in order', () => {
    const result = withBlockRemoved({ blocks: [heading, paragraph('a'), paragraph('b')] }, 1)
    expect(result?.blocks).toEqual([heading, paragraph('b')])
    expect(result?.blockRemoved).toBe(true)
  })

  /*
    The reason this module exists. Every later block moves up one place, so
    anything keyed by its old index has to follow it — otherwise the formatting
    of the block that moved lands on whatever now sits at that address.
  */
  it('renumbers the formatting and nudges of every later block, and drops the removed one’s own', () => {
    const card: Removable = {
      blocks: [heading, paragraph('a'), paragraph('b'), paragraph('c')],
      inline: {
        '1:text': bold, // the removed block's run
        '1': { style: { align: 'center' } }, // the removed block's own typography
        '2:text': bold,
        '3': { style: { align: 'right' } },
      },
      adjusts: { '1': nudge, '3': nudge },
    }
    const result = withBlockRemoved(card, 1)!
    expect(Object.keys(result.inline ?? {}).sort()).toEqual(['1:text', '2'])
    expect(result.inline?.['2']).toEqual({ style: { align: 'right' } })
    expect(Object.keys(result.adjusts ?? {})).toEqual(['2'])
  })

  it('leaves everything before the removed block exactly where it was', () => {
    const card: Removable = {
      blocks: [heading, paragraph('a'), paragraph('b')],
      inline: { '0:text': bold, '1:text': bold },
      adjusts: { '0': nudge },
    }
    const result = withBlockRemoved(card, 2)!
    expect(Object.keys(result.inline ?? {}).sort()).toEqual(['0:text', '1:text'])
    expect(Object.keys(result.adjusts ?? {})).toEqual(['0'])
  })

  it('renumbers item-level runs along with their block', () => {
    const card: Removable = {
      blocks: [heading, paragraph('a'), bullets(['x', 'y'])],
      inline: { '2:items:1': bold },
    }
    expect(Object.keys(withBlockRemoved(card, 1)!.inline ?? {})).toEqual(['1:items:1'])
  })

  it('leaves neither record behind when nothing is left to key', () => {
    const result = withBlockRemoved({ blocks: [heading, paragraph('a')], inline: { '1:text': bold }, adjusts: { '1': nudge } }, 1)!
    expect(result.inline).toBeUndefined()
    expect(result.adjusts).toBeUndefined()
  })

  it('keeps a key that is not an address rather than silently dropping data', () => {
    const card: Removable = { blocks: [heading, paragraph('a')], inline: { 'not-a-ref': bold } }
    expect(withBlockRemoved(card, 1)!.inline).toEqual({ 'not-a-ref': bold })
  })

  it('removes the last block too, leaving a blank card rather than refusing or taking the card with it', () => {
    const result = withBlockRemoved({ blocks: [heading], inline: { '0:text': bold }, adjusts: { '0': nudge } }, 0)!
    expect(result.blocks).toEqual([])
    expect(result.blockRemoved).toBe(true)
    // Nothing is left for the formatting or the nudge to address.
    expect(result.inline).toBeUndefined()
    expect(result.adjusts).toBeUndefined()
  })

  it('has nothing to remove from a blank card', () => {
    expect(withBlockRemoved({ blocks: [] }, 0)).toBeNull()
  })

  it('refuses an index that is not a block', () => {
    expect(withBlockRemoved({ blocks: [heading, paragraph('a')] }, 9)).toBeNull()
    expect(withBlockRemoved({ blocks: [heading, paragraph('a')] }, -1)).toBeNull()
  })

  it('does not mutate what it was given', () => {
    const inline = { '2:text': bold }
    const adjusts = { '2': nudge }
    const blocks = [heading, paragraph('a'), paragraph('b')]
    withBlockRemoved({ blocks, inline, adjusts }, 1)
    expect(blocks).toHaveLength(3)
    expect(Object.keys(inline)).toEqual(['2:text'])
    expect(Object.keys(adjusts)).toEqual(['2'])
  })
})

describe('withItemRemoved', () => {
  it('removes just that item and reports that no block went', () => {
    const result = withItemRemoved({ blocks: [heading, bullets(['a', 'b', 'c'])] }, 1, 1)!
    expect(result.blocks[1]).toEqual(bullets(['a', 'c']))
    expect(result.blockRemoved).toBe(false)
  })

  it('renumbers the runs of the items after it, and only those', () => {
    const card: Removable = {
      blocks: [heading, bullets(['a', 'b', 'c', 'd'])],
      inline: {
        '1:items:0': bold, // before the removed item: unchanged
        '1:items:1': bold, // the removed item's own formatting: gone
        '1:items:2': bold, // moves to 1
        '1:items:3': bold, // moves to 2
      },
    }
    const result = withItemRemoved(card, 1, 1)!
    expect(Object.keys(result.inline ?? {}).sort()).toEqual(['1:items:0', '1:items:1', '1:items:2'])
  })

  it('leaves every other block’s addresses alone', () => {
    const card: Removable = {
      blocks: [heading, paragraph('p'), bullets(['a', 'b']), bullets(['x', 'y'])],
      inline: { '1:text': bold, '3:items:0': bold, '3:items:1': bold, '2': { style: { align: 'center' } } },
      adjusts: { '2': nudge, '3': nudge },
    }
    const result = withItemRemoved(card, 2, 0)!
    expect(Object.keys(result.inline ?? {}).sort()).toEqual(['1:text', '2', '3:items:0', '3:items:1'])
    expect(result.adjusts).toEqual(card.adjusts)
  })

  it('works on a comparison group, and keeps its heading when the last item goes', () => {
    const result = withItemRemoved({ blocks: [heading, group(['only'])] }, 1, 0)!
    expect(result.blocks[1]).toEqual({ type: 'comparisonGroup', heading: 'Side', items: [] })
    expect(result.blockRemoved).toBe(false)
  })

  it('removes a bullet list as a block once its last item goes, renumbering what followed it', () => {
    const card: Removable = {
      blocks: [heading, bullets(['only']), paragraph('after')],
      inline: { '2:text': bold },
      adjusts: { '2': nudge },
    }
    const result = withItemRemoved(card, 1, 0)!
    expect(result.blockRemoved).toBe(true)
    expect(result.blocks).toEqual([heading, paragraph('after')])
    expect(Object.keys(result.inline ?? {})).toEqual(['1:text'])
    expect(Object.keys(result.adjusts ?? {})).toEqual(['1'])
  })

  it('empties a list that is the only thing on the card, leaving it blank', () => {
    const result = withItemRemoved({ blocks: [bullets(['only'])] }, 0, 0)!
    expect(result.blocks).toEqual([])
    expect(result.blockRemoved).toBe(true)
  })

  it('refuses something that is not a list, and an item that is not there', () => {
    expect(withItemRemoved({ blocks: [heading, paragraph('a')] }, 1, 0)).toBeNull()
    expect(withItemRemoved({ blocks: [heading, bullets(['a'])] }, 1, 4)).toBeNull()
    expect(withItemRemoved({ blocks: [heading, bullets(['a', 'b'])] }, 1, -1)).toBeNull()
  })

  it('does not mutate what it was given', () => {
    const list = bullets(['a', 'b'])
    const inline = { '1:items:1': bold }
    withItemRemoved({ blocks: [heading, list], inline }, 1, 0)
    expect(list).toEqual(bullets(['a', 'b']))
    expect(Object.keys(inline)).toEqual(['1:items:1'])
  })
})
