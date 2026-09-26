import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { NarrationTab } from './NarrationTab'

/**
 * A render smoke test, and a deliberate exception to "pure logic only" like the
 * other editor panels: the failures worth catching are in what the tab draws for
 * which state (no slide, an empty deck, an edited script, no Cartesia key), which no
 * pure function can see. The gesture side (tab switching mid-generation, the modals
 * opening inside the panel) needs a browser and is not covered here.
 */

beforeEach(() => {
  vi.stubEnv('VITE_CARTESIA_API_KEY', 'sk_car_test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function card(id: string, orderIndex: number, narration?: { text: string; generated: string }): Card {
  return {
    id,
    orderIndex,
    blocks: [{ type: 'heading', text: `Slide ${orderIndex + 1}` }],
    layout: 'auto',
    visualStyle: 'structured',
    narration,
  }
}

const DECK = [
  card('a', 0, { text: 'Hello there', generated: 'Hello there' }),
  card('b', 1, { text: 'I rewrote this myself', generated: 'The AI version' }),
  card('c', 2),
]

/** The opening tag of the element with this `aria-label`. Throws if there is none, so a
    `.not.toContain` on it cannot pass because the element was missing. */
function tagLabelled(html: string, label: string): string {
  const tag = html.match(new RegExp(`<[^>]*aria-label="${label}"[^>]*>`))?.[0]
  if (!tag) throw new Error(`no element labelled "${label}" in the markup`)
  return tag
}

const AI = 'Generate scripts with AI'
const CLONE = 'Clone voice'

describe('NarrationTab', () => {
  it('says so when the deck has no slides, and offers no generation', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={[]} cardId={null} />)
    expect(html).toContain('This deck has no slides yet.')
    expect(tagLabelled(html, AI)).toContain('disabled=""')
  })

  it('asks for a slide when none is selected, and still offers the AI icon for the deck', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId={null} />)
    expect(html).toContain('Select a slide to write its script.')
    expect(tagLabelled(html, AI)).not.toContain('disabled=""')
  })

  // The selected slide can vanish while the tab is showing it (a delete, or an undo).
  it('treats a slide id that matches nothing as no selection, not a crash', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="gone" />)
    expect(html).toContain('Select a slide to write its script.')
  })

  it('shows the selected slide by its position, with its script and length', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).toContain('Slide 1 script')
    expect(html).toContain('Hello there')
    expect(html).toContain('2 words')
  })

  it('marks a generated script as generated, with nothing to reset', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).toContain('>Generated<')
    expect(html).not.toContain('Reset to generated')
  })

  it('marks a hand-edited script, and offers to put the generated one back', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="b" />)
    expect(html).toContain('Slide 2 script')
    expect(html).toContain('>Edited by you<')
    expect(html).toContain('Reset to generated')
  })

  it('says a slide with no script has none', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="c" />)
    expect(html).toContain('>No script yet<')
    expect(html).toContain('0 words')
  })

  it('names the textarea for the slide it belongs to', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="b" />)
    expect(html).toContain('aria-label="Script for slide 2"')
  })

  // The two big buttons became one small icon, and the generation strip only exists while
  // something is happening.
  it('no longer has the two Generate buttons', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).not.toContain('Generate script for this slide only')
    expect(html).not.toContain('Generate scripts for all slides')
  })

  it('shows no generation strip while idle', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).not.toContain('Writing narration')
  })

  it('offers the AI icon and Clone voice in the footer with or without a slide selected', () => {
    for (const cardId of ['a', null]) {
      const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId={cardId} />)
      expect(tagLabelled(html, AI)).toContain('type="button"')
      expect(tagLabelled(html, CLONE)).toContain('type="button"')
    }
  })

  it('enables Clone voice when a Cartesia key is set', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(tagLabelled(html, CLONE)).not.toContain('disabled=""')
  })

  it('disables Clone voice, saying why, when no Cartesia key is set', () => {
    vi.stubEnv('VITE_CARTESIA_API_KEY', '')
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    const tag = tagLabelled(html, CLONE)
    expect(tag).toContain('disabled=""')
    expect(tag).toContain('VITE_CARTESIA_API_KEY')
  })
})
