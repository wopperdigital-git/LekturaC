import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { useBookendsStore } from '@/avatar/bookendsStore'
import { usePresentationStore } from '@/store/presentationStore'
import { NarrationTab } from './NarrationTab'

/**
 * A render smoke test, and a deliberate exception to "pure logic only" like the
 * other editor panels: the failures worth catching are in what the tab draws for
 * which state (no slide, an empty deck, an edited script, no Cartesia key), which no
 * pure function can see. The gesture side (stepping, tab switching mid-generation, the
 * modals opening inside the panel) needs a browser and is not covered here; the stepping
 * rules themselves are `engine/scriptSpots.ts`.
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

const AI = 'Write with AI'
const VOICE = 'Voice &amp; video'

describe('NarrationTab', () => {
  it('says so when the deck has no slides, and offers no generation', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={[]} cardId={null} />)
    expect(html).toContain('This deck has no slides yet.')
    expect(tagLabelled(html, AI)).toContain('disabled=""')
  })

  it('asks for a slide when none is selected, and still offers Write with AI for the deck', () => {
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
    expect(html).toContain('Slide 1 of 3')
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
    expect(html).toContain('Slide 2 of 3')
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

  // The two big buttons became one footer button over a slide picker, and the generation strip
  // only exists while something is happening.
  it('no longer has the two Generate buttons', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).not.toContain('Generate script for this slide only')
    expect(html).not.toContain('Generate scripts for all slides')
  })

  it('shows no generation strip while idle', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).not.toContain('Writing narration')
  })

  it('offers Write with AI and Voice & video in the footer with or without a slide selected', () => {
    for (const cardId of ['a', null]) {
      const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId={cardId} />)
      expect(tagLabelled(html, AI)).toContain('type="button"')
      expect(tagLabelled(html, VOICE)).toContain('type="button"')
    }
  })

  it('enables Voice & video when a Cartesia key is set', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(tagLabelled(html, VOICE)).not.toContain('disabled=""')
  })

  // In words a teacher can act on: the key's variable name is for whoever runs the site.
  it('disables Voice & video, saying why without naming a key variable, when no Cartesia key is set', () => {
    vi.stubEnv('VITE_CARTESIA_API_KEY', '')
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    const tag = tagLabelled(html, VOICE)
    expect(tag).toContain('disabled=""')
    expect(tag).toContain('Cartesia key')
    expect(html).not.toContain('VITE_')
  })
})

describe('NarrationTab navigator', () => {
  const nav = (html: string) => html.match(/<nav aria-label="Narration scripts"[\s\S]*?<\/nav>/)?.[0] ?? ''

  it('walks the narration in video order: Intro, a tick per slide, Outro', () => {
    const html = nav(renderToStaticMarkup(<NarrationTab cards={DECK} cardId="b" onGoToCard={() => {}} />))
    const at = (needle: string) => html.indexOf(needle)
    expect(at('Intro</button>')).toBeGreaterThan(-1)
    expect(at('Intro</button>')).toBeLessThan(at('aria-label="Slide 1, scripted"'))
    expect(at('aria-label="Slide 3, no script"')).toBeLessThan(at('Outro</button>'))
    expect(html).toMatch(/aria-label="Slide 2, scripted"[^>]*aria-current="step"/)
  })

  it('offers Previous and Next from a middle slide', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="b" onGoToCard={() => {}} />)
    expect(tagLabelled(html, 'Previous script')).not.toContain('disabled=""')
    expect(tagLabelled(html, 'Next script')).not.toContain('disabled=""')
  })

  // Without a way to move the editor, the arrows can reach the intro and outro but not another slide.
  it('only steps to another slide when it can move the editor there', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="b" />)
    expect(tagLabelled(html, 'Previous script')).toContain('disabled=""')
    expect(tagLabelled(html, 'Next script')).toContain('disabled=""')
    expect(tagLabelled(html, 'Slide 1, scripted')).toContain('disabled=""')
  })
})

describe('NarrationTab intro and outro', () => {
  const bookendsInitial = { ...useBookendsStore.getInitialState() }
  const deckInitial = { title: usePresentationStore.getInitialState().title }

  function setStores(bookends: { intro: string | null; outro: string | null }, title: string, warning: string | null = null) {
    Object.assign(useBookendsStore.getInitialState(), { bookends, warning })
    Object.assign(usePresentationStore.getInitialState(), { title })
  }

  afterEach(() => {
    Object.assign(useBookendsStore.getInitialState(), bookendsInitial)
    Object.assign(usePresentationStore.getInitialState(), deckInitial)
  })

  it('reaches the intro and outro from the navigator, with or without a slide selected', () => {
    for (const cardId of ['a', null]) {
      const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId={cardId} />)
      expect(html).toContain('Intro</button>')
      expect(html).toContain('Outro</button>')
    }
  })

  // Rendered on the server the tab can only open on a slide; what an intro or outro box says is
  // `bookendMeta`, shared with the video dialog's boxes and tested in BookendBox.test.tsx.
  it('marks a written intro as filled and a cleared outro as empty in the map', () => {
    setStores({ intro: null, outro: '' }, 'Volcanoes')
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId="a" />)
    expect(html).toContain('title="Intro"')
    expect(html).toContain('title="Outro (empty: no clip)"')
  })

  it('shows the store warning as the tab error', () => {
    setStores({ intro: null, outro: null }, 'Volcanoes', 'Your intro and outro could not be saved.')
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId={null} />)
    expect(html).toContain('Your intro and outro could not be saved.')
  })
})
