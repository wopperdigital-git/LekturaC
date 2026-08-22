import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { getTextAtPath, setTextAtPath } from './blockText'

const heading: ContentBlock = { type: 'heading', text: 'Original' }
const bullets: ContentBlock = { type: 'bulletList', items: ['one', 'two', 'three'] }
const stat: ContentBlock = { type: 'stat', value: '42%', label: 'growth' }
const quote: ContentBlock = { type: 'quote', text: 'Said a thing', attribution: 'Someone' }

describe('getTextAtPath', () => {
  it('reads plain fields and list items', () => {
    expect(getTextAtPath(heading, 'text')).toBe('Original')
    expect(getTextAtPath(stat, 'label')).toBe('growth')
    expect(getTextAtPath(bullets, 'items.1')).toBe('two')
  })

  it('returns null for a field the block type does not have', () => {
    expect(getTextAtPath(heading, 'value')).toBeNull()
    expect(getTextAtPath(stat, 'items.0')).toBeNull()
    expect(getTextAtPath(bullets, 'items.9')).toBeNull()
  })

  it('returns null for an optional field that is absent', () => {
    expect(getTextAtPath({ type: 'quote', text: 'x' }, 'attribution')).toBeNull()
  })
})

describe('setTextAtPath', () => {
  it('replaces a plain field without touching the rest of the block', () => {
    expect(setTextAtPath(quote, 'attribution', 'Someone else')).toEqual({
      type: 'quote',
      text: 'Said a thing',
      attribution: 'Someone else',
    })
  })

  it('replaces one list item and leaves the others alone', () => {
    expect(setTextAtPath(bullets, 'items.1', 'second')).toEqual({
      type: 'bulletList',
      items: ['one', 'second', 'three'],
    })
  })

  it('does not mutate the block it was given', () => {
    setTextAtPath(bullets, 'items.0', 'changed')
    expect(bullets.type === 'bulletList' && bullets.items).toEqual(['one', 'two', 'three'])
  })

  it('trims the incoming text', () => {
    expect(setTextAtPath(heading, 'text', '  Spaced  ')).toEqual({ type: 'heading', text: 'Spaced' })
  })

  // Every text field in the zod schema is min(1): writing blank would leave a
  // card that no longer validates, so the caller has to keep the old text.
  it('refuses a blank or whitespace-only value', () => {
    expect(setTextAtPath(heading, 'text', '')).toBeNull()
    expect(setTextAtPath(heading, 'text', '   ')).toBeNull()
    expect(setTextAtPath(bullets, 'items.0', ' ')).toBeNull()
  })

  it('refuses paths that do not address text on this block', () => {
    expect(setTextAtPath(heading, 'items.0', 'x')).toBeNull()
    expect(setTextAtPath(stat, 'text', 'x')).toBeNull()
    expect(setTextAtPath(bullets, 'items.5', 'x')).toBeNull()
    expect(setTextAtPath({ type: 'image', url: 'u' }, 'alt', 'x')).toBeNull()
  })

  it('refuses to invent an optional field that was never set', () => {
    expect(setTextAtPath({ type: 'quote', text: 'x' }, 'attribution', 'New')).toBeNull()
  })
})
