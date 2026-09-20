import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { MAX_LIST_ITEMS, NEW_ITEM_TEXT, listTarget, withItemAdded } from './listItems'

const heading: ContentBlock = { type: 'heading', text: 'Title' }
const paragraph: ContentBlock = { type: 'paragraph', text: 'Prose.' }
const bullets = (items: string[]): ContentBlock => ({ type: 'bulletList', items })
const group = (items: string[]): ContentBlock => ({ type: 'comparisonGroup', heading: 'Side', items })

describe('withItemAdded', () => {
  it('appends one placeholder item and reports where it landed', () => {
    const result = withItemAdded([heading, bullets(['a', 'b'])], 1)
    expect(result?.itemIndex).toBe(2)
    expect(result?.blocks[1]).toEqual({ type: 'bulletList', items: ['a', 'b', NEW_ITEM_TEXT] })
  })

  it('grows a comparison group the same way and keeps its heading', () => {
    const result = withItemAdded([heading, group(['x'])], 1)
    expect(result?.blocks[1]).toEqual({ type: 'comparisonGroup', heading: 'Side', items: ['x', NEW_ITEM_TEXT] })
  })

  it('only appends, so every existing item keeps its position and therefore its formatting', () => {
    const before = bullets(['first', 'second', 'third'])
    const after = withItemAdded([heading, before], 1)!.blocks[1]
    if (after.type !== 'bulletList' || before.type !== 'bulletList') throw new Error('expected lists')
    before.items.forEach((item, i) => expect(after.items[i]).toBe(item))
  })

  it('never adds, moves or removes a block, and leaves every other block untouched', () => {
    const blocks = [heading, bullets(['a']), paragraph, bullets(['z'])]
    const result = withItemAdded(blocks, 1)!
    expect(result.blocks).toHaveLength(blocks.length)
    expect(result.blocks[0]).toBe(blocks[0])
    expect(result.blocks[2]).toBe(blocks[2])
    expect(result.blocks[3]).toBe(blocks[3])
  })

  it('does not mutate its input', () => {
    const original = bullets(['a'])
    const blocks = [heading, original]
    withItemAdded(blocks, 1)
    expect(original).toEqual(bullets(['a']))
    expect(blocks).toHaveLength(2)
  })

  it('refuses a block that is not a list, and one out of range', () => {
    expect(withItemAdded([heading, paragraph], 1)).toBeNull()
    expect(withItemAdded([heading, paragraph], 0)).toBeNull()
    expect(withItemAdded([heading], 5)).toBeNull()
  })

  it('stops growing a list at the ceiling', () => {
    const full = bullets(Array.from({ length: MAX_LIST_ITEMS }, (_, i) => `item ${i}`))
    expect(withItemAdded([heading, full], 1)).toBeNull()
    const almost = bullets(Array.from({ length: MAX_LIST_ITEMS - 1 }, (_, i) => `item ${i}`))
    expect(withItemAdded([heading, almost], 1)).not.toBeNull()
  })
})

describe('listTarget', () => {
  it('acts on the selected element when it is a list', () => {
    expect(listTarget([heading, bullets(['a']), bullets(['b'])], 2)).toBe(2)
  })

  it('refuses a selected element that is not a list, rather than growing some other list', () => {
    expect(listTarget([heading, paragraph, bullets(['a'])], 1)).toBeNull()
    expect(listTarget([heading, bullets(['a'])], 0)).toBeNull()
  })

  it('falls back to the card’s only list when nothing is selected', () => {
    expect(listTarget([heading, paragraph, bullets(['a'])], null)).toBe(2)
  })

  it('will not guess between two lists when nothing is selected', () => {
    expect(listTarget([heading, bullets(['a']), bullets(['b'])], null)).toBeNull()
    expect(listTarget([heading, group(['a']), group(['b'])], null)).toBeNull()
  })

  it('has nothing to act on for a card with no list', () => {
    expect(listTarget([heading, paragraph], null)).toBeNull()
  })

  it('reports nothing when the list is already full', () => {
    const full = bullets(Array.from({ length: MAX_LIST_ITEMS }, () => 'x'))
    expect(listTarget([heading, full], 1)).toBeNull()
    expect(listTarget([heading, full], null)).toBeNull()
  })
})
