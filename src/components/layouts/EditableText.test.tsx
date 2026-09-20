import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EditableText } from './EditableText'
import { BlockDataContext } from './adjustContext'

/*
  A line break typed in the editor is stored as a newline character in the run's
  text. The editing surface itself is DOM-driven and is not covered here (this
  project runs its tests in `node`, with no jsdom); what can be pinned is the
  half that decides whether the break is *seen* anywhere else — the presenter
  and the thumbnails draw every run through this read-only branch.
*/
describe('EditableText (read-only)', () => {
  it('draws a stored newline as a line break rather than collapsing it to a space', () => {
    const html = renderToStaticMarkup(<EditableText textRef="1:text" value={'first line\nsecond line'} />)
    expect(html).toContain('white-space:pre-wrap')
    expect(html).toContain('first line\nsecond line')
  })

  it('keeps the caller’s own style alongside the wrapping rule', () => {
    const html = renderToStaticMarkup(<EditableText textRef="1:text" value="x" style={{ color: 'red' }} />)
    expect(html).toContain('white-space:pre-wrap')
    expect(html).toContain('color:red')
  })

  it('draws an underlined stretch of a run underlined, and only that stretch', () => {
    const html = renderToStaticMarkup(
      <BlockDataContext.Provider
        value={{ adjusts: undefined, inline: { '1:text': { marks: [{ type: 'underline', start: 6, end: 10 }] } } }}
      >
        <EditableText textRef="1:text" value="plain word plain" />
      </BlockDataContext.Provider>,
    )
    expect(html).toMatch(/text-decoration:underline[^>]*>word</)
    expect(html.split('text-decoration').length - 1).toBe(1)
  })

  it('draws a coloured, re-fonted, enlarged stretch with inline styles that beat the element’s own', () => {
    const marks = [
      { type: 'color' as const, start: 6, end: 10, value: '#ef4444' },
      { type: 'fontFamily' as const, start: 6, end: 10, value: 'Georgia, serif' },
      { type: 'fontScale' as const, start: 6, end: 10, value: 1.5 },
    ]
    const html = renderToStaticMarkup(
      <BlockDataContext.Provider value={{ adjusts: undefined, inline: { '1:text': { marks } } }}>
        <EditableText textRef="1:text" value="plain word plain" />
      </BlockDataContext.Provider>,
    )
    expect(html).toMatch(/color:#ef4444[^>]*>word</)
    expect(html).toContain('font-family:Georgia, serif')
    expect(html).toContain('font-size:1.5em')
  })

  it('leaves an unenlarged run’s size alone', () => {
    const marks = [{ type: 'fontScale' as const, start: 0, end: 5, value: 1 }]
    const html = renderToStaticMarkup(
      <BlockDataContext.Provider value={{ adjusts: undefined, inline: { '1:text': { marks } } }}>
        <EditableText textRef="1:text" value="plain word plain" />
      </BlockDataContext.Provider>,
    )
    expect(html).not.toContain('font-size')
  })

  it('draws an unmarked run with no decoration at all', () => {
    const html = renderToStaticMarkup(<EditableText textRef="1:text" value="plain word plain" />)
    expect(html).not.toContain('text-decoration')
  })
})
