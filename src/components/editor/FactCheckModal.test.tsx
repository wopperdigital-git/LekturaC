import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FactCheck, FactCheckItem } from '@/generation/factCheck'
import { FactCheckModal } from './FactCheckModal'

/**
 * A render smoke test, like the other editor dialogs: what the fact check shows for which
 * state. Which claims land where is `factCheck.test.ts`; this pins that the dialog shows them.
 */

function item(claimId: string, slideNumber: number, extra: Partial<FactCheckItem> = {}): FactCheckItem {
  return {
    claimId,
    cardId: `card-${slideNumber}`,
    slideNumber,
    statement: `Statement ${claimId}`,
    type: 'statistic',
    verified: false,
    sources: [],
    reviewed: false,
    ...extra,
  }
}

const unsourced = item('c2-1', 2)
const sourced = item('c2-2', 2, { verified: true, sources: [{ title: 'Census 2024', publisher: 'ONS', url: 'https://ons.example' }] })
const checked = item('c4-1', 4, { reviewed: true })

function render(fc: Partial<FactCheck> = {}, saveFailed = false) {
  const full: FactCheck = { research: 'ok', items: [unsourced, sourced, checked], needsCheck: [unsourced], ...fc }
  return renderToStaticMarkup(
    <FactCheckModal fc={full} saveFailed={saveFailed} onClose={() => {}} onGoToSlide={() => {}} onMarkChecked={() => {}} />,
  )
}

/** The markup of the button whose text includes `label`. */
const buttonsWith = (html: string, label: string) =>
  html.split('<button').filter((chunk) => chunk.split('</button>')[0].includes(label))

describe('FactCheckModal', () => {
  it('lists unsourced claims first, then sourced ones, then the ones the teacher checked', () => {
    const html = render()
    const at = (needle: string) => html.indexOf(needle)
    expect(at('No source found')).toBeLessThan(at('Statement c2-1'))
    expect(at('Statement c2-1')).toBeLessThan(at('>Sourced'))
    expect(at('>Sourced')).toBeLessThan(at('Statement c2-2'))
    expect(at('Statement c2-2')).toBeLessThan(at('Checked by you'))
    expect(at('Checked by you')).toBeLessThan(at('Statement c4-1'))
  })

  it("offers I've checked this only on a claim that still needs it", () => {
    expect(buttonsWith(render(), 'checked this')).toHaveLength(1)
  })

  it("links each source a sourced claim cites", () => {
    const html = render()
    expect(html).toContain('href="https://ons.example"')
    expect(html).toContain('ONS')
  })

  it('takes the teacher to the slide from every claim', () => {
    const html = render()
    expect(buttonsWith(html, 'Slide 2')).toHaveLength(2)
    expect(buttonsWith(html, 'Slide 4')).toHaveLength(1)
  })

  it('says when every claim is checked', () => {
    expect(render({ needsCheck: [] })).toContain('All claims checked.')
  })

  it('explains failed and skipped research', () => {
    expect(render({ research: 'failed' })).toContain("Web research didn&#x27;t work")
    expect(render({ research: 'skipped', needsCheck: [] })).toContain('your own material')
  })

  it('says when a check could not be saved', () => {
    expect(render({}, true)).toContain('show again next time')
    expect(render()).not.toContain('show again next time')
  })

  // "Generate once": the teacher fixes a claim by editing the slide, never by asking the model again.
  it('offers no AI action', () => {
    const html = render()
    for (const word of ['Regenerate', 'Rewrite', 'Fix with AI', 'Generate']) expect(html).not.toContain(word)
  })
})
