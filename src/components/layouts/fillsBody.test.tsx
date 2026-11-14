import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { withStyle } from '@/engine/fixtures/cppDeck'
import { GALLERY_DECK } from '@/engine/fixtures/galleryDeck'
import { LayoutRenderer } from './LayoutRenderer'

const html = (card: Card) => renderToStaticMarkup(<LayoutRenderer card={card} context={{ isFirstCard: false }} />)
const count = (out: string) => out.split('data-fill=""').length - 1

const FILLS = ['g-icons3', 'g-stats3', 'g-timeline', 'g-compare', 'g-list-photo']
const NOT = ['g-standard', 'g-hero-extra', 'g-text']

describe.each(['structured', 'expressive'] as const)('a lone group fills the body (%s)', (style) => {
  const cards = withStyle(GALLERY_DECK, style)
  const find = (id: string) => cards.find((c) => c.id === id) as Card

  it.each(FILLS)('%s has exactly one data-fill, flex-1 on the same element', (id) => {
    const out = html(find(id))
    expect(count(out)).toBe(1)
    const tag = out.match(/<[a-z]+[^>]*data-fill=""[^>]*>/)?.[0] ?? ''
    expect(tag).toMatch(/\bflex-1\b/)
  })

  it.each(NOT)('%s has no data-fill', (id) => {
    expect(count(html(find(id)))).toBe(0)
  })

  it('a list beside a paragraph does not fill', () => {
    const card: Card = {
      id: 'mixed',
      orderIndex: 1,
      layout: 'iconGrid',
      visualStyle: style,
      blocks: [
        { type: 'heading', text: 'Head' },
        { type: 'bulletList', items: ['one', 'two', 'three'] },
        { type: 'paragraph', text: 'After the list.' },
      ],
    }
    expect(count(html(card))).toBe(0)
  })
})
