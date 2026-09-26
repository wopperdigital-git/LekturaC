import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { NarrationTab } from './NarrationTab'

/**
 * A render smoke test, and a deliberate exception to "pure logic only" like the
 * other editor panels: the failures worth catching are in what the tab draws for
 * which state (no slide, an empty deck, an edited script), which no pure function
 * can see. The gesture side (tab switching mid-generation, the modals opening
 * inside the panel) needs a browser and is not covered here.
 */

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

/** The opening `<button …>` whose label starts with `text`, so its attributes can be read. */
function buttonTag(html: string, text: string): string {
  return html.match(new RegExp(`<button[^>]*>\\s*${text}`))?.[0] ?? ''
}

describe('NarrationTab', () => {
  it('says so when the deck has no slides, and offers no generation', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={[]} cardId={null} />)
    expect(html).toContain('This deck has no slides yet.')
    expect(buttonTag(html, 'Generate scripts for all slides')).toContain('disabled=""')
  })

  it('asks for a slide when none is selected, and disables only the single-slide button', () => {
    const html = renderToStaticMarkup(<NarrationTab cards={DECK} cardId={null} />)
    expect(html).toContain('Select a slide to write its script.')
    expect(buttonTag(html, 'Generate script for this slide only')).toContain('disabled=""')
    expect(buttonTag(html, 'Generate scripts for all slides')).not.toContain('disabled=""')
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
    expect(buttonTag(html, 'Generate script for this slide only')).not.toContain('disabled=""')
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
})
