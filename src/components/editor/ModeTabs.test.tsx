import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PanelTab } from './ToolsPanel'
import { ModeTabs } from './ModeTabs'

/** A render smoke test, like `TopBar.test.tsx`: what is offered for which state. */

function render(tab: PanelTab = 'design') {
  return renderToStaticMarkup(<ModeTabs tab={tab} onTabChange={() => {}} />)
}

/** The opening tag matching `pattern`, so its attributes can be checked whatever their order. */
function tag(html: string, pattern: string): string {
  return html.match(new RegExp(`<[^>]*${pattern}[^>]*>`))?.[0] ?? ''
}

describe('ModeTabs', () => {
  it('offers Edit, then Narrate', () => {
    const html = render()
    expect(html.indexOf('Edit</button>')).toBeGreaterThan(-1)
    expect(html.indexOf('Edit</button>')).toBeLessThan(html.indexOf('Narrate</button>'))
  })

  // Edit and Narrate are the tools panel's tabs: its tabpanels are labelled by these ids.
  it('makes Edit and Narrate the panel tabs, with the selected one marked', () => {
    expect(tag(render(), 'id="tools-tab-design"')).toContain('aria-selected="true"')
    expect(tag(render(), 'id="tools-tab-design"')).toContain('aria-controls="tools-panel-design"')
    expect(tag(render(), 'id="tools-tab-narration"')).toContain('aria-selected="false"')
    expect(tag(render('narration'), 'id="tools-tab-narration"')).toContain('aria-selected="true"')
  })
})
