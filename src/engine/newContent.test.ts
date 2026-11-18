import { describe, expect, it } from 'vitest'
import { contentBlockSchema, type ContentBlock } from './contentBlocks'
import { NEW_ITEM_TEXT } from './listItems'
import {
  CONTENT_OPTIONS,
  CONTENT_TYPES,
  MAX_BLOCKS,
  elementLabel,
  firstEditableField,
  imageBlock,
  withImageReplaced,
  isPlaceholderText,
  newBlock,
  withBlockAppended,
} from './newContent'
import { blockFieldText, parseTextRef } from './blockText'
import { textRef } from './marks'
import type { Photo } from '@/images/types'

const PHOTO: Photo = {
  url: 'https://images.pexels.com/photos/1/photo.jpeg',
  alt: 'A mountain lake',
  credit: { name: 'Ada Lens', url: 'https://www.pexels.com/@ada', source: 'pexels' },
}

const HEADING: ContentBlock = { type: 'heading', text: 'Title' }
const BODY: ContentBlock = { type: 'paragraph', text: 'Body' }

describe('newBlock', () => {
  // A block the schema rejects would be stored, fail to parse on the next read,
  // and take the card with it.
  it.each(CONTENT_TYPES.filter((t) => t !== 'image'))('%s produces a block the content schema accepts', (type) => {
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

  it('an image is built from a photo, never from placeholder text', () => {
    expect(imageBlock(PHOTO)).toEqual({ type: 'image', url: PHOTO.url, alt: PHOTO.alt, credit: PHOTO.credit })
    expect(contentBlockSchema.safeParse(imageBlock(PHOTO)).success).toBe(true)
    // Its credit is its own copy: editing a block must not edit the picker's result.
    expect(imageBlock(PHOTO).credit).not.toBe(PHOTO.credit)
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
  it.each(CONTENT_TYPES.filter((t) => t !== 'image'))('%s points at a real, placeholder-filled run', (type) => {
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

describe('elementLabel', () => {
  it('names every insertable type as the Insert menu does', () => {
    for (const option of CONTENT_OPTIONS) {
      const block = option.type === 'image' ? imageBlock(PHOTO) : newBlock(option.type)
      expect(elementLabel(block)).toBe(option.label)
    }
  })

  it('calls an unsized heading a plain Heading, and names images', () => {
    expect(elementLabel({ type: 'heading', text: 'T' })).toBe('Heading')
    expect(elementLabel({ type: 'image', url: 'x' })).toBe('Image')
  })

  it('names an item of a list or group, not the whole element', () => {
    expect(elementLabel({ type: 'bulletList', items: ['a'] }, 0)).toBe('List item')
    expect(elementLabel({ type: 'comparisonGroup', heading: 'H', items: ['a'] }, 0)).toBe('Group item')
    expect(elementLabel({ type: 'bulletList', items: ['a'] })).toBe('Bullet list')
  })
})

describe('withImageReplaced', () => {
  const OLD: ContentBlock = {
    type: 'image',
    url: 'https://old.example/a.jpg',
    alt: 'Old',
    prompt: 'a lake at dawn',
    credit: { name: 'Old', url: 'https://old.example', source: 'url' },
  }

  it('rewrites url, alt and credit and leaves every other block alone', () => {
    const blocks = [HEADING, OLD, BODY]
    const next = withImageReplaced(blocks, 1, PHOTO)!
    expect(next[1]).toMatchObject({ type: 'image', url: PHOTO.url, alt: PHOTO.alt, credit: PHOTO.credit })
    expect(next[0]).toBe(blocks[0])
    expect(next[2]).toBe(blocks[2])
    expect(blocks[1]).toBe(OLD)
  })

  it('keeps the block prompt', () => {
    expect((withImageReplaced([OLD], 0, PHOTO)![0] as { prompt?: string }).prompt).toBe('a lake at dawn')
  })

  it('is null for a block that is not an image', () => {
    expect(withImageReplaced([HEADING, OLD], 0, PHOTO)).toBeNull()
    expect(withImageReplaced([HEADING, OLD], 5, PHOTO)).toBeNull()
  })
})

describe('structured blocks', () => {
  // The Insert menu does not offer them yet; the panel and the caret still have to name them.
  it('names each by its own words', () => {
    expect(elementLabel({ type: 'point', label: 'A', text: 'B' })).toBe('Term row')
    expect(elementLabel({ type: 'callout', text: 'B' })).toBe('Callout')
    expect(elementLabel({ type: 'code', code: 'x' })).toBe('Code')
  })

  it('opens the caret on the first run of each', () => {
    expect(firstEditableField({ type: 'point', label: 'A', text: 'B' })).toEqual({ field: 'label' })
    expect(firstEditableField({ type: 'callout', text: 'B' })).toEqual({ field: 'text' })
    expect(firstEditableField({ type: 'code', code: 'x' })).toEqual({ field: 'code' })
  })
})
