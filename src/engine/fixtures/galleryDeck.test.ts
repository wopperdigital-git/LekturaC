import { describe, expect, it } from 'vitest'
import { cardSchema } from '@/engine/contentBlocks'
import { resolveLayout } from '@/engine/layoutEngine'
import { FIXTURE_PHOTO, GALLERY_DECK } from './galleryDeck'

const EXPECTED: Array<[string, string]> = [
  ['g-hero', 'hero'],
  ['g-icons3', 'iconGrid'],
  ['g-icons6', 'iconGrid'],
  ['g-numbered', 'numberedList'],
  ['g-numbered10', 'numberedList'],
  ['g-checklist', 'checklist'],
  ['g-split', 'splitList'],
  ['g-stats3', 'statGrid'],
  ['g-stats5', 'statGrid'],
  ['g-statlist', 'statList'],
  ['g-stathero', 'statHero'],
  ['g-timeline', 'timeline'],
  ['g-timelinerow', 'timelineRow'],
  ['g-timelinerow6', 'timelineRow'],
  ['g-compare', 'comparison'],
  ['g-compare3', 'comparison'],
  ['g-table', 'comparisonTable'],
  ['g-quote', 'quote'],
  ['g-text', 'textFocus'],
  ['g-standard', 'standard'],
  ['g-split-photo', 'standardSplit'],
  ['g-image', 'imageFocus'],
  ['g-list-photo', 'iconGrid'],
  ['g-hero-extra', 'hero'],
]

describe('GALLERY_DECK', () => {
  it('holds every card of the table, in order, as valid cards', () => {
    expect(GALLERY_DECK.map((c) => c.id)).toEqual(EXPECTED.map(([id]) => id))
    for (const card of GALLERY_DECK) expect(cardSchema.safeParse(card).success).toBe(true)
  })

  it('has unique ids and gapless order indices', () => {
    expect(new Set(GALLERY_DECK.map((c) => c.id)).size).toBe(GALLERY_DECK.length)
    expect(GALLERY_DECK.map((c) => c.orderIndex)).toEqual(GALLERY_DECK.map((_, i) => i))
  })

  it('resolves every card to the arrangement it is there to show', () => {
    GALLERY_DECK.forEach((card, i) => {
      const resolved = resolveLayout(card.layout, card.blocks, { isFirstCard: i === 0 })
      expect([card.id, resolved]).toEqual(EXPECTED[i])
    })
  })

  it('opens every card with a heading and starts structured', () => {
    for (const card of GALLERY_DECK) {
      expect(card.blocks[0]?.type).toBe('heading')
      expect(card.visualStyle).toBe('structured')
    }
  })

  it('carries its photo inline, so no slide needs the network', () => {
    expect(FIXTURE_PHOTO.startsWith('data:image/svg+xml')).toBe(true)
  })
})
