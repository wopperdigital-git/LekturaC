import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Job } from '@/jobs/jobsStore'
import { JobTrayView, viewHref, type JobActions } from './JobTray'

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
