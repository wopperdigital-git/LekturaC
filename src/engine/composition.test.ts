import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import {
  SIDE_HEAD_MAX_CLAIM,
  SIDE_HEAD_MAX_LEAD,
  accentOwner,
  compositionOf,
  fillNode,
  groundOf,
  groundOfLayout,
  itemStep,
  slotsOf,
} from './composition'
import { CPP_DECK } from './fixtures/cppDeck'
import { GALLERY_DECK } from './fixtures/galleryDeck'
import { inferGroups } from './groups'

const h: ContentBlock = { type: 'heading', text: 'H' }
const p: ContentBlock = { type: 'paragraph', text: 'P' }
const img: ContentBlock = { type: 'image', url: 'u' }
const stat: ContentBlock = { type: 'stat', value: '4', label: 'l' }
const list: ContentBlock = { type: 'bulletList', items: ['a'] }
const group: ContentBlock = { type: 'comparisonGroup', heading: 'g', items: ['a'] }
const KINDS: ContentBlock[] = [h, p, img, stat, list, group]

describe('slotsOf', () => {
  it('puts every index in exactly one slot, body ascending (all cards up to 4 blocks)', () => {
    const cards: ContentBlock[][] = [[]]
    for (let n = 1; n <= 4; n++) for (const prev of cards.filter((c) => c.length === n - 1)) for (const k of KINDS) cards.push([...prev, k])
    for (const blocks of cards) {
      const s = slotsOf(blocks)
      const all = [s.claim, s.lead, s.aside, ...s.body].filter((i): i is number => i !== null)
      expect([...all].sort((a, b) => a - b)).toEqual(blocks.map((_, i) => i))
      expect(s.body).toEqual([...s.body].sort((a, b) => a - b))
    }
  })
  it('names the first heading the claim and the paragraph right after it the lead', () => {
    expect(slotsOf([h, p, list])).toEqual({ claim: 0, lead: 1, aside: null, body: [2] })
    expect(slotsOf([h, list, p])).toEqual({ claim: 0, lead: null, aside: null, body: [1, 2] })
    expect(slotsOf([p, h, p])).toEqual({ claim: 1, lead: 2, aside: null, body: [0] })
    expect(slotsOf([p, list])).toEqual({ claim: null, lead: null, aside: null, body: [0, 1] })
  })
  it('sets a lone photo aside and leaves two photos in the body', () => {
    expect(slotsOf([h, img, p]).aside).toBe(1)
    expect(slotsOf([h, img, img])).toEqual({ claim: 0, lead: null, aside: null, body: [1, 2] })
  })
})

describe('accentOwner', () => {
  it('gives the accent to one block at most', () => {
    expect(accentOwner([h, stat, p], 'statHero')).toBe(1)
    expect(accentOwner([h, group, group], 'comparison')).toBe(1)
    expect(accentOwner([h, group, group], 'comparisonTable')).toBe(1)
    expect(accentOwner([h, stat, stat], 'statGrid')).toBeNull()
    expect(accentOwner([h, list], 'iconGrid')).toBeNull()
  })
})

describe('groundOf', () => {
  it('puts the title slide on the deep ground', () => {
    expect(groundOf(CPP_DECK[0])).toBe('deep')
  })
  it('puts a quote and a stat hero on the tinted ground', () => {
    expect(groundOf(CPP_DECK[5])).toBe('tint')
    expect(groundOfLayout('statHero')).toBe('tint')
  })
  it('leaves every other layout plain', () => {
    for (const i of [1, 2, 3, 4, 6]) expect(groundOf(CPP_DECK[i]), String(i)).toBe('plain')
    expect(groundOf({ layout: 'auto', blocks: [], orderIndex: 3 })).toBe('plain')
  })
  it('follows an explicit hero anywhere in the deck', () => {
    expect(groundOf({ ...CPP_DECK[1], layout: 'hero' })).toBe('deep')
  })
  it('uses an explicit context as given, whatever the orderIndex says', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'A title' },
      { type: 'paragraph', text: 'One short line.' },
    ]
    // On auto a heading and one short line is a title only as the opener; elsewhere it is plain.
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 2 }, { isFirstCard: true })).toBe('deep')
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 2 }, { isFirstCard: false })).toBe('plain')
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 0 }, { isFirstCard: false })).toBe('plain')
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 0 }, { isFirstCard: true })).toBe('deep')
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 0 })).toBe('deep')
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 2 })).toBe('plain')
    // Named at ingest, the same card follows its layout wherever it sits.
    expect(groundOf({ layout: 'statement', blocks, orderIndex: 0 }, { isFirstCard: false })).toBe('tint')
    expect(groundOf({ layout: 'section', blocks: [blocks[0]], orderIndex: 2 })).toBe('deep')
  })
  it('keeps an empty card plain, even one named hero', () => {
    expect(groundOf({ layout: 'hero', blocks: [], orderIndex: 0 })).toBe('plain')
    expect(groundOf({ layout: 'hero', blocks: [], orderIndex: 0 }, { isFirstCard: true })).toBe('plain')
  })
})

describe('itemStep', () => {
  it('is roomy for a few short items', () => expect(itemStep(['if', 'switch', 'ternary'])).toBe('roomy'))
  it('is roomy at six items', () => expect(itemStep(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('roomy'))
  it('is normal at seven items', () => expect(itemStep(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe('normal'))
  it('is normal when one text is 65 characters', () => expect(itemStep(['a', 'x'.repeat(65)])).toBe('normal'))
  it('is roomy at exactly 64 characters', () => expect(itemStep(['x'.repeat(64)])).toBe('roomy'))
  it('is roomy for none', () => expect(itemStep([])).toBe('roomy'))
})

describe('fillNode', () => {
  // The inputs FlowLayout hands it: the nodes, the body indices the frame passes on
  // (the frame leaves a lone photo in the body when no aside is drawn) and that photo.
  const fillOf = (blocks: ContentBlock[], hint: Parameters<typeof inferGroups>[1] = 'auto') => {
    const slots = slotsOf(blocks)
    const body = (slots.aside === null ? slots.body : [...slots.body, slots.aside]).sort((a, b) => a - b)
    return fillNode(inferGroups(blocks, hint), body, slots.aside)
  }
  const card = (id: string) => {
    const found = GALLERY_DECK.find((c) => c.id === id)
    if (!found) throw new Error(`no ${id}`)
    return found
  }

  it.each([
    ['g-icons3', 2],
    ['g-stats3', 1],
    ['g-timeline', 2],
    ['g-compare', 1],
    ['g-list-photo', 1],
  ])('names the one group of %s (first index %i)', (id, first) => {
    const c = card(id)
    expect(fillOf(c.blocks, c.layout)).toBe(first)
  })

  it('is null for a list between two paragraphs', () => {
    const c = card('g-standard')
    expect(fillOf(c.blocks, c.layout)).toBeNull()
  })

  it('is null for a card with two groups (a list and stats)', () => {
    const c = card('g-hero-extra')
    expect(fillOf(c.blocks, c.layout)).toBeNull()
  })

  it('is null for a card with no group', () => {
    const c = card('g-text')
    expect(fillOf(c.blocks, c.layout)).toBeNull()
  })

  it('is null when a leaf other than the lone photo sits beside the group', () => {
    expect(fillOf([h, list, p])).toBeNull()
  })
})

describe('compositionOf', () => {
  const heading = (text: string): ContentBlock => ({ type: 'heading', text })
  const para = (text = 'P'): ContentBlock => ({ type: 'paragraph', text })
  const bullets: ContentBlock = { type: 'bulletList', items: ['a', 'b'] }
  const quote: ContentBlock = { type: 'quote', text: 'Q' }
  const long = (n: number) => 'x'.repeat(n)

  it('starts the thresholds at 60 and 140 characters', () => {
    expect(SIDE_HEAD_MAX_CLAIM).toBe(60)
    expect(SIDE_HEAD_MAX_LEAD).toBe(140)
  })

  it('is a stack when the body is one unit', () => {
    expect(compositionOf([heading('Loops'), para(), bullets], [[2]], 'standard')).toBe('stack')
  })

  it('puts a short claim and lead beside two units', () => {
    const blocks = [heading('Loops'), para(), bullets, para()]
    expect(compositionOf(blocks, [[2], [3]], 'numberedList')).toBe('sideHead')
  })

  it('still puts a claim of exactly 60 characters beside the body', () => {
    const blocks = [heading(long(60)), para(), bullets, para()]
    expect(compositionOf(blocks, [[2], [3]], 'standard')).toBe('sideHead')
  })

  it('splits two units under a 61-character claim', () => {
    const blocks = [heading(long(61)), para(), bullets, para()]
    expect(compositionOf(blocks, [[2], [3]], 'standard')).toBe('splitBody')
  })

  it('stacks three units under a 61-character claim', () => {
    const blocks = [heading(long(61)), para(), bullets, para(), quote]
    expect(compositionOf(blocks, [[2], [3], [4]], 'standard')).toBe('stack')
  })

  it('splits two units under a 141-character lead', () => {
    const blocks = [heading('Loops'), para(long(141)), bullets, para()]
    expect(compositionOf(blocks, [[2], [3]], 'standard')).toBe('splitBody')
  })

  it('accepts a lead of exactly 140 characters beside the body', () => {
    const blocks = [heading('Loops'), para(long(140)), bullets, para()]
    expect(compositionOf(blocks, [[2], [3]], 'standard')).toBe('sideHead')
  })

  it('puts a short claim and lead beside three units: side head is not capped at two', () => {
    const blocks = [heading('Loops'), para(), bullets, para(), quote]
    expect(compositionOf(blocks, [[2], [3], [4]], 'standard')).toBe('sideHead')
  })

  it('puts a short claim with no lead beside two units', () => {
    const blocks = [heading('Loops'), bullets, para()]
    expect(compositionOf(blocks, [[1], [2]], 'standard')).toBe('sideHead')
  })

  it('stacks a body of only paragraphs', () => {
    const blocks = [heading('Loops'), para(), para(), para()]
    expect(compositionOf(blocks, [[2], [3]], 'standard')).toBe('stack')
  })

  it('stacks a body holding a heading, so a subheading stays with what it labels', () => {
    const blocks = [heading('Loops'), para(), bullets, heading('Why'), para()]
    expect(compositionOf(blocks, [[2], [3], [4]], 'standard')).toBe('stack')
    // Without the subheading the same card is zoned.
    expect(compositionOf([heading('Loops'), para(), bullets, para()], [[2], [3]], 'standard')).toBe('sideHead')
  })

  it('stacks whenever a photo is anywhere on the card', () => {
    const blocks = [heading('Loops'), para(), bullets, para(), img]
    expect(compositionOf(blocks, [[2], [3]], 'standard')).toBe('stack')
  })

  it('stacks a gallery and a horizontal timeline row', () => {
    const blocks = [heading('Loops'), para(), bullets, para()]
    expect(compositionOf(blocks, [[2], [3]], 'gallery')).toBe('stack')
    expect(compositionOf(blocks, [[2], [3]], 'timelineRow')).toBe('stack')
  })

  it('stacks a card with no heading', () => {
    expect(compositionOf([para(), bullets, para()], [[0], [1], [2]], 'standard')).toBe('stack')
  })

  it('stacks a card with no blocks', () => {
    expect(compositionOf([], [], 'standard')).toBe('stack')
  })
})
