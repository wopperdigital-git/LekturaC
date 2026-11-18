import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { CPP_DECK } from '@/engine/fixtures/cppDeck'
import { EMPTY_TEXT_STYLE } from '@/engine/textStyle'
import { PresentSlide } from '@/components/present/PresentSlide'
import { CODE_FONT, CODE_SIZE, SLIDE_GAP, SLIDE_SIZE } from '@/lib/theme-tokens'
import { BlockAdjustContext, BlockDataContext, type BlockAdjusting } from './adjustContext'
import { LayoutRenderer } from './LayoutRenderer'

/**
 * The callout (the slide's accent owner) and the code panel (a local deep ground), drawn through the
 * real renderer in both treatments. Each field is drawn once under its own address.
 */
const card = (layout: Card['layout'], blocks: ContentBlock[], style: VisualStyle = 'structured', orderIndex = 3): Card => ({
  ...CPP_DECK[1],
  orderIndex,
  layout,
  visualStyle: style,
  blocks,
})

const html = (c: Card, isFirstCard = c.orderIndex === 0) =>
  renderToStaticMarkup(<LayoutRenderer card={c} context={{ isFirstCard }} />)
// With the slide's own surface, which is what carries the ground (`data-ground`), as the presenter draws it.
const draw = (c: Card, isFirstCard = c.orderIndex === 0) =>
  renderToStaticMarkup(<PresentSlide card={c} textStyle={EMPTY_TEXT_STYLE} isFirstCard={isFirstCard} />)
const preTag = (markup: string) => markup.match(/<pre[^>]*>/)?.[0] ?? ''
const count = (markup: string, text: string) => markup.split(text).length - 1
const tagWith = (markup: string, attr: string) => markup.match(new RegExp(`<[a-z0-9]+[^>]*${attr}[^>]*>`))?.[0] ?? ''
const classesOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)
const styleOf = (tag: string) => (tag.match(/style="([^"]*)"/)?.[1] ?? '').replaceAll('&quot;', '"').replaceAll('&#x27;', "'")
const owners = (markup: string) => count(markup, 'data-accent-owner')

const heading: ContentBlock = { type: 'heading', text: 'Loops and branches' }
const lead: ContentBlock = { type: 'paragraph', text: 'Every program decides what to do next.' }
const callout: ContentBlock = { type: 'callout', label: 'Key idea', text: 'A loop needs a way to end.' }
const SOURCE = 'for (int i = 0; i < n; i++) {\n    total += i;\n}'
const code: ContentBlock = { type: 'code', code: SOURCE, label: 'A counting loop', caption: 'Runs n times.' }

describe.each(['structured', 'expressive'] as const)('callout (%s)', (style) => {
  const markup = html(card('standard', [heading, lead, callout, { type: 'bulletList', items: ['one', 'two'] }], style))
  const panel = tagWith(markup, 'data-callout=')

  it('is a rounded accent panel with accent-foreground ink, padded by the group gap', () => {
    expect(panel).not.toBe('')
    const classes = classesOf(panel)
    for (const wanted of ['rounded-slide', 'bg-slide-accent', 'text-slide-accent-foreground']) {
      expect(classes, wanted).toContain(wanted)
    }
    expect(styleOf(panel)).toContain(`padding:${SLIDE_GAP.group}`)
  })

  it('draws its label in small capitals above the text, and the text at the lead size', () => {
    const label = tagWith(markup, 'data-callout-label')
    expect(classesOf(label)).toContain('uppercase')
    expect(markup.indexOf('data-callout-label')).toBeLessThan(markup.indexOf('A loop needs a way to end.'))
    expect(markup).toContain(`font-size:${SLIDE_SIZE.lead}`)
    expect(count(markup, 'Key idea')).toBe(1)
    expect(count(markup, 'A loop needs a way to end.')).toBe(1)
  })

  it('marks itself the slide\'s one accent owner', () => {
    expect(panel).toContain('data-accent-owner')
    expect(owners(markup)).toBe(1)
  })

  it('draws without a label when it has none', () => {
    const bare = html(card('standard', [heading, { type: 'callout', text: 'Just the point.' }], style))
    expect(bare).not.toContain('data-callout-label')
    expect(count(bare, 'Just the point.')).toBe(1)
  })

  it('leaves the second callout unmarked: still one owner per slide', () => {
    const two = html(card('standard', [heading, callout, { type: 'callout', text: 'A second idea.' }], style))
    expect(count(two, 'data-callout=')).toBe(2)
    expect(owners(two)).toBe(1)
  })

  it('takes the accent from the stat on a stat hero: the figure is accent text with no panel', () => {
    const stat: ContentBlock = { type: 'stat', value: '72%', label: 'of loop bugs' }
    const out = html(card('statHero', [heading, stat, callout], style))
    expect(owners(out)).toBe(1)
    expect(tagWith(out, 'data-accent-owner')).toContain('data-callout')
    // The only accent-filled box on the slide is the callout; the figure is accent text.
    expect(count(out, 'bg-slide-accent')).toBe(1)
    expect(classesOf(tagWith(out, 'data-stat-figure'))).toContain('text-slide-accent')
    expect(classesOf(tagWith(out, 'data-stat-figure'))).not.toContain('text-slide-accent-foreground')
  })

  it('takes the accent from the featured comparison group: no featured panel', () => {
    const groups: ContentBlock[] = [
      { type: 'comparisonGroup', heading: 'Before', items: ['a1'] },
      { type: 'comparisonGroup', heading: 'After', items: ['b1'] },
    ]
    for (const layout of ['comparison', 'comparisonTable'] as const) {
      const out = html(card(layout, [heading, ...groups, callout], style))
      expect(owners(out), layout).toBe(1)
      expect(out, layout).not.toContain('data-accent-panel')
      expect(tagWith(out, 'data-accent-owner'), layout).toContain('data-callout')
    }
  })

  it('draws on a deep title slide, once, still on the accent fill', () => {
    const out = draw(card('auto', [heading, callout], style, 0), true)
    expect(out).toContain('data-ground="deep"')
    expect(count(out, 'A loop needs a way to end.')).toBe(1)
    expect(classesOf(tagWith(out, 'data-callout='))).toContain('bg-slide-accent')
    expect(owners(out)).toBe(1)
  })
})

describe.each(['structured', 'expressive'] as const)('code (%s)', (style) => {
  const plain = html(card('standard', [heading, lead, code], style))
  const panel = tagWith(plain, 'data-code=')
  const pre = preTag(plain)

  it('draws the text once with its whitespace preserved', () => {
    expect(count(plain, 'for (int i = 0; i &lt; n; i++) {')).toBe(1)
    expect(plain).toContain('\n    total += i;\n}')
    expect(classesOf(pre)).toContain('whitespace-pre')
    // The run inside must not re-enable wrapping.
    expect(plain).toMatch(/<pre[^>]*><span[^>]*white-space:pre[;"]/)
    expect(plain).not.toMatch(/<pre[^>]*><span[^>]*white-space:pre-wrap/)
  })

  it('is a rounded panel padded by the group gap, with the label above and the muted caption below', () => {
    expect(classesOf(panel)).toContain('rounded-slide')
    expect(styleOf(panel)).toContain(`padding:${SLIDE_GAP.group}`)
    expect(plain.indexOf('A counting loop')).toBeLessThan(plain.indexOf('<pre'))
    expect(plain.indexOf('<pre')).toBeLessThan(plain.indexOf('Runs n times.'))
    expect(count(plain, 'A counting loop')).toBe(1)
    expect(count(plain, 'Runs n times.')).toBe(1)
    expect(classesOf(tagWith(plain, 'data-code-caption'))).toContain('text-slide-muted')
    expect(classesOf(tagWith(plain, 'data-code-label'))).toContain('text-slide-muted')
  })

  it('always sets the monospace face at 0.85 of the body, never through the slide font variables', () => {
    expect(styleOf(pre)).toContain(`font-family:${CODE_FONT}`)
    expect(styleOf(pre)).toContain(`font-size:${CODE_SIZE}`)
    expect(styleOf(pre)).not.toContain('--slide-font')
  })

  it('sits on its own deep ground on a plain slide and on a tint slide', () => {
    expect(panel).toContain('data-ground="deep"')
    const tint = draw(card('statement', [heading, lead, code], style))
    expect(tint).toContain('data-ground="tint"')
    expect(tagWith(tint, 'data-code=')).toContain('data-ground="deep"')
  })

  it('carries no ground of its own on a deep slide: the stylesheet gives it a light panel there', () => {
    for (const out of [
      draw(card('section', [heading, code], style)),
      draw(card('auto', [heading, code], style, 0), true),
    ]) {
      expect(out).toContain('data-ground="deep"')
      expect(tagWith(out, 'data-code=')).not.toContain('data-ground')
      expect(count(out, 'for (int i = 0; i &lt; n; i++) {')).toBe(1)
    }
  })

  it('owns no accent fill, so it never counts toward the budget', () => {
    expect(owners(plain)).toBe(0)
    expect(plain).not.toContain('bg-slide-accent')
  })

  it('keeps the surface width: the panel and its text may shrink, and a long line scrolls or clips', () => {
    const long = { type: 'code', code: `${'x'.repeat(120)}\n${'y'.repeat(10)}` } as ContentBlock
    const out = html(card('standard', [heading, long], style))
    const longPanel = classesOf(tagWith(out, 'data-code='))
    expect(longPanel).toContain('min-w-0')
    expect(longPanel).toContain('max-w-full')
    // Read-only surfaces (presenter, thumbnails, video) clip it.
    expect(classesOf(preTag(out))).toContain('overflow-hidden')
    expect(classesOf(preTag(out))).not.toContain('overflow-x-auto')
  })

  it('scrolls a long line inside the panel on the live editor', () => {
    const adjusting: BlockAdjusting = {
      selected: null,
      selectedItem: null,
      select: () => undefined,
      selectItem: () => undefined,
      change: () => undefined,
    }
    const out = renderToStaticMarkup(
      <BlockAdjustContext.Provider value={adjusting}>
        <LayoutRenderer card={card('standard', [heading, code], style)} />
      </BlockAdjustContext.Provider>,
    )
    expect(classesOf(preTag(out))).toContain('overflow-x-auto')
    expect(classesOf(preTag(out))).not.toContain('overflow-hidden')
  })

  it('never draws a stored mark on the code field, though it still draws one on its label', () => {
    const inline = {
      '1:code': {
        marks: [
          { type: 'bold' as const, start: 0, end: 3 },
          { type: 'color' as const, start: 0, end: 3, value: '#ff0000' },
          { type: 'fontFamily' as const, start: 0, end: 3, value: 'Georgia' },
        ],
      },
      '1:label': { marks: [{ type: 'bold' as const, start: 0, end: 1 }] },
    }
    const out = renderToStaticMarkup(
      <BlockDataContext.Provider value={{ adjusts: undefined, inline }}>
        <LayoutRenderer card={card('standard', [heading, code], style)} />
      </BlockDataContext.Provider>,
    )
    const preToEnd = out.slice(out.indexOf('<pre'), out.indexOf('</pre>'))
    expect(preToEnd).not.toContain('font-weight:700')
    expect(preToEnd).not.toContain('#ff0000')
    expect(preToEnd).not.toContain('Georgia')
    const labelHtml = out.slice(out.indexOf('data-code-label'), out.indexOf('<pre'))
    expect(labelHtml).toContain('font-weight:700')
  })
})

describe('the stylesheet and the video draw code the same way', () => {
  const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

  it('gives the panel a light fill and dark ink on a deep slide, from tokens the deep re-pointing leaves alone', () => {
    const rule = css.match(/\[data-ground='deep'\] \[data-code\] \{[^}]*\}/)?.[0] ?? ''
    expect(rule).not.toBe('')
    expect(rule).toContain('background: var(--slide-ground-deep-foreground)')
    expect(rule).toContain('color: var(--slide-ground-deep)')
    expect(rule).toContain('--slide-foreground: var(--slide-ground-deep)')
    expect(rule).toMatch(/--slide-muted: color-mix\(in srgb, var\(--slide-ground-deep\) 80%, var\(--slide-ground-deep-foreground\)\)/)
  })

  it('keeps every deck, card and character colour off the code run', () => {
    // A pick rides on `[data-deck-color]` (excluded under a deep ground, which the panel carries or sits in)
    // and on inline colours (a character mark, refused). Neither selector may reach the `pre`.
    expect(css).toMatch(/\[data-deck-color='true'\] :is\([^)]*\):not\(\[class\*='accent-foreground'\]\)[^{]*:not\(\[data-ground='deep'\] \*\)/)
    expect(css).not.toMatch(/\[data-deck-color='true'\] :is\([^)]*\bpre\b/)
  })

  it('names the code face in the video font probe, or the video draws a fallback', () => {
    const source = readFileSync(new URL('../../video/renderFrame.tsx', import.meta.url), 'utf8')
    expect(source).toContain('CODE_FONT')
  })
})

describe('the gallery cards', () => {
  it('draws g-callout with one accent owner and g-code on its own deep ground', async () => {
    const { GALLERY_DECK } = await import('@/engine/fixtures/galleryDeck')
    const byId = (id: string) => GALLERY_DECK.find((c) => c.id === id)!
    const callout = draw(byId('g-callout'))
    expect(owners(callout)).toBe(1)
    const plainCode = draw(byId('g-code'))
    expect(tagWith(plainCode, 'data-code=')).toContain('data-ground="deep"')
    const deepCode = draw(byId('g-code-deep'))
    expect(deepCode).toContain('data-ground="deep"')
    expect(tagWith(deepCode, 'data-code=')).not.toContain('data-ground')
  })
})
