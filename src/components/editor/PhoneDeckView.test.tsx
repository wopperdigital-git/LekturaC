import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { DEFAULT_THEME } from '@/lib/theme-tokens'
import { EMPTY_TEXT_STYLE } from '@/engine/textStyle'
import type { Card } from '@/engine/contentBlocks'
import { PhoneDeckView } from './PhoneDeckView'

/**
 * A render smoke test, like the other editor parts: what a phone is shown instead of the
 * editor. The slides themselves are the presenter's own rendering, covered elsewhere.
 */

const card = (id: string, orderIndex: number, heading: string, script?: string): Card =>
  ({
    id,
    orderIndex,
    blocks: [{ type: 'heading', text: heading }],
    layout: 'auto',
    visualStyle: 'structured',
    ...(script !== undefined ? { narration: { text: script, generated: script } } : {}),
  }) as Card

const render = (cards: Card[]) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <PhoneDeckView
        title="Volcanoes"
        cards={cards}
        theme={DEFAULT_THEME}
        textStyle={EMPTY_TEXT_STYLE}
        presentHref="/deck/d1/present"
        exportMenu={<button type="button">Create &amp; export</button>}
      />
    </MemoryRouter>,
  )

describe('PhoneDeckView', () => {
  it('says editing needs a wider screen, and what can be done here', () => {
    expect(render([card('a', 0, 'Intro')])).toContain('Editing slides needs a wider screen, like a tablet or laptop.')
  })

  it('offers Present, Create & export and the way back', () => {
    const html = render([card('a', 0, 'Intro')])
    expect(html).toContain('href="/deck/d1/present"')
    expect(html).toContain('Create &amp; export')
    expect(html).toContain('aria-label="Back to home"')
  })

  // Read only: the title is text, not the editor's title field.
  it('shows the title without an editable field', () => {
    const html = render([card('a', 0, 'Intro')])
    expect(html).toContain('Volcanoes')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('<input')
  })

  it('shows every slide in order, numbered, with its script or a note that it has none', () => {
    const html = render([card('b', 1, 'Second', ''), card('a', 0, 'First', 'Welcome, everyone.')])
    const at = (needle: string) => html.indexOf(needle)
    expect(at('Slide 1')).toBeGreaterThan(-1)
    expect(at('Slide 1')).toBeLessThan(at('First'))
    expect(at('First')).toBeLessThan(at('Welcome, everyone.'))
    expect(at('Welcome, everyone.')).toBeLessThan(at('Slide 2'))
    expect(at('Slide 2')).toBeLessThan(at('Second'))
    expect(html).toContain('No script')
  })

  it('says so when the deck has no slides', () => {
    expect(render([])).toContain('No slides yet.')
  })
})
