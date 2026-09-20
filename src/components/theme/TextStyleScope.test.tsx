import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TextStyleScope } from './TextStyleScope'

/*
  A card's colour and underline reach its text through data attributes and one
  custom property, matched by rules in `index.css`. The CSS itself cannot be
  exercised here; what can is that the scope emits exactly those hooks — and only
  when they were asked for, since an always-present attribute would match the
  bare selector even when set to "false".
*/
describe('TextStyleScope', () => {
  it('emits the colour hook and its value when a colour is set', () => {
    const html = renderToStaticMarkup(<TextStyleScope style={{ color: '#ef4444' }}>x</TextStyleScope>)
    expect(html).toContain('data-deck-color="true"')
    expect(html).toContain('--slide-user-color:#ef4444')
  })

  it('emits the underline hook when underline is set', () => {
    const html = renderToStaticMarkup(<TextStyleScope style={{ underline: true }}>x</TextStyleScope>)
    expect(html).toContain('data-deck-underline="true"')
  })

  it('emits neither when neither is set', () => {
    const html = renderToStaticMarkup(<TextStyleScope style={{ bold: true }}>x</TextStyleScope>)
    expect(html).not.toContain('data-deck-color')
    expect(html).not.toContain('data-deck-underline')
    expect(html).not.toContain('--slide-user-color')
  })
})
