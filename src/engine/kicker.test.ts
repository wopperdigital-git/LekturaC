import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { KICKER_PLACEHOLDER, canAddKicker, withKicker, withKickerAt } from './kicker'
import { isPlaceholderText } from './newContent'

const heading: ContentBlock = { type: 'heading', text: 'Loops', size: 'h2' }

describe('withKicker', () => {
  it('sets the kicker and keeps the rest of the heading', () => {
    expect(withKicker(heading, 'Part one')).toEqual({ type: 'heading', text: 'Loops', size: 'h2', kicker: 'Part one' })
  })

  it('does not mutate its input', () => {
    withKicker(heading, 'Part one')
    expect('kicker' in heading).toBe(false)
  })

  it.each([[''], ['  '], ['\n\t ']])('removes the field for %j rather than storing it', (text) => {
    const withOne: ContentBlock = { ...heading, kicker: 'Part one' }
    const result = withKicker(withOne, text)
    expect('kicker' in result).toBe(false)
    expect(result).toEqual(heading)
  })

  it('removes the field for null', () => {
    const result = withKicker({ ...heading, kicker: 'Part one' }, null)
    expect('kicker' in result).toBe(false)
  })

  it('leaves a block that is not a heading as it is', () => {
    const paragraph: ContentBlock = { type: 'paragraph', text: 'Hello' }
    expect(withKicker(paragraph, 'Nope')).toBe(paragraph)
  })
})

describe('withKickerAt', () => {
  const blocks: ContentBlock[] = [heading, { type: 'paragraph', text: 'Hello' }]

  it('changes only the addressed heading and keeps every block at its index', () => {
    const next = withKickerAt(blocks, 0, 'Part one')
    expect(next).not.toBeNull()
    expect(next).toHaveLength(2)
    expect(next![0]).toEqual({ ...heading, kicker: 'Part one' })
    expect(next![1]).toBe(blocks[1])
  })

  it('is null for an index that is not a heading', () => {
    expect(withKickerAt(blocks, 1, 'Nope')).toBeNull()
    expect(withKickerAt(blocks, 5, 'Nope')).toBeNull()
  })
})

describe('the placeholder', () => {
  it('is selected on arrival like every other starter text', () => {
    expect(isPlaceholderText(KICKER_PLACEHOLDER)).toBe(true)
    expect(KICKER_PLACEHOLDER).toBe('Small heading')
  })
})

describe('canAddKicker', () => {
  it('is on offer for a heading without one only', () => {
    expect(canAddKicker(heading)).toBe(true)
    expect(canAddKicker({ ...heading, kicker: 'Part one' })).toBe(false)
    expect(canAddKicker({ type: 'paragraph', text: 'x' })).toBe(false)
    expect(canAddKicker({ type: 'quote', text: 'x' })).toBe(false)
    expect(canAddKicker(undefined)).toBe(false)
  })
})
