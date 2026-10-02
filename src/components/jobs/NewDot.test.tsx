import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NewDot, newLabel } from './NewDot'

describe('NewDot', () => {
  it('names what is new', () => {
    expect(newLabel(['deck'])).toBe('New deck')
    expect(newLabel(['quiz', 'video'])).toBe('New quiz and video')
    expect(newLabel(['deck', 'quiz', 'video'])).toBe('New deck, quiz and video')
  })
  it('draws nothing when nothing is new', () => {
    expect(renderToStaticMarkup(<NewDot kinds={[]} />)).toBe('')
  })
  it('draws a labelled dot', () => {
    const html = renderToStaticMarkup(<NewDot kinds={['quiz']} />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="New quiz"')
  })
})
