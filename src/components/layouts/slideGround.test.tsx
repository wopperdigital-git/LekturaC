import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { CPP_DECK } from '@/engine/fixtures/cppDeck'
import { EMPTY_TEXT_STYLE } from '@/engine/textStyle'
import { PresentSlide } from '@/components/present/PresentSlide'

/**
 * The ground (`SlideSurface`'s `data-ground`) is read off the card by `groundOf`. Drawn through
 * `PresentSlide`, the way the presenter does, so the surface and the layout it holds are the
 * real ones.
 */
const draw = (card: Card, isFirstCard = card.orderIndex === 0) =>
  renderToStaticMarkup(<PresentSlide card={card} textStyle={EMPTY_TEXT_STYLE} isFirstCard={isFirstCard} />)

describe('a slide is painted on its ground', () => {
  it('draws the title slide on the deep ground', () => {
    expect(draw(CPP_DECK[0])).toContain('data-ground="deep"')
  })

  it('draws the quote on the tinted ground', () => {
    expect(draw(CPP_DECK[5])).toContain('data-ground="tint"')
  })

  it('draws a list slide on the plain ground', () => {
    expect(draw(CPP_DECK[1])).not.toContain('data-ground')
  })

  it('keeps the photo stage on a hero with one photo', () => {
    const card: Card = {
      ...CPP_DECK[0],
      blocks: [...CPP_DECK[0].blocks, { type: 'image', url: 'https://example.test/hero.png', alt: 'a hero' }],
    }
    const html = draw(card)
    expect(html).toContain('data-ground="deep"')
    expect(html).toContain('data-on-photo')
  })

  // The fixture's title slide names `hero`; this pins the first-card rule on an automatic layout.
  it('puts an automatic title-shaped card on the deep ground only in first place', () => {
    const card: Card = {
      id: 'auto-title',
      orderIndex: 0,
      layout: 'auto',
      visualStyle: 'structured',
      blocks: [
        { type: 'heading', text: 'A title' },
        { type: 'paragraph', text: 'One short line.' },
      ],
    }
    expect(draw(card)).toContain('data-ground="deep"')
    expect(draw({ ...card, orderIndex: 2 })).not.toContain('data-ground="deep"')
  })

  it('paints a cover tile drawn as the first card on the deep ground, whatever its orderIndex', () => {
    const card: Card = {
      id: 'cover',
      orderIndex: 2,
      layout: 'auto',
      visualStyle: 'structured',
      blocks: [
        { type: 'heading', text: 'A title' },
        { type: 'paragraph', text: 'One short line.' },
      ],
    }
    expect(draw(card, true)).toContain('data-ground="deep"')
  })

  it('leaves an empty card named hero on no ground', () => {
    const card: Card = { id: 'empty', orderIndex: 0, layout: 'hero', visualStyle: 'structured', blocks: [] }
    expect(draw(card)).not.toContain('data-ground')
  })

  it('reads the ground with the first-card flag the layout is drawn with', () => {
    const card: Card = {
      id: 'auto-title',
      orderIndex: 0,
      layout: 'auto',
      visualStyle: 'structured',
      blocks: [
        { type: 'heading', text: 'A title' },
        { type: 'paragraph', text: 'One short line.' },
      ],
    }
    // A cover tile or a preview that says "not first" must not paint a ground its layout is not drawn with.
    expect(draw(card, false)).not.toContain('data-ground="deep"')
  })
})

describe('every surface passes its ground', () => {
  const root = join(process.cwd(), 'src')
  const sources: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) && name !== 'SlideSurface.tsx') sources.push(path)
    }
  }
  walk(root)

  it('has a ground= beside every <SlideSurface in a source file', () => {
    const drawing = sources.filter((path) => readFileSync(path, 'utf8').includes('<SlideSurface'))
    expect(drawing.length).toBeGreaterThanOrEqual(6)
    for (const path of drawing) {
      const source = readFileSync(path, 'utf8')
      const surfaces = source.match(/<SlideSurface/g)?.length ?? 0
      const grounds = source.match(/\sground=\{/g)?.length ?? 0
      expect(grounds, path).toBe(surfaces)
    }
  })

  // `groundOf(card)` alone reads the first-card rule off `orderIndex`, while a surface draws its layout
  // with the flag its caller holds; the two must come from the same signal.
  it('hands groundOf the first-card flag the layout is drawn with, in every surface', () => {
    const drawing = sources.filter((path) => readFileSync(path, 'utf8').includes('<SlideSurface'))
    for (const path of drawing) {
      const source = readFileSync(path, 'utf8')
      const surfaces = source.match(/<SlideSurface/g)?.length ?? 0
      const withFlag = source.match(/groundOf\(\s*[\w.]+\s*,\s*\{\s*isFirstCard/g)?.length ?? 0
      const calls = source.match(/groundOf\(/g)?.length ?? 0
      expect(calls, path).toBeGreaterThanOrEqual(1)
      expect(withFlag, path).toBe(calls)
      expect(withFlag, path).toBeGreaterThanOrEqual(surfaces > 0 ? 1 : 0)
    }
  })
})

/*
  The ground and the deep-ground colour rules live in CSS, so no render can see them; pin that the
  stylesheet has them and that the deck and card colour rule steps aside inside a deep ground.
*/
const indexCss = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

describe('the ground rules (index.css)', () => {
  it('re-points the colour variables on a tinted and a deep ground', () => {
    expect(indexCss).toMatch(/\[data-ground='tint'\] \{\s*--slide-background: var\(--slide-ground-tint\);/)
    const deep = indexCss.match(/\[data-ground='deep'\] \{([^}]*)\}/)?.[1] ?? ''
    for (const name of ['background', 'foreground', 'muted', 'accent', 'accent-foreground', 'accent-soft', 'border', 'surface']) {
      expect(deep, name).toContain(`--slide-${name}:`)
    }
  })

  it('ignores a picked colour on a deep ground, but only where one was picked', () => {
    const rule = indexCss.split('\n').find((line) => line.startsWith("[data-ground='deep'] :is(")) ?? ''
    for (const part of ["[style^='color:']", "[style*=';color:']", "[style*='; color:']"]) {
      expect(rule, part).toContain(part)
    }
    expect(rule).toContain(':not([data-on-photo] *)')
    const at = indexCss.indexOf(rule)
    expect(indexCss.slice(at, indexCss.indexOf('}', at))).toContain('color: var(--slide-ground-deep-foreground) !important;')
  })

  it('keeps the deck and card colour rule out of a deep ground, including the surface itself', () => {
    const rule = indexCss.split('\n').find((line) => line.startsWith("[data-deck-color='true']")) ?? ''
    expect(rule).toContain(":not([data-ground='deep'])")
    expect(rule).toContain(":not([data-ground='deep'] *)")
  })
})
