import { describe, expect, it } from 'vitest'
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountMenu, ExportMenu } from './TopBarMenus'

/**
 * Render smoke tests, like `TopBar.test.tsx`: what each menu offers for which
 * state. Nothing can click a trigger here (no jsdom), so the open state is
 * rendered through `defaultOpen`.
 */

const noop = () => {}

function exportMenu(extra: Partial<ComponentProps<typeof ExportMenu>> = {}) {
  return renderToStaticMarkup(
    <ExportMenu
      onExportPptx={noop}
      exporting={false}
      canExport
      onExportScript={noop}
      scriptDisabledReason={null}
      onQuiz={noop}
      quizDisabledReason={null}
      defaultOpen
      {...extra}
    />,
  )
}

/** The markup of the button whose text includes `label`. */
function buttonWith(html: string, label: string): string {
  return html.split('<button').find((chunk) => chunk.split('</button>')[0].includes(label)) ?? ''
}

describe('ExportMenu', () => {
  it('keeps its items out of the bar until it is opened', () => {
    const html = exportMenu({ defaultOpen: false })
    expect(html).toContain('aria-label="Export"')
    expect(html).not.toContain('role="menuitem"')
  })

  it('offers Export PPT, Export Script and Generate Quiz, in that order', () => {
    const html = exportMenu()
    const at = (needle: string) => html.indexOf(needle)
    expect(at('Export PPT')).toBeGreaterThan(-1)
    expect(at('Export PPT')).toBeLessThan(at('Export Script'))
    expect(at('Export Script')).toBeLessThan(at('Generate Quiz'))
    for (const label of ['Export PPT', 'Export Script', 'Generate Quiz']) {
      expect(buttonWith(html, label)).not.toContain('disabled=""')
    }
  })

  it('disables Export PPT with nothing to export, and while the file is being built', () => {
    expect(buttonWith(exportMenu({ canExport: false }), 'Export PPT')).toContain('disabled=""')
    expect(buttonWith(exportMenu({ exporting: true }), 'Export PPT')).toContain('disabled=""')
  })

  it('disables Export Script and Generate Quiz with the reason as the tooltip', () => {
    const script = buttonWith(exportMenu({ scriptDisabledReason: 'No narration scripts yet' }), 'Export Script')
    expect(script).toContain('disabled=""')
    expect(script).toContain('title="No narration scripts yet"')
    const quiz = buttonWith(exportMenu({ quizDisabledReason: 'Needs a Groq key' }), 'Generate Quiz')
    expect(quiz).toContain('disabled=""')
    expect(quiz).toContain('title="Needs a Groq key"')
  })
})

describe('AccountMenu', () => {
  it('shows the name with the account type under it, then Profile settings', () => {
    const html = renderToStaticMarkup(
      <AccountMenu name="Ada Lovelace" accountType="Teacher" onProfileSettings={noop} defaultOpen />,
    )
    const at = (needle: string) => html.indexOf(needle)
    expect(at('Ada Lovelace</p>')).toBeGreaterThan(-1)
    expect(at('Ada Lovelace</p>')).toBeLessThan(at('Teacher</p>'))
    expect(at('Teacher</p>')).toBeLessThan(at('Profile settings'))
  })

  it('is only the avatar and arrow until it is opened', () => {
    const html = renderToStaticMarkup(<AccountMenu name="Ada Lovelace" accountType="Teacher" onProfileSettings={noop} />)
    expect(html).toContain('aria-label="Account"')
    expect(html).not.toContain('Profile settings')
  })
})
