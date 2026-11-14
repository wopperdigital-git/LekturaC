import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { accentOwner, fillNode, groundOf, groundOfLayout, itemStep, slotsOf } from './composition'
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
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 2 }, { isFirstCard: true })).toBe('deep')
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 2 }, { isFirstCard: false })).toBe('plain')
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 0 }, { isFirstCard: false })).toBe('plain')
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 0 }, { isFirstCard: true })).toBe('deep')
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 0 })).toBe('deep')
    expect(groundOf({ layout: 'auto', blocks, orderIndex: 2 })).toBe('plain')
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
