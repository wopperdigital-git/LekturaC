import { describe, expect, it } from 'vitest'
import type { BulletListBlock, ContentBlock, LayoutType } from './contentBlocks'
import { chooseLayout, MAX_CHIP_ITEMS, SHORT_ITEM_MAX_CHARS } from './layoutEngine'
import { flattenNodes, inferGroups, listArrangement, MIN_RUN, nodeKey, type RenderNode } from './groups'

const heading: ContentBlock = { type: 'heading', text: 'h' }
const para: ContentBlock = { type: 'paragraph', text: 'p' }
const quote: ContentBlock = { type: 'quote', text: 'q' }
const stat: ContentBlock = { type: 'stat', value: '1', label: 'l' }
const step: ContentBlock = { type: 'timelineStep', label: 'l', text: 't' }
const side: ContentBlock = { type: 'comparisonGroup', heading: 'c', items: ['i'] }
const image: ContentBlock = { type: 'image', url: 'https://example.test/i.png' }
const shortList: BulletListBlock = { type: 'bulletList', items: ['a', 'b'] }

/** The hints that change behaviour; every other layout behaves as `'auto'`. */
const HINTS: LayoutType[] = ['auto', 'iconGrid', 'numberedList']

/** Every sequence of up to `maxLength` blocks drawn from `alphabet`. */
function allSequences(alphabet: ContentBlock[], maxLength: number): ContentBlock[][] {
  const out: ContentBlock[][] = [[]]
  let frontier: ContentBlock[][] = [[]]
  for (let length = 1; length <= maxLength; length++) {
    frontier = frontier.flatMap((seq) => alphabet.map((block) => [...seq, block]))
    out.push(...frontier)
  }
  return out
}

/** A compact picture of the nodes: a leaf's block type, or a group's arrangement and size. */
function shape(nodes: RenderNode[]): string[] {
  return nodes.map((node) => (node.kind === 'leaf' ? node.block.type : `${node.arrangement}×${node.items.length}`))
}

function list(items: string[]): BulletListBlock {
  return { type: 'bulletList', items }
}

function repeat(value: string, count: number): string[] {
  return Array.from({ length: count }, () => value)
}

describe('the invariant', () => {
  const sequences = allSequences([heading, para, quote, stat, step, side, image, shortList], 4)

  it('never reorders, drops or duplicates a block, and keeps every index', () => {
    // Exhaustive over every card of up to four blocks drawn from every type —
    // 4,681 cards per hint. This is the property the whole design rests on: a
    // block's index is its address everywhere else in the app (textRef,
    // card.adjusts, data-block-index, selectedBlockIndex), so grouping must
    // change how a card looks and nothing else.
    for (const hint of HINTS) {
      for (const blocks of sequences) {
        expect(flattenNodes(inferGroups(blocks, hint))).toEqual(blocks.map((block, index) => ({ block, index })))
      }
    }
  })

  it('gives every node a key no other node on the card shares', () => {
    for (const blocks of sequences) {
      const keys = inferGroups(blocks).map(nodeKey)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('runs', () => {
  it('groups two or more consecutive stats as boxes', () => {
    expect(shape(inferGroups([heading, stat, stat, stat]))).toEqual(['heading', 'boxes×3'])
  })

  it('leaves a lone stat as a leaf', () => {
    expect(shape(inferGroups([heading, stat, para]))).toEqual(['heading', 'stat', 'paragraph'])
  })

  it('never pulls non-adjacent blocks together', () => {
    // The old family layouts gathered every stat into one grid and pushed the
    // paragraph to the end. Keeping the author's order is what lets every
    // index stay put.
    expect(shape(inferGroups([heading, stat, para, stat, stat]))).toEqual([
      'heading',
      'stat',
      'paragraph',
      'boxes×2',
    ])
  })

  it('arranges each run type as its own family', () => {
    expect(shape(inferGroups([step, step]))).toEqual(['timeline×2'])
    expect(shape(inferGroups([side, side, side]))).toEqual(['columns×3'])
    expect(shape(inferGroups([image, image]))).toEqual(['gallery×2'])
  })

  it('keeps a run shorter than MIN_RUN as leaves, for every run type', () => {
    expect(MIN_RUN).toBe(2)
    for (const block of [stat, step, side, image]) {
      expect(shape(inferGroups([block]))).toEqual([block.type])
    }
  })

  it('splits a run where the type changes', () => {
    expect(shape(inferGroups([stat, stat, step, step]))).toEqual(['boxes×2', 'timeline×2'])
  })

  it('never groups headings, paragraphs or quotes', () => {
    expect(shape(inferGroups([heading, heading, para, para, quote, quote]))).toEqual([
      'heading',
      'heading',
      'paragraph',
      'paragraph',
      'quote',
      'quote',
    ])
  })

  it('gives each bullet list its own group, even when two lists sit together', () => {
    // A list's arrangement applies to the items INSIDE that list, so two lists
    // are two groups, never one group of two lists.
    expect(shape(inferGroups([shortList, shortList]))).toEqual(['chips×1', 'chips×1'])
  })

  it('returns nothing for an empty card', () => {
    expect(inferGroups([])).toEqual([])
  })
})

describe('listArrangement', () => {
  const exactlyMaxChars = 'x'.repeat(SHORT_ITEM_MAX_CHARS)

  it('arranges a short list as chips', () => {
    expect(listArrangement(list(['a', 'b']), 'auto')).toBe('chips')
  })

  it('still calls it chips at the boundary', () => {
    expect(listArrangement(list(repeat(exactlyMaxChars, MAX_CHIP_ITEMS)), 'auto')).toBe('chips')
  })

  it('numbers a list with one item too many', () => {
    expect(listArrangement(list(repeat('a', MAX_CHIP_ITEMS + 1)), 'auto')).toBe('numbered')
  })

  it('numbers a list with one item one character too long', () => {
    expect(listArrangement(list(['a', `${exactlyMaxChars}x`]), 'auto')).toBe('numbered')
  })

  it('follows an explicit picker choice over the content', () => {
    // What keeps the Level 2 picker working: "Numbered list" on three short
    // items must give numbers, and "Icon grid" on a long list must give chips.
    expect(listArrangement(list(repeat('a', MAX_CHIP_ITEMS + 1)), 'iconGrid')).toBe('chips')
    expect(listArrangement(list(['a']), 'numberedList')).toBe('numbered')
  })

  it('ignores a hint that says nothing about lists', () => {
    expect(listArrangement(list(['a']), 'statGrid')).toBe('chips')
  })

  it('agrees with the classifier about which lists are chips', () => {
    // The two used to share a magic number by coincidence; now they share the
    // constants. For a card that is just a heading and a list, the classifier
    // awards iconGrid exactly when inferGroups arranges the list as chips.
    const cases = [
      ['a', 'b'],
      repeat(exactlyMaxChars, MAX_CHIP_ITEMS),
      repeat('a', MAX_CHIP_ITEMS + 1),
      ['a', `${exactlyMaxChars}x`],
    ]
    for (const items of cases) {
      const l = list(items)
      expect(chooseLayout([heading, l]) === 'iconGrid').toBe(listArrangement(l, 'auto') === 'chips')
    }
  })
})

describe('nodeKey', () => {
  it("is the node's first block index", () => {
    expect(inferGroups([heading, stat, stat, para]).map(nodeKey)).toEqual([0, 1, 3])
  })
})
