import { describe, expect, it } from 'vitest'
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { TopBar } from './TopBar'

/**
 * A render smoke test, like `EditorToolbar.test.tsx`: what the bar offers for
 * which state. Clicks and focus are not exercised (no jsdom).
 */

const noop = () => {}

function render(extra: Partial<ComponentProps<typeof TopBar>> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TopBar
        title="Deck"
        onTitleChange={noop}
        saveStatus="idle"
        zoom={0.9}
        onZoomChange={noop}
        onExport={noop}
        exporting={false}
        canExport
        presentHref="/deck/x/present"
        onQuiz={noop}
        quizDisabledReason={null}
        onExportScript={noop}
        scriptDisabledReason={null}
        accountName="Ada Lovelace"
        accountType="Teacher"
        onProfileSettings={noop}
        {...extra}
      />
    </MemoryRouter>,
  )
}

/** The opening tag matching `pattern`, so its attributes can be checked whatever their order. */
function tag(html: string, pattern: string): string {
  return html.match(new RegExp(`<[^>]*${pattern}[^>]*>`))?.[0] ?? ''
}

describe('TopBar', () => {
  it('orders home and the title on the left, then zoom on the right', () => {
    const html = render()
    const at = (needle: string) => html.indexOf(needle)
    expect(at('Back to home')).toBeLessThan(at('Presentation title'))
    expect(at('Presentation title')).toBeLessThan(at('Zoom out'))
    expect(html).not.toContain('Logo')
    expect(html).not.toContain('Share')
  })

  // History leads the floating toolbar; two places for it would be two ways to do one thing.
  it('no longer carries undo and redo — the floating toolbar does', () => {
    expect(render()).not.toContain('aria-label="Undo"')
    expect(render()).not.toContain('aria-label="Redo"')
  })

  // The modes sit above the tools panel they switch; two places would be two ways to do one thing.
  it('no longer carries the Edit / Narrate modes — they are above the tools panel', () => {
    expect(render()).not.toContain('role="tab"')
  })

  // A title is never clipped: it is a textarea over a span that sizes and wraps to the words.
  it('draws the title as a wrapping field holding the whole title', () => {
    const html = render({ title: 'A very long deck title that will need a second line' })
    expect(tag(html, 'aria-label="Presentation title"')).toMatch(/^<textarea/)
    expect(html).toContain('A very long deck title that will need a second line </span>')
  })

  it('offers zoom with a typed value, then Export, Present and the account', () => {
    const html = render()
    const at = (needle: string) => html.indexOf(needle)
    expect(html).toContain('aria-label="Zoom (50–200%)"')
    expect(at('Zoom out')).toBeLessThan(at('Zoom (50'))
    expect(at('Zoom (50')).toBeLessThan(at('Zoom in'))
    expect(at('Zoom in')).toBeLessThan(at('aria-label="Export"'))
    expect(html).not.toContain('Fit</button>')
    expect(at('aria-label="Export"')).toBeLessThan(at('aria-label="Present"'))
    expect(at('aria-label="Present"')).toBeLessThan(at('aria-label="Account"'))
    expect(html).toContain('href="/deck/x/present"')
  })

  // Present is an icon; the quiz lives in the Export menu; light/dark lives in the settings.
  it('has no Present word, no standalone quiz button and no light/dark toggle', () => {
    const html = render()
    expect(html).not.toContain('Present</a>')
    expect(html).not.toContain('Generate quiz')
    expect(html).not.toContain('Generate Quiz')
    expect(html).not.toContain('theme')
  })

  it('disables the zoom steppers at the ends of the range', () => {
    expect(tag(render({ zoom: 0.5 }), 'aria-label="Zoom out"')).toContain('disabled=""')
    expect(tag(render({ zoom: 2 }), 'aria-label="Zoom in"')).toContain('disabled=""')
  })

  it('renders the quiz strip between the save status and the zoom', () => {
    const html = render({ quizStrip: <span data-testid="strip">strip</span> })
    expect(html.indexOf('data-testid="strip"')).toBeGreaterThan(-1)
    expect(html.indexOf('data-testid="strip"')).toBeLessThan(html.indexOf('aria-label="Zoom out"'))
  })

  it('rings the Export trigger when a quiz is new', () => {
    expect(render({ exportHighlight: true })).toContain('ring-amber-400')
    expect(render()).not.toContain('ring-amber-400')
  })
})
