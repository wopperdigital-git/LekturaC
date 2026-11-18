import { describe, expect, it } from 'vitest'
import { cardSchema, contentBlockSchema, type ContentBlock } from './contentBlocks'

/*
  The three structured blocks and the heading kicker round-trip through the
  content schema: a stored row that fails to parse takes its whole card with it.
*/

const NEW_BLOCKS: ContentBlock[] = [
  { type: 'point', label: 'Pointer', text: 'A variable that holds an address' },
  { type: 'callout', text: 'Always initialise a pointer.' },
  { type: 'callout', label: 'Key idea', text: 'Always initialise a pointer.' },
  { type: 'code', code: 'int *p = &x;\n*p = 3;' },
  { type: 'code', code: 'int x = 0;', label: 'main.cpp', caption: 'x is zero' },
  { type: 'heading', text: 'Pointers', kicker: 'Chapter 3' },
]

describe('structured blocks', () => {
  it.each(NEW_BLOCKS.map((b) => [b.type, b] as const))('%s round-trips unchanged', (_type, block) => {
    const parsed = contentBlockSchema.parse(JSON.parse(JSON.stringify(block)))
    expect(parsed).toEqual(block)
  })

  it('a card holds all of them', () => {
    const card = {
      id: 'c1',
      orderIndex: 1,
      blocks: NEW_BLOCKS,
      layout: 'auto',
      visualStyle: 'structured',
    }
    expect(cardSchema.parse(card).blocks).toEqual(NEW_BLOCKS)
  })

  it('a point needs both its label and its text', () => {
    expect(contentBlockSchema.safeParse({ type: 'point', label: '', text: 'x' }).success).toBe(false)
    expect(contentBlockSchema.safeParse({ type: 'point', label: 'x', text: '' }).success).toBe(false)
  })

  it('a callout needs text and a code block needs code', () => {
    expect(contentBlockSchema.safeParse({ type: 'callout', text: '' }).success).toBe(false)
    expect(contentBlockSchema.safeParse({ type: 'code', code: '' }).success).toBe(false)
  })
})
