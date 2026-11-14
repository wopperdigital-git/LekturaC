import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { CPP_DECK } from '@/engine/fixtures/cppDeck'
import { LayoutRenderer } from './LayoutRenderer'

/**
 * SlideBody no longer centres anything: a frame that wants to sit in the middle of
 * the slide asks for it with `my-auto` on its own root. This pins that, so a layout
 * edit cannot silently pin a hero, quote or stat hero to the top of the slide.
 */
const PHOTO: ContentBlock = { type: 'image', url: 'https://example.test/GROUND.png', alt: 'ground' }

const card = (layout: Card['layout'], blocks: ContentBlock[], style: VisualStyle): Card => ({
  ...CPP_DECK[0],
  layout,
  visualStyle: style,
  blocks,
})

const html = (c: Card) => renderToStaticMarkup(<LayoutRenderer card={c} />)

/**
 * The class list of the first element in the markup: the layout's own root. React may
 * put a preload `<link>` for a photo in front of it; those are skipped.
 */
const rootClasses = (markup: string): string[] => {
  const match = markup.replace(/^(<link[^>]*>)+/, '').match(/^<[a-z0-9]+[^>]*?\sclass="([^"]*)"/)
  expect(match, markup.slice(0, 120)).not.toBeNull()
  return (match?.[1] ?? '').split(/\s+/)
}

const heading: ContentBlock = { type: 'heading', text: 'A claim' }
const paragraph: ContentBlock = { type: 'paragraph', text: 'A line under it.' }
const quote: ContentBlock = { type: 'quote', text: 'Make it work.', attribution: 'Kent Beck' }
const stat: ContentBlock = { type: 'stat', value: '42', label: 'answers' }

describe.each(['structured', 'expressive'] as const)('frames that centre themselves (%s)', (style) => {
  it('hero without a photo', () => {
    expect(rootClasses(html(card('hero', [heading, paragraph], style)))).toContain('my-auto')
  })

  it('quote without a photo', () => {
    expect(rootClasses(html(card('quote', [heading, quote], style)))).toContain('my-auto')
  })

  it('stat hero without a photo', () => {
    expect(rootClasses(html(card('statHero', [heading, stat], style)))).toContain('my-auto')
  })

  it('stat hero with one photo', () => {
    expect(rootClasses(html(card('statHero', [heading, stat, PHOTO], style)))).toContain('my-auto')
  })
})

it('centres the blank-card placeholder', () => {
  expect(rootClasses(html({ ...CPP_DECK[0], blocks: [] }))).toContain('my-auto')
})

describe.each(['structured', 'expressive'] as const)(
  'a background photo already fills the floor, so the stage is not auto-margined (%s)',
  (style) => {
    /** The class list of the `PhotoStage` element, found by its `data-on-photo` attribute. */
    const stageClasses = (markup: string): string[] => {
      const tag = markup.match(/<div[^>]*data-on-photo[^>]*>/)?.[0]
      expect(tag, markup.slice(0, 200)).toBeDefined()
      return (tag?.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)
    }

    it('hero with exactly one photo', () => {
      const classes = stageClasses(html(card('hero', [heading, paragraph, PHOTO], style)))
      expect(classes).toContain('flex-col')
      expect(classes).not.toContain('my-auto')
    })

    it('quote with exactly one photo', () => {
      const classes = stageClasses(html(card('quote', [heading, quote, PHOTO], style)))
      expect(classes).toContain('flex-col')
      expect(classes).not.toContain('my-auto')
    })
  },
)
