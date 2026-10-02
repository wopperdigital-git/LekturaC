import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Job } from '@/jobs/jobsStore'
import { JobTrayView, trayRoute, viewHref, type JobActions } from './JobTray'

const noop = () => {}
const actions: JobActions = { cancel: noop, retry: noop, dismiss: noop, view: noop, editBrief: noop }

const base: Job = {
  id: '1', kind: 'deck', deckId: null, title: 'Volcanoes', status: 'running', progress: 0.25,
  timeline: [
    { id: 'research', label: 'Researching sources', state: 'done' },
    { id: 'write', label: 'Writing slides', state: 'active' },
    { id: 'save', label: 'Saving', state: 'pending' },
  ],
  cancellable: true, error: null, resultDeckId: null, editHref: '/new?draft=x',
}

const render = (jobs: Job[], minimized = false, expanded = false) =>
  renderToStaticMarkup(<JobTrayView jobs={jobs} minimized={minimized} expanded={expanded} onToggle={noop} actions={actions} />)

describe('JobTrayView', () => {
  it('renders nothing without jobs', () => {
    expect(render([])).toBe('')
  })
  it('shows the title, the timeline and a cancel button while running', () => {
    const html = render([base])
    expect(html).toContain('Volcanoes')
    expect(html).toContain('Writing slides')
    expect(html).toContain('aria-label="Cancel Volcanoes"')
    expect(html).toContain('role="progressbar"')
  })
  it('disables cancel when the job cannot be cancelled', () => {
    expect(render([{ ...base, cancellable: false }])).toMatch(/<button[^>]*disabled[^>]*aria-label="Cancel Volcanoes"|<button[^>]*aria-label="Cancel Volcanoes"[^>]*disabled/)
  })
  it('a done job becomes its View button', () => {
    expect(render([{ ...base, status: 'done', resultDeckId: 'd1' }])).toContain('View Slide')
    expect(render([{ ...base, kind: 'quiz', status: 'done', resultDeckId: 'd1' }])).toContain('View Quiz')
    expect(render([{ ...base, kind: 'video', status: 'done', resultDeckId: 'd1' }])).toContain('View Video')
  })
  it('a failed deck job offers Edit brief and Try again with the reason', () => {
    const html = render([{ ...base, status: 'failed', error: 'Groq is busy' }])
    expect(html).toContain('Groq is busy')
    expect(html).toContain('Edit brief')
    expect(html).toContain('Try again')
  })
  it('a failed quiz job offers only Try again', () => {
    const html = render([{ ...base, kind: 'quiz', status: 'failed', error: 'x', editHref: null }])
    expect(html).not.toContain('Edit brief')
    expect(html).toContain('Try again')
  })
  it('minimized shows pills, not timelines', () => {
    const html = render([base], true)
    expect(html).toContain('25%')
    expect(html).not.toContain('Researching sources')
  })
  it('minimized, a done job still shows its View button, not a percentage', () => {
    const html = render([{ ...base, kind: 'video', status: 'done', progress: 1, resultDeckId: 'd1' }], true)
    expect(html).toContain('View Video')
    expect(html).not.toContain('100%')
  })
  it('minimized, a failed job still shows its reason and Try again', () => {
    const html = render([{ ...base, status: 'failed', error: 'Groq is busy' }], true)
    expect(html).toContain('Groq is busy')
    expect(html).toContain('Try again')
  })
  it('the tray container lets clicks through to the page', () => {
    expect(render([base], true)).toContain('pointer-events-none')
  })
  it('the video row says to keep the tab open while drawing', () => {
    const html = render([{ ...base, kind: 'video', timeline: [{ id: 'rendering', label: 'Drawing slides', state: 'active' }] }])
    expect(html).toContain('Keep this tab open')
  })
})

describe('viewHref', () => {
  it('opens the right thing', () => {
    expect(viewHref({ ...base, status: 'done', resultDeckId: 'd1' })).toBe('/deck/d1')
    expect(viewHref({ ...base, kind: 'quiz', status: 'done', resultDeckId: 'd1' })).toBe('/deck/d1?quiz=list')
    expect(viewHref({ ...base, kind: 'video', status: 'done', resultDeckId: 'd1' })).toBe('/deck/d1?video=1')
  })
})

describe('trayRoute', () => {
  it('pills on the editor, hidden on deck sub-routes, full elsewhere', () => {
    expect(trayRoute('/deck/d1')).toEqual({ editorDeckId: 'd1', hidden: false })
    expect(trayRoute('/deck/d1/present')).toEqual({ editorDeckId: null, hidden: true })
    expect(trayRoute('/')).toEqual({ editorDeckId: null, hidden: false })
  })
})
