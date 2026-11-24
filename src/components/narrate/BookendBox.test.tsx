import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { bookendMeta } from '@/avatar/costLine'
import { BookendBox } from './BookendBox'

/** A render smoke test, plus the line under each box (length and price, or No clip). */

describe('bookendMeta', () => {
  it('says No clip for an empty or blank box', () => {
    expect(bookendMeta('')).toBe('No clip')
    expect(bookendMeta('   ')).toBe('No clip')
  })

  // The starter intro for "Volcanoes" is about four seconds, billed at the 3 s minimum or more.
  it('gives the length and price of a box with words', () => {
    expect(bookendMeta("Hi! Today we're looking at Volcanoes. Let's get started.")).toBe('~4s · about $0.12')
  })
})

describe('BookendBox', () => {
  it('labels its textarea and shows its meta line', () => {
    const html = renderToStaticMarkup(<BookendBox id="b-intro" label="Intro" value="Hello" disabled={false} onChange={() => {}} />)
    expect(html).toMatch(/<label[^>]*for="b-intro"[^>]*>Intro<\/label>/)
    expect(html).toMatch(/<textarea[^>]*id="b-intro"[^>]*rows="3"/)
    expect(html).toContain('>Hello</textarea>')
    expect(html).toContain('about $0.09')
  })

  it('is read-only while disabled', () => {
    const html = renderToStaticMarkup(<BookendBox id="b" label="Outro" value="" disabled onChange={() => {}} />)
    expect(html).toMatch(/<textarea[^>]*disabled=""/)
    expect(html).toContain('No clip')
  })
})
