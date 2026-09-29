import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { TopBar } from './TopBar'

/**
 * A render smoke test, like `EditorToolbar.test.tsx`: what the bar offers for
 * which state. Clicks and focus are not exercised (no jsdom).
 */

// The app theme store reads `window.matchMedia` at import, which a server render has no window for.
vi.mock('@/components/ui/ThemeToggle', () => ({ ThemeToggle: () => null }))

const noop = () => {}

function render(extra: Partial<ComponentProps<typeof TopBar>> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TopBar
        title="Deck"
        onTitleChange={noop}
        saveStatus="idle"
        tab="design"
        onTabChange={noop}
        canUndo
        canRedo
        onUndo={noop}
        onRedo={noop}
        zoom={0.9}
        onZoomChange={noop}
        onFit={noop}
        onExport={noop}
        exporting={false}
        canExport
        presentHref="/deck/x/present"
        onQuiz={noop}
        quizDisabledReason={null}
        {...extra}
      />
    </MemoryRouter>,
  )
}

/** The opening tag matching `pattern`, so its attributes can be checked whatever their order. */
function tag(html: string, pattern: string): string {
  return html.match(new RegExp(`<[^>]*${pattern}[^>]*>`))?.[0] ?? ''
}

/** The markup of the button whose text includes `label`. */
function buttonWith(html: string, label: string): string {
  return html.split('<button').find((chunk) => chunk.split('</button>')[0].includes(label)) ?? ''
}

describe('TopBar', () => {
  it('orders home, logo, the two modes and history, then the title, then zoom', () => {
    const html = render()
    const at = (needle: string) => html.indexOf(needle)
    expect(at('Back to home')).toBeLessThan(at('Logo</div>'))
    expect(at('Logo</div>')).toBeLessThan(at('Edit</button>'))
    expect(at('Edit</button>')).toBeLessThan(at('Narrate</button>'))
    expect(at('Narrate</button>')).toBeLessThan(at('aria-label="Undo"'))
    expect(html).not.toContain('Share')
    expect(at('aria-label="Undo"')).toBeLessThan(at('aria-label="Redo"'))
    expect(at('aria-label="Redo"')).toBeLessThan(at('Presentation title'))
    expect(at('Presentation title')).toBeLessThan(at('Zoom out'))
  })

  // Edit and Narrate are the tools panel's tabs: its tabpanels are labelled by these ids.
  it('makes Edit and Narrate the panel tabs, with the selected one marked', () => {
    expect(tag(render(), 'id="tools-tab-design"')).toContain('aria-selected="true"')
    expect(tag(render(), 'id="tools-tab-narration"')).toContain('aria-selected="false"')
    expect(tag(render({ tab: 'narration' }), 'id="tools-tab-narration"')).toContain('aria-selected="true"')
  })

  it('disables undo and redo when there is nothing to undo or redo', () => {
    expect(tag(render({ canUndo: false }), 'aria-label="Undo"')).toContain('disabled=""')
    expect(tag(render({ canRedo: false }), 'aria-label="Redo"')).toContain('disabled=""')
    expect(tag(render(), 'aria-label="Undo"')).not.toContain('disabled=""')
  })

  it('offers zoom with a typed value and Fit, then Export, Present and Generate quiz', () => {
    const html = render()
    const at = (needle: string) => html.indexOf(needle)
    expect(html).toContain('aria-label="Zoom (50–200%)"')
    expect(at('Zoom out')).toBeLessThan(at('Zoom (50'))
    expect(at('Zoom (50')).toBeLessThan(at('Zoom in'))
    expect(at('Zoom in')).toBeLessThan(at('Fit</button>'))
    expect(at('Fit</button>')).toBeLessThan(at('aria-label="Export as PowerPoint"'))
    expect(at('aria-label="Export as PowerPoint"')).toBeLessThan(at('Present</a>'))
    expect(at('Present</a>')).toBeLessThan(at('Generate quiz'))
    expect(html).not.toContain('Generate video')
    expect(html).toContain('href="/deck/x/present"')
  })

  it('disables export with nothing to export, and while the file is being built', () => {
    expect(tag(render(), 'aria-label="Export as PowerPoint"')).not.toContain('disabled=""')
    expect(tag(render({ canExport: false }), 'aria-label="Export as PowerPoint"')).toContain('disabled=""')
    expect(tag(render({ exporting: true }), 'aria-label="Export as PowerPoint"')).toContain('disabled=""')
  })

  it('disables Generate quiz with its reason as the tooltip', () => {
    expect(buttonWith(render(), 'Generate quiz')).not.toContain('disabled=""')
    const quiz = buttonWith(render({ quizDisabledReason: 'Needs a Groq key' }), 'Generate quiz')
    expect(quiz).toContain('disabled=""')
    expect(quiz).toContain('title="Needs a Groq key"')
  })

  it('disables the zoom steppers at the ends of the range', () => {
    expect(tag(render({ zoom: 0.5 }), 'aria-label="Zoom out"')).toContain('disabled=""')
    expect(tag(render({ zoom: 2 }), 'aria-label="Zoom in"')).toContain('disabled=""')
  })
})
