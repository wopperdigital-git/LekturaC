import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Job } from '@/jobs/jobsStore'
import { QuizJobStripView } from './QuizJobStrip'

const noop = () => {}
const job: Job = {
  id: '1', kind: 'quiz', deckId: 'd1', title: 'Deck', status: 'running', progress: 0.5, timeline: [],
  cancellable: true, error: null, resultDeckId: null, editHref: null,
}
const render = (j: Job) => renderToStaticMarkup(<QuizJobStripView job={j} onCancel={noop} onRetry={noop} onDismiss={noop} onView={noop} />)

describe('QuizJobStripView', () => {
  it('shows progress while generating', () => {
    const html = render(job)
    expect(html).toContain('Generating quiz')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-label="Cancel quiz"')
  })
  it('says the quiz is ready with a View button, set to fade', () => {
    const html = render({ ...job, status: 'done', resultDeckId: 'd1' })
    expect(html).toContain('Quiz generated')
    expect(html).toContain('>View<')
    expect(html).toContain('job-fade-out')
  })
  it('offers Try again on failure', () => {
    const html = render({ ...job, status: 'failed', error: 'busy' })
    expect(html).toContain('Quiz failed')
    expect(html).toContain('Try again')
  })
})
