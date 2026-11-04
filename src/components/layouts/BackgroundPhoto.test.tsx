import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BackgroundPhoto } from './BackgroundPhoto'
import { PhotoCredit } from './PhotoCredit'
import { readFileSync } from 'node:fs'

describe('BackgroundPhoto', () => {
  const html = renderToStaticMarkup(
    <BackgroundPhoto
      index={2}
      block={{
        type: 'image',
        url: 'https://example.test/bg.png',
        alt: 'bg',
        credit: { name: 'Ada', url: 'https://www.pexels.com/@ada', source: 'pexels' },
      }}
    />,
  )

  it('lays a dark scrim over the picture so text on it stays readable', () => {
    expect(html).toContain('bg-gradient-to-t from-black/75 via-black/40 to-black/20')
  })

  it('bleeds through the slide padding and covers the slide', () => {
    expect(html).toContain('calc(-1 * var(--slide-pad, 0px))')
    expect(html).toContain('object-cover')
  })

  it('is one adjustable element at its own index, and a fixed one', () => {
    expect(html).toContain('data-block-index="2"')
    expect(html).toContain('data-fixed-element')
  })

  it('carries the photographer credit', () => {
    expect(html).toContain('data-photo-credit')
    expect(html).toContain('Photo: Ada / Pexels')
  })
})

describe('PhotoCredit', () => {
  it('links the photographer, naming Pexels', () => {
    const html = renderToStaticMarkup(
      <PhotoCredit credit={{ name: 'Ada', url: 'https://www.pexels.com/@ada', source: 'pexels' }} />,
    )
    expect(html).toContain('href="https://www.pexels.com/@ada"')
    expect(html).toContain('Photo: Ada / Pexels')
  })

  it('draws nothing for a pasted link or no credit', () => {
    expect(renderToStaticMarkup(<PhotoCredit credit={{ name: 'x', url: 'https://x.test', source: 'url' }} />)).toBe('')
    expect(renderToStaticMarkup(<PhotoCredit />)).toBe('')
  })
})

/*
  The white-on-photo rule lives in CSS, so no render can see it; pin that the stylesheet
  has it and that the user-colour rule steps aside for text on a photo.
*/
const indexCss = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

describe('text on a background photo (index.css)', () => {
  it('is white whatever was picked', () => {
    expect(indexCss).toMatch(/\[data-on-photo\] :is\([^)]*\)[^{]*\{\s*color: #fff !important;/)
  })

  it('is excluded from the user colour rule', () => {
    const rule = indexCss.split('\n').find((line) => line.startsWith("[data-deck-color='true']")) ?? ''
    expect(rule).toContain(':not([data-on-photo] *)')
  })
})
