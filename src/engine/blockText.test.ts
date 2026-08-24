import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { blockFieldText, parseTextRef, setBlockFieldText } from './blockText'
import { textRef } from './marks'

const blocks: ContentBlock[] = [
  { type: 'heading', text: 'Title' },
  { type: 'paragraph', text: 'Prose.' },
  { type: 'bulletList', items: ['one', 'two', 'three'] },
  { type: 'quote', text: 'A saying.', attribution: 'Someone' },
]

const ref = (s: string) => parseTextRef(s)!

describe('parseTextRef', () => {
  it('round-trips what textRef produces', () => {
    expect(parseTextRef(textRef(2, 'items', 1))).toEqual({
      blockIndex: 2,
      field: 'items',
      itemIndex: 1,
    })
    expect(parseTextRef(textRef(0, 'text'))).toEqual({ blockIndex: 0, field: 'text' })
  })

  it('rejects malformed refs rather than guessing', () => {
    expect(parseTextRef('nope')).toBeNull()
    expect(parseTextRef('x:text')).toBeNull()
    expect(parseTextRef('0:')).toBeNull()
    expect(parseTextRef('0:items:-1')).toBeNull()
    expect(parseTextRef('0:a:b:c')).toBeNull()
  })
})

describe('blockFieldText', () => {
  it('reads plain and indexed fields', () => {
    expect(blockFieldText(blocks, ref('0:text'))).toBe('Title')
    expect(blockFieldText(blocks, ref('2:items:1'))).toBe('two')
    expect(blockFieldText(blocks, ref('3:attribution'))).toBe('Someone')
  })

  it('returns null for an address that does not resolve to text', () => {
    expect(blockFieldText(blocks, ref('9:text'))).toBeNull()
    expect(blockFieldText(blocks, ref('0:nosuchfield'))).toBeNull()
    expect(blockFieldText(blocks, ref('2:items:99'))).toBeNull()
    // A whole array is not a text field.
    expect(blockFieldText(blocks, ref('2:items'))).toBeNull()
  })
})

describe('setBlockFieldText', () => {
  it('replaces a plain field', () => {
    const next = setBlockFieldText(blocks, ref('1:text'), 'Edited.')
    expect(blockFieldText(next, ref('1:text'))).toBe('Edited.')
  })

  it('replaces one list item and leaves its siblings alone', () => {
    const next = setBlockFieldText(blocks, ref('2:items:1'), 'TWO')
    expect((next[2] as { items: string[] }).items).toEqual(['one', 'TWO', 'three'])
  })

  it('never mutates the input, since undo snapshots hold the old arrays', () => {
    const next = setBlockFieldText(blocks, ref('2:items:0'), 'changed')
    expect((blocks[2] as { items: string[] }).items).toEqual(['one', 'two', 'three'])
    expect(next).not.toBe(blocks)
    // Untouched blocks keep their identity, so React can skip re-rendering them.
    expect(next[0]).toBe(blocks[0])
  })

  it('keeps the block type and every other field intact', () => {
    const next = setBlockFieldText(blocks, ref('3:text'), 'New saying.')
    expect(next[3]).toEqual({ type: 'quote', text: 'New saying.', attribution: 'Someone' })
  })

  it('is a no-op for an address that does not resolve', () => {
    expect(setBlockFieldText(blocks, ref('9:text'), 'x')).toBe(blocks)
    expect(setBlockFieldText(blocks, ref('0:nosuchfield'), 'x')).toBe(blocks)
  })
})
