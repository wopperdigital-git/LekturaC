import { describe, expect, it } from 'vitest'
import { contentBlockSchema, type ContentBlock } from './contentBlocks'
import { NEW_ITEM_TEXT } from './listItems'
import {
  CONTENT_OPTIONS,
  CONTENT_TYPES,
  MAX_BLOCKS,
  firstEditableField,
  isPlaceholderText,
  newBlock,
  withBlockAppended,
} from './newContent'
import { blockFieldText, parseTextRef } from './blockText'
import { textRef } from './marks'

const HEADING: ContentBlock = { type: 'heading', text: 'Title' }
const BODY: ContentBlock = { type: 'paragraph', text: 'Body' }

describe('newBlock', () => {
  // A block the schema rejects would be stored, fail to parse on the next read,
  // and take the card with it.
  it.each(CONTENT_TYPES)('%s produces a block the content schema accepts', (type) => {
    expect(contentBlockSchema.safeParse(newBlock(type)).success).toBe(true)
  })

  it('maps each heading level to its own size', () => {
    expect(newBlock('h1')).toMatchObject({ type: 'heading', size: 'h1' })
    expect(newBlock('h2')).toMatchObject({ type: 'heading', size: 'h2' })
    expect(newBlock('h3')).toMatchObject({ type: 'heading', size: 'h3' })
  })

  it('never hands out shared structure', () => {
    const first = newBlock('list')
    const second = newBlock('list')
    expect(first).not.toBe(second)
    if (first.type === 'bulletList') first.items[0] = 'Edited'
    expect(second).toMatchObject({ items: [NEW_ITEM_TEXT] })
  })

  it('offers every type in the menu exactly once', () => {
    expect(CONTENT_OPTIONS.map((o) => o.type)).toEqual([...CONTENT_TYPES])
  })
})

describe('withBlockAppended', () => {
  it('only appends: every existing block keeps its index', () => {
    const blocks = [HEADING, BODY]
    const result = withBlockAppended(blocks, 'body')!
    expect(result.blocks.slice(0, 2)).toEqual(blocks)
    expect(result.blocks).toHaveLength(3)
    expect(result.blockIndex).toBe(2)
  })

  it('never mutates its input', () => {
    const blocks = [HEADING, BODY]
    withBlockAppended(blocks, 'stat')
    expect(blocks).toEqual([HEADING, BODY])
  })

  it('works on a blank card, where the new block becomes block 0', () => {
    const result = withBlockAppended([], 'h1')!
    expect(result.blockIndex).toBe(0)
    expect(result.blocks).toHaveLength(1)
  })

  it('refuses once the card is full', () => {
    const full = Array.from({ length: MAX_BLOCKS }, () => BODY)
    expect(withBlockAppended(full, 'body')).toBeNull()
    expect(withBlockAppended(full.slice(1), 'body')).not.toBeNull()
  })
})

describe('firstEditableField', () => {
  // The caret is opened at this address straight after adding, so it has to name
  // a run that actually exists on the new block — otherwise nothing opens.
  it.each(CONTENT_TYPES)('%s points at a real, placeholder-filled run', (type) => {
    const block = newBlock(type)
    const { field, item } = firstEditableField(block)
    const ref = parseTextRef(textRef(0, field, item))!
    const text = blockFieldText([block], ref)
    expect(text).toBeTypeOf('string')
    // Selected whole on arrival, so the first keystroke replaces it.
    expect(isPlaceholderText(text as string)).toBe(true)
  })
})

describe('isPlaceholderText', () => {
  it('recognises the list placeholder the list feature already used', () => {
    expect(isPlaceholderText(NEW_ITEM_TEXT)).toBe(true)
  })

  it('does not treat the user’s own words as a placeholder', () => {
    expect(isPlaceholderText('Quarterly revenue')).toBe(false)
    expect(isPlaceholderText('')).toBe(false)
  })
})
