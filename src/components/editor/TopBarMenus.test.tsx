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
      onVideo={noop}
      videoDisabledReason={null}
      defaultOpen
      {...extra}
    />,
  )
}

/** The markup of the button whose text includes `label`. */
function buttonWith(html: string, label: string): string {
  return html.split('<button').find((chunk) => chunk.split('</button>')[0].includes(label)) ?? ''
}

const QUIZ = 'Quiz…'
const VIDEO = 'Narrated video…'
const PPTX = 'PowerPoint (.pptx)'
const SCRIPT = 'Narration script (.txt)'

describe('ExportMenu', () => {
  it('is a labelled button that keeps its items out of the bar until it is opened', () => {
    const html = exportMenu({ defaultOpen: false })
    expect(html).toContain('aria-label="Create &amp; export"')
    expect(html).toContain('>Create &amp; export<')
    expect(html).not.toContain('role="menuitem"')
  })

  // What a teacher makes comes first: a quiz and a video were hard to find under "Export".
  it('offers what can be made from the deck, then what can be downloaded, in that order', () => {
    const html = exportMenu()
    const at = (needle: string) => html.indexOf(needle)
    expect(at('Make from this deck')).toBeGreaterThan(-1)
    expect(at('Make from this deck')).toBeLessThan(at(QUIZ))
    expect(at(QUIZ)).toBeLessThan(at(VIDEO))
    expect(at(VIDEO)).toBeLessThan(at('>Download<'))
    expect(at('>Download<')).toBeLessThan(at(PPTX))
    expect(at(PPTX)).toBeLessThan(at(SCRIPT))
    for (const label of [QUIZ, VIDEO, PPTX, SCRIPT]) {
      expect(buttonWith(html, label)).not.toContain('disabled=""')
    }
  })

  it('disables the PowerPoint item with nothing to export, and while the file is being built', () => {
    expect(buttonWith(exportMenu({ canExport: false }), PPTX)).toContain('disabled=""')
    expect(buttonWith(exportMenu({ exporting: true }), PPTX)).toContain('disabled=""')
  })

  it('disables the script, quiz and video items with the reason as the tooltip', () => {
    const script = buttonWith(exportMenu({ scriptDisabledReason: 'No narration scripts yet' }), SCRIPT)
    expect(script).toContain('disabled=""')
    expect(script).toContain('title="No narration scripts yet"')
    const quiz = buttonWith(exportMenu({ quizDisabledReason: 'Not set up' }), QUIZ)
    expect(quiz).toContain('disabled=""')
    expect(quiz).toContain('title="Not set up"')
    const video = buttonWith(exportMenu({ videoDisabledReason: 'No voices' }), VIDEO)
    expect(video).toContain('disabled=""')
    expect(video).toContain('title="No voices"')
  })
})

describe('ExportMenu highlights', () => {
  it('highlights the Quiz item when a quiz is new', () => {
    const quiz = buttonWith(exportMenu({ highlightQuiz: true }), QUIZ)
    expect(quiz).toContain('bg-amber-400/15')
    expect(quiz).toContain('bg-amber-400')
    expect(buttonWith(exportMenu(), QUIZ)).not.toContain('amber')
  })

  it('rings the trigger with highlight', () => {
    expect(exportMenu({ highlight: true, defaultOpen: false })).toContain('ring-amber-400')
    expect(exportMenu({ defaultOpen: false })).not.toContain('ring-amber-400')
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
