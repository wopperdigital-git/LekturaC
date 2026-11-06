import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PostModeChoice } from './PostModeChoice'

/** A render smoke test (no jsdom): when "Post as lesson" is offered, and what it says when it is not. */

function render(readiness: Parameters<typeof PostModeChoice>[0]['readiness']) {
  return renderToStaticMarkup(<PostModeChoice mode="quiz" onChange={() => {}} readiness={readiness} />)
}

describe('PostModeChoice', () => {
  it('offers both options, quiz first', () => {
    const html = render('ready')
    expect(html.indexOf('Post as quiz')).toBeGreaterThan(-1)
    expect(html.indexOf('Post as lesson')).toBeGreaterThan(html.indexOf('Post as quiz'))
    expect(html).not.toContain('disabled=""')
  })

  it('turns the lesson off with the reason when there is no video', () => {
    const html = render('no_video')
    expect(html).toContain('title="Make the narrated video first."')
    expect(html.match(/disabled=""/g)).toHaveLength(1)
  })

  it('turns the lesson off with the reason when the video has no slide timings', () => {
    expect(render('no_timings')).toContain('title="Make the video again to use it in a lesson."')
  })

  it('turns the lesson off, saying why, when the deck was deleted', () => {
    expect(render('no_deck')).toContain('title="The deck for this quiz was deleted."')
  })

  it('turns the lesson off with no reason while the video is still being looked up', () => {
    const html = render('loading')
    expect(html.match(/disabled=""/g)).toHaveLength(1)
    expect(html).not.toContain('title=')
  })
})
