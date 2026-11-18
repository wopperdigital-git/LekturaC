import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CPP_DECK, withStyle } from '@/engine/fixtures/cppDeck'
import { LayoutRenderer } from './LayoutRenderer'

describe('importance by contrast, never a fill behind a heading', () => {
  it.each(['structured', 'expressive'] as const)('never fills behind a heading (%s)', (style) => {
    for (const [i, card] of withStyle(CPP_DECK, style).entries()) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card} context={{ isFirstCard: i === 0 }} />)
      for (const tag of html.match(/<h[12][^>]*>/g) ?? []) {
        expect(tag, `card ${i}`).not.toMatch(/bg-slide-accent/)
      }
    }
  })

  it.each(['structured', 'expressive'] as const)('never fills behind a kicker either (%s)', (style) => {
    for (const [i, base] of withStyle(CPP_DECK, style).entries()) {
      const card = {
        ...base,
        blocks: base.blocks.map((b, at) =>
          b.type === 'heading' && at === base.blocks.findIndex((x) => x.type === 'heading')
            ? { ...b, kicker: 'Small heading' }
            : b,
        ),
      }
      const html = renderToStaticMarkup(<LayoutRenderer card={card} context={{ isFirstCard: i === 0 }} />)
      for (const tag of html.match(/<[a-z0-9]+[^>]*data-kicker=""[^>]*>/g) ?? []) {
        expect(tag, `card ${i}`).not.toMatch(/bg-slide-accent/)
      }
      for (const tag of html.match(/<h[12][^>]*>/g) ?? []) {
        expect(tag, `card ${i}`).not.toMatch(/bg-slide-accent/)
      }
    }
  })
})
