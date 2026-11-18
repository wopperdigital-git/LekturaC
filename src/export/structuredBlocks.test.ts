import { describe, expect, it } from 'vitest'
import { RENDERERS, fitCard, type PptxSlide, type RenderContext } from './slideRenderers'
import { slideGroup } from './slideGroup'
import { cardBoxes } from './blockBoxes'
import { CODE_FACE, inksFor } from './structuredBlocks'
import { resolveLayout } from '@/engine/layoutEngine'
import { BUILTIN_THEMES, DEFAULT_THEME, codeLightMuted, deepMuted, smallAccentInk, type ThemeTokens } from '@/lib/theme-tokens'
import { mergeTextStyle } from '@/engine/textStyle'
import type { Card, ContentBlock } from '@/engine/contentBlocks'
import { estimateMeasurer } from './textFit'
import { hex } from './textRun'
import type { PptxTextRun } from './textRun'

/*
  The structured blocks in the exported file: a heading's kicker, term rows, a callout and a
  code panel. Each is drawn through the real renderers against a capturing slide, in the plain
  arrangements and on a nudged card, on a plain, a tint and a deep slide.
*/

interface Captured {
  text: string
  options: Record<string, unknown>
  runs: PptxTextRun[]
}

function fakeSlide() {
  const texts: Captured[] = []
  const shapes: { shape: string; options: Record<string, unknown> }[] = []
  const slide: PptxSlide & { texts: Captured[]; shapes: typeof shapes } = {
    texts,
    shapes,
    set background(_value: { color: string }) {
      void _value
    },
    addImage() {},
    addText(value, options) {
      const runs = typeof value === 'string' ? [{ text: value, options: {} }] : value
      texts.push({ text: runs.map((run) => run.text).join(''), options, runs })
    },
    addShape(shape, options) {
      shapes.push({ shape, options })
    },
  }
  return slide
}

function renderOn(card: Card, theme: ThemeTokens = DEFAULT_THEME, images: Map<string, string> = new Map()) {
  const isFirstCard = card.orderIndex === 0
  const context: RenderContext = { images, layout: resolveLayout(card.layout, card.blocks, { isFirstCard }) }
  const slide = fakeSlide()
  RENDERERS[slideGroup(card, isFirstCard)](slide, card, theme, mergeTextStyle({}, card.textStyle), estimateMeasurer, context)
  return slide
}

const cardOf = (blocks: ContentBlock[], extra: Partial<Card> = {}): Card => ({
  id: 'c1',
  orderIndex: 2,
  blocks,
  layout: 'auto',
  visualStyle: 'structured',
  ...extra,
})

const HEADING: ContentBlock = { type: 'heading', text: 'Loops' }
const POINTS: ContentBlock[] = [
  { type: 'point', label: 'for', text: 'Counts up to a limit' },
  { type: 'point', label: 'while', text: 'Repeats while a test holds' },
  { type: 'point', label: 'do while', text: 'Runs once, then tests' },
]
const NUDGE = { '0': { dx: 0, dy: 0.001, rotation: 0 } }

const textOf = (slide: ReturnType<typeof fakeSlide>, needle: string) => slide.texts.find((t) => t.text.includes(needle))!
const allText = (slide: ReturnType<typeof fakeSlide>) => slide.texts.map((t) => t.text).join('\n')
const fillOf = (shape: { options: Record<string, unknown> }) => (shape.options.fill as { color: string }).color

const c = DEFAULT_THEME.colors
const midnight = BUILTIN_THEMES.find((t) => t.id === 'midnight')!

describe('a kicker', () => {
  const withKicker = cardOf([{ type: 'heading', text: 'Loops', kicker: 'Part two' }, { type: 'paragraph', text: 'Body words' }])

  it('is a small accent paragraph above its heading, and pushes the heading down', () => {
    const slide = renderOn(withKicker)
    const kicker = textOf(slide, 'PART TWO')
    const heading = textOf(slide, 'Loops')
    expect(kicker.options.fontSize).toBeLessThan(heading.options.fontSize as number)
    expect(kicker.options.color).toBe(hex(smallAccentInk(c)))
    expect(kicker.options.fontFace).toBe('Bricolage Grotesque')
    expect((kicker.options.y as number) + (kicker.options.h as number)).toBeLessThanOrEqual(heading.options.y as number)
  })

  it('leaves a heading without one exactly where it was', () => {
    const plain = renderOn(cardOf([{ type: 'heading', text: 'Loops' }, { type: 'paragraph', text: 'Body words' }]))
    expect(textOf(plain, 'Loops').options.y).toBe(0.45)
  })

  it('is a blank-kicker no-op: whitespace draws nothing', () => {
    const slide = renderOn(cardOf([{ type: 'heading', text: 'Loops', kicker: '   ' }]))
    expect(slide.texts).toHaveLength(1)
    expect(textOf(slide, 'Loops').options.y).toBe(0.45)
  })

  it('carries its own marks', () => {
    const card = cardOf([{ type: 'heading', text: 'Loops', kicker: 'Part two' }], {
      inline: { '0:kicker': { marks: [{ type: 'bold', start: 0, end: 4 }] } },
    })
    const kicker = textOf(renderOn(card), 'PART TWO')
    expect(kicker.runs[0].text).toBe('PART')
    expect(kicker.runs[0].options.bold).toBe(true)
  })

  it('rides the title on a title slide, above it in the same group', () => {
    const title = cardOf([{ type: 'heading', text: 'Welcome', kicker: 'Lesson one' }, { type: 'paragraph', text: 'A subtitle' }], {
      orderIndex: 0,
      layout: 'hero',
    })
    const slide = renderOn(title)
    const kicker = textOf(slide, 'LESSON ONE')
    const heading = textOf(slide, 'Welcome')
    expect(kicker.options.align).toBe('center')
    expect((kicker.options.y as number) + (kicker.options.h as number)).toBeLessThanOrEqual(heading.options.y as number)
    // The group stays on the slide.
    expect(kicker.options.y as number).toBeGreaterThanOrEqual(0.45)
  })

  it('is drawn above a heading in a stat, a comparison and a quote slide', () => {
    const kicked: ContentBlock = { type: 'heading', text: 'Heading', kicker: 'Small words' }
    const cards = [
      cardOf([kicked, { type: 'stat', value: '50%', label: 'lost' }, { type: 'stat', value: '9', label: 'kept' }]),
      cardOf([kicked, { type: 'comparisonGroup', heading: 'A', items: ['x'] }, { type: 'comparisonGroup', heading: 'B', items: ['y'] }]),
      cardOf([kicked, { type: 'quote', text: 'Said' }]),
    ]
    for (const card of cards) expect(allText(renderOn(card)), slideGroup(card, false)).toContain('SMALL WORDS')
  })

  it('on a nudged card shares the heading frame with its title', () => {
    const card = cardOf([{ type: 'heading', text: 'Loops', kicker: 'Part two' }], { adjusts: NUDGE })
    const slide = renderOn(card)
    const kicker = textOf(slide, 'PART TWO')
    const heading = textOf(slide, 'Loops')
    expect(kicker.options.fontSize).toBeLessThan(heading.options.fontSize as number)
    expect((kicker.options.y as number) + (kicker.options.h as number)).toBeLessThanOrEqual((heading.options.y as number) + 1e-9)
  })

  it('takes room in the nudged baseline', () => {
    const plain = cardBoxes({ blocks: [{ type: 'heading', text: 'T' }], adjusts: undefined }).boxes['0'].h
    const kicked = cardBoxes({ blocks: [{ type: 'heading', text: 'T', kicker: 'k' }], adjusts: undefined }).boxes['0'].h
    expect(kicked).toBeGreaterThan(plain)
  })
})

describe('term rows', () => {
  const card = cardOf([HEADING, ...POINTS])

  it('classify as a body slide with a two-column table', () => {
    expect(slideGroup(card, false)).toBe('body')
  })

  it('draw the term in the accent and the heading face, the meaning in the body face, side by side', () => {
    const slide = renderOn(card)
    for (const point of POINTS as { label: string; text: string }[]) {
      const term = slide.texts.find((t) => t.text === point.label)!
      const meaning = textOf(slide, point.text)
      expect(term.options.color).toBe(hex(c.accent))
      expect(term.options.fontFace).toBe('Bricolage Grotesque')
      expect(term.options.bold).toBe(true)
      expect(meaning.options.color).toBe(hex(c.foreground))
      expect(meaning.options.fontFace).toBe('Hanken Grotesk')
      // Two aligned columns on one row: the meaning starts to the right of the term, level with it.
      expect(meaning.options.x as number).toBeGreaterThan((term.options.x as number) + (term.options.w as number))
      expect(meaning.options.y).toBe(term.options.y)
    }
  })

  it('are separated by hairlines: one above every row and one below the last', () => {
    const slide = renderOn(card)
    const rules = slide.shapes.filter((s) => s.shape === 'line')
    expect(rules).toHaveLength(POINTS.length + 1)
    for (const rule of rules) expect((rule.options.line as { color: string }).color).toBe(hex(c.border))
    // Row boxes are not panels: nothing is filled (the only other shape is the heading's accent rule).
    expect(slide.shapes.filter((s) => s.shape === 'roundRect')).toHaveLength(0)
  })

  it('stack in author order beneath the heading, each row below the last', () => {
    const slide = renderOn(card)
    const ys = (POINTS as { label: string }[]).map((p) => slide.texts.find((t) => t.text === p.label)!.options.y as number)
    expect(ys).toEqual([...ys].sort((a, b) => a - b))
    expect(new Set(ys).size).toBe(ys.length)
    expect(ys[0]).toBeGreaterThan(textOf(slide, 'Loops').options.y as number)
  })

  it('carry the marks stored on a term and on a meaning', () => {
    const marked = cardOf([HEADING, ...POINTS], {
      inline: {
        '1:label': { marks: [{ type: 'italic', start: 0, end: 3 }] },
        '2:text': { marks: [{ type: 'bold', start: 0, end: 7 }] },
      },
    })
    const slide = renderOn(marked)
    expect(slide.texts.find((t) => t.text === 'for')!.runs[0].options.italic).toBe(true)
    expect(textOf(slide, 'Repeats while').runs[0].options.bold).toBe(true)
  })

  it('on a nudged card each row is its own element in its own box, ruled above and the last below', () => {
    const slide = renderOn({ ...card, adjusts: { '2': { dx: 0.02, dy: 0.01, rotation: 0 } } })
    for (const point of POINTS as { label: string; text: string }[]) {
      expect(slide.texts.find((t) => t.text === point.label)).toBeDefined()
      expect(textOf(slide, point.text)).toBeDefined()
    }
    expect(slide.shapes.filter((s) => s.shape === 'line')).toHaveLength(POINTS.length + 1)
    // The nudged row (block 2) sits further right than the unnudged one above it.
    const x = (label: string) => slide.texts.find((t) => t.text === label)!.options.x as number
    expect(x('while')).toBeGreaterThan(x('for'))
  })

  it('on a nudged card a lone row closes itself, and a row beside another point does not double the rule', () => {
    const lone = renderOn(cardOf([HEADING, POINTS[0]], { adjusts: NUDGE }))
    expect(lone.shapes.filter((s) => s.shape === 'line')).toHaveLength(2)
  })
})

describe('a callout', () => {
  const callout: ContentBlock = { type: 'callout', label: 'Remember', text: 'Always close the file' }

  it('is an accent-filled rounded panel with its text in the accent foreground', () => {
    const slide = renderOn(cardOf([HEADING, { type: 'paragraph', text: 'Intro' }, callout]))
    const panel = slide.shapes.find((s) => s.shape === 'roundRect')!
    expect(fillOf(panel)).toBe(hex(c.accent))
    expect(textOf(slide, 'Always close the file').options.color).toBe(hex(c.accentForeground))
    expect(textOf(slide, 'Remember').options.color).toBe(hex(c.accentForeground))
    // Label above the text, both on the panel.
    const label = textOf(slide, 'Remember').options
    const body = textOf(slide, 'Always close the file').options
    expect(label.y as number).toBeLessThan(body.y as number)
    expect(label.fontSize as number).toBeLessThan(body.fontSize as number)
    expect(panel.options.y as number).toBeLessThanOrEqual(label.y as number)
    expect((panel.options.y as number) + (panel.options.h as number)).toBeGreaterThanOrEqual((body.y as number) + (body.h as number))
  })

  it('fills only the first callout on a slide: another sits on the tint', () => {
    const slide = renderOn(cardOf([HEADING, callout, { type: 'callout', label: 'Also', text: 'A second idea' }]))
    const panels = slide.shapes.filter((s) => s.shape === 'roundRect')
    expect(panels).toHaveLength(2)
    expect(fillOf(panels[0])).toBe(hex(c.accent))
    expect(fillOf(panels[1])).toBe(hex(c.tint))
    expect(textOf(slide, 'A second idea').options.color).toBe(hex(c.foreground))
    expect(textOf(slide, 'Also').options.color).toBe(hex(smallAccentInk(c)))
  })

  it('works without a label', () => {
    const slide = renderOn(cardOf([HEADING, { type: 'callout', text: 'Just the idea' }]))
    expect(slide.shapes.filter((s) => s.shape === 'roundRect')).toHaveLength(1)
    expect(slide.texts.filter((t) => t.text !== 'Loops')).toHaveLength(1)
  })

  it('ignores an element colour pick on the accent fill', () => {
    const slide = renderOn(cardOf([HEADING, callout], { inline: { '1': { style: { color: '#123456' } } } }))
    expect(textOf(slide, 'Always close the file').options.color).toBe(hex(c.accentForeground))
  })

  it('on a nudged card is drawn in the box the user left it in', () => {
    const card = cardOf([HEADING, callout], { adjusts: { '1': { dx: 0.1, dy: 0.05, w: 0.5, h: 0.2, rotation: 0 } } })
    const slide = renderOn(card)
    const panel = slide.shapes.find((s) => s.shape === 'roundRect')!
    expect(fillOf(panel)).toBe(hex(c.accent))
    expect(textOf(slide, 'Always close the file')).toBeDefined()
    expect(textOf(slide, 'Remember')).toBeDefined()
    // The panel is the user's frame: it starts where their box starts and is at least as tall.
    const { boxes, height } = cardBoxes(card, DEFAULT_THEME.typography.scale)
    const fit = fitCard(height)
    expect(panel.options.x as number).toBeCloseTo(boxes['1'].x * fit.scale + fit.offsetX, 6)
    expect(panel.options.y as number).toBeCloseTo(boxes['1'].y * fit.scale + fit.offsetY, 6)
    expect(panel.options.w as number).toBeCloseTo(boxes['1'].w * fit.scale, 6)
    expect(panel.options.h as number).toBeGreaterThanOrEqual(boxes['1'].h * fit.scale - 1e-9)
  })
})

describe('a code panel', () => {
  const code: ContentBlock = { type: 'code', label: 'main.cpp', code: 'int main() {\n  return 0;\n}', caption: 'The smallest program' }

  it('is the deep ground with light ink, set in Consolas, label above and caption below', () => {
    const slide = renderOn(cardOf([HEADING, code]))
    const panel = slide.shapes.find((s) => s.shape === 'roundRect')!
    expect(fillOf(panel)).toBe(hex(c.deep))
    const body = textOf(slide, 'int main()')
    expect(body.options.fontFace).toBe(CODE_FACE)
    expect(CODE_FACE).toBe('Consolas')
    expect(body.options.color).toBe(hex(c.deepForeground))
    expect(body.text).toBe('int main() {\n  return 0;\n}'.replace(/\n/g, '')) // runs joined without the line breaks
    expect(body.runs.map((r) => r.text)).toEqual(['int main() {', '  return 0;', '}'])
    const label = textOf(slide, 'main.cpp').options
    const caption = textOf(slide, 'The smallest program').options
    expect(label.y as number).toBeLessThan(body.options.y as number)
    expect(caption.y as number).toBeGreaterThan(body.options.y as number)
    expect(label.color).toBe(hex(deepMuted(c)))
    expect(caption.color).toBe(hex(deepMuted(c)))
  })

  it('takes no marks on the code and ignores a colour mark on its label', () => {
    const slide = renderOn(
      cardOf([HEADING, code], {
        inline: {
          '1:code': { marks: [{ type: 'bold', start: 0, end: 3 }] },
          '1:label': { marks: [{ type: 'color', start: 0, end: 4, value: '#ff0000' }] },
        },
      }),
    )
    for (const run of textOf(slide, 'int main()').runs) expect(run.options.bold).toBeUndefined()
    for (const run of textOf(slide, 'main.cpp').runs) expect(run.options.color).toBeUndefined()
  })

  it('cuts a line wider than the panel with an ellipsis rather than wrapping it', () => {
    const slide = renderOn(cardOf([HEADING, { type: 'code', code: `short\n${'x'.repeat(200)}` }]))
    const runs = textOf(slide, 'short').runs
    expect(runs).toHaveLength(2)
    expect(runs[1].text.endsWith('…')).toBe(true)
    expect(runs[1].text.length).toBeLessThan(200)
    expect(textOf(slide, 'short').options.wrap).toBe(false)
  })

  it('cuts a long listing from the end and never sets it below the caption size', () => {
    const many = Array.from({ length: 40 }, (_, i) => `line ${i + 1};`).join('\n')
    const slide = renderOn(cardOf([HEADING, { type: 'code', code: many }]))
    const body = textOf(slide, 'line 1;')
    const lines = body.runs.map((r) => r.text)
    expect(lines.length).toBeLessThan(40)
    expect(lines[0]).toBe('line 1;')
    expect(lines[lines.length - 1]).toBe('…')
    // The theme's body is 14pt; the caption step of it is 10pt.
    expect(body.options.fontSize as number).toBeGreaterThanOrEqual(10)
    // The panel stays on the slide.
    const panel = slide.shapes.find((s) => s.shape === 'roundRect')!
    expect((panel.options.y as number) + (panel.options.h as number)).toBeLessThanOrEqual(5.625)
  })

  it('keeps every line of a short listing', () => {
    const slide = renderOn(cardOf([HEADING, { type: 'code', code: 'a\nb\nc' }]))
    expect(textOf(slide, 'abc').runs.map((r) => r.text)).toEqual(['a', 'b', 'c'])
  })

  it('on a nudged card is drawn in its box in Consolas, cut to the box', () => {
    const many = Array.from({ length: 40 }, (_, i) => `line ${i + 1};`).join('\n')
    const card = cardOf([HEADING, { type: 'code', label: 'L', code: many }], { adjusts: { '1': { dx: 0, dy: 0, w: 0.5, h: 0.2, rotation: 0 } } })
    const slide = renderOn(card)
    const body = textOf(slide, 'line 1;')
    expect(body.options.fontFace).toBe('Consolas')
    expect(body.runs.length).toBeLessThan(40)
    const panel = slide.shapes.find((s) => s.shape === 'roundRect')!
    expect(fillOf(panel)).toBe(hex(c.deep))
  })

  it('is a light panel with dark ink on a deep slide', () => {
    const title = cardOf([HEADING, { type: 'paragraph', text: 'Subtitle' }, code], { orderIndex: 0, layout: 'hero' })
    const slide = renderOn(title)
    const panel = slide.shapes.find((s) => s.shape === 'roundRect')!
    expect(fillOf(panel)).toBe(hex(c.deepForeground))
    expect(textOf(slide, 'int main()').options.color).toBe(hex(c.deep))
    expect(textOf(slide, 'main.cpp').options.color).toBe(hex(codeLightMuted(c)))
    expect(fillOf(panel)).not.toBe(hex(c.deep))
  })
})

describe('on a deep or tinted slide', () => {
  it('a callout on a title slide is the inverted accent: the deep ground\'s ink as the fill', () => {
    const title = cardOf([HEADING, { type: 'callout', label: 'Key', text: 'The idea' }], { orderIndex: 0, layout: 'hero' })
    const slide = renderOn(title)
    const panel = slide.shapes.find((s) => s.shape === 'roundRect')!
    expect(fillOf(panel)).toBe(hex(c.deepForeground))
    expect(textOf(slide, 'The idea').options.color).toBe(hex(c.deep))
  })

  it('a quiet callout on a tint slide is on the surface colour', () => {
    const card = cardOf([HEADING, { type: 'quote', text: 'Said' }, { type: 'callout', text: 'One' }, { type: 'callout', text: 'Two' }])
    const slide = renderOn(card)
    const panels = slide.shapes.filter((s) => s.shape === 'roundRect')
    expect(fillOf(panels[1])).toBe(hex(c.surface))
  })

  it.each([
    ['bordo', DEFAULT_THEME],
    ['midnight', midnight],
  ])('every theme keeps the code panel apart from its slide (%s)', (_name, theme) => {
    for (const ground of ['plain', 'tint', 'deep'] as const) {
      const inks = inksFor(theme, ground)
      expect(inks.code.fill).not.toBe(ground === 'deep' ? theme.colors.deep : theme.colors.background)
      expect(inks.code.fill).not.toBe(inks.code.ink)
    }
  })
})

describe('every arrangement carries the structured blocks', () => {
  const extras: ContentBlock[] = [
    { type: 'point', label: 'TermOne', text: 'Meaning one' },
    { type: 'point', label: 'TermTwo', text: 'Meaning two' },
    { type: 'callout', label: 'KeyLabel', text: 'Key text' },
    { type: 'code', label: 'CodeLabel', code: 'x = 1', caption: 'CodeCaption' },
  ]
  const words = ['TermOne', 'Meaning one', 'TermTwo', 'Meaning two', 'KeyLabel', 'Key text', 'CodeLabel', 'x = 1', 'CodeCaption']
  const kicked: ContentBlock = { type: 'heading', text: 'Heading', kicker: 'Kicker words' }

  const cases: [string, Card][] = [
    ['a title slide', cardOf([kicked, { type: 'paragraph', text: 'Sub' }, ...extras], { orderIndex: 0, layout: 'hero' })],
    ['a section slide', cardOf([kicked, ...extras], { layout: 'section' })],
    ['a stat slide', cardOf([kicked, { type: 'stat', value: '50%', label: 'lost' }, ...extras])],
    ['a stat grid', cardOf([kicked, { type: 'stat', value: '1', label: 'a' }, { type: 'stat', value: '2', label: 'b' }, ...extras])],
    ['a comparison', cardOf([kicked, { type: 'comparisonGroup', heading: 'A', items: ['x'] }, { type: 'comparisonGroup', heading: 'B', items: ['y'] }, ...extras])],
    ['a quote slide', cardOf([kicked, { type: 'quote', text: 'Said it', attribution: 'Someone' }, ...extras])],
    ['a body slide', cardOf([kicked, { type: 'paragraph', text: 'Prose' }, ...extras])],
    ['a timeline', cardOf([kicked, { type: 'timelineStep', label: 'S1', text: 'first' }, ...extras])],
    ['a statement', cardOf([kicked, { type: 'paragraph', text: 'Short claim' }, ...extras], { layout: 'statement' })],
    ['a card with a nudged element', cardOf([kicked, { type: 'paragraph', text: 'Prose' }, ...extras], { adjusts: NUDGE })],
  ]

  it.each(cases)('%s draws every word of them, once', (_name, card) => {
    const slide = renderOn(card)
    const text = allText(slide)
    for (const word of words) {
      expect(text.split(word).length - 1, word).toBe(1)
    }
    expect(text).toContain('KICKER WORDS')
  })

  it.each(cases)('%s keeps everything on the slide', (_name, card) => {
    const slide = renderOn(card)
    for (const t of slide.texts) {
      const { x, y, w, h } = t.options as { x: number; y: number; w: number; h: number }
      expect(x, t.text).toBeGreaterThanOrEqual(-1e-9)
      expect(y, t.text).toBeGreaterThanOrEqual(-1e-9)
      expect(x + w, t.text).toBeLessThanOrEqual(10 + 1e-9)
      expect(y + h, t.text).toBeLessThanOrEqual(5.625 + 1e-6)
    }
  })

  it('a body slide keeps the order of the blocks: prose, then the rows, the callout and the code', () => {
    const slide = renderOn(cases.find(([n]) => n === 'a body slide')![1])
    const y = (needle: string) => textOf(slide, needle).options.y as number
    expect(y('Prose')).toBeLessThan(y('TermOne'))
    expect(y('TermOne')).toBeLessThan(y('KeyLabel'))
    expect(y('KeyLabel')).toBeLessThan(y('CodeLabel'))
  })
})

/* ------------------------------------------------------------ fix round 1 --- */

const URL_A = 'https://images.pexels.com/photos/9/lake.jpeg'
const JPEG =
  'data:image/jpeg;base64,' +
  btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1))

describe('on a placed photo (hero)', () => {
  const card = cardOf(
    [
      { type: 'heading', text: 'Welcome' },
      { type: 'callout', label: 'Key', text: 'The idea' },
      { type: 'code', label: 'main.cpp', code: 'x = 1', caption: 'Tiny' },
      { type: 'image', url: URL_A, alt: 'A lake' },
    ],
    { orderIndex: 0, layout: 'hero' },
  )

  it('keeps the callout and code in their own inks while the heading goes white', () => {
    const slide = renderOn(card, DEFAULT_THEME, new Map([[URL_A, JPEG]]))
    expect(textOf(slide, 'Welcome').options.color).toBe('ffffff')
    expect(textOf(slide, 'The idea').options.color).toBe(hex(c.accentForeground))
    expect(textOf(slide, 'Key').options.color).toBe(hex(c.accentForeground))
    expect(textOf(slide, 'x = 1').options.color).toBe(hex(c.deepForeground))
    expect(textOf(slide, 'main.cpp').options.color).toBe(hex(deepMuted(c)))
    expect(textOf(slide, 'Tiny').options.color).toBe(hex(deepMuted(c)))
  })
})

describe('size picks on the structured blocks', () => {
  const pick = { style: { fontScale: 1.4 } }
  const blocks: ContentBlock[] = [
    HEADING,
    { type: 'point', label: 'TermX', text: 'Meaning x' },
    { type: 'callout', label: 'LabelX', text: 'Callout x' },
    { type: 'code', code: 'codeX = 1' },
  ]
  const sizeOf = (slide: ReturnType<typeof fakeSlide>, needle: string) => textOf(slide, needle).options.fontSize as number
  const ADJ = {
    '1': { dx: 0, dy: 0, rotation: 0, w: 0.9, h: 0.1 },
    '2': { dx: 0, dy: 0, rotation: 0, w: 0.9, h: 0.6 },
    '3': { dx: 0, dy: 0, rotation: 0, w: 0.9, h: 0.6 },
  }

  describe.each([
    ['in the arrangement', {}],
    ['on a nudged card', { adjusts: ADJ }],
  ])('%s', (_name, extra) => {
    it.each([
      ['a point (term and meaning)', 1, ['TermX', 'Meaning x']],
      ['a callout (label and text)', 2, ['LabelX', 'Callout x']],
      ['code', 3, ['codeX']],
    ])('an element size pick on %s makes its text larger', (_what, index, needles) => {
      const base = renderOn(cardOf(blocks, extra))
      const picked = renderOn(cardOf(blocks, { ...extra, inline: { [String(index)]: pick } }))
      for (const needle of needles) expect(sizeOf(picked, needle), needle).toBeGreaterThan(sizeOf(base, needle))
    })
  })

  it('a pick on one block leaves its neighbours alone', () => {
    const base = renderOn(cardOf(blocks))
    const picked = renderOn(cardOf(blocks, { inline: { '2': pick } }))
    expect(sizeOf(picked, 'Meaning x')).toBe(sizeOf(base, 'Meaning x'))
  })
})

describe('small type floors', () => {
  it('a kicker and a callout label are never below the export text floor', () => {
    const slide = renderOn(
      cardOf([{ type: 'heading', text: 'Loops', kicker: 'Part two' }, { type: 'callout', label: 'Key', text: 'Idea' }]),
    )
    expect(textOf(slide, 'PART TWO').options.fontSize as number).toBeGreaterThanOrEqual(10)
    expect(textOf(slide, 'Key').options.fontSize as number).toBeGreaterThanOrEqual(10)
  })
})

describe('a long kicker and title with a strip at the foot', () => {
  const long = 'A very long small heading that wraps onto a second line ' + 'word '.repeat(12)
  const longTitle = 'An extremely long title that goes on and on across lines ' + 'title '.repeat(25)

  it('keeps the heading group above the strip on a title slide', () => {
    const card = cardOf(
      [
        { type: 'heading', text: longTitle, kicker: long },
        { type: 'callout', label: 'Key', text: 'The idea of the slide, said in a sentence' },
        { type: 'code', code: 'a\nb\nc' },
      ],
      { orderIndex: 0, layout: 'hero' },
    )
    const slide = renderOn(card)
    const stripTop = Math.min(...slide.shapes.filter((s) => s.shape === 'roundRect').map((s) => s.options.y as number))
    const group = slide.texts.filter((t) => /word|title/.test(t.text))
    expect(group.length).toBeGreaterThan(0)
    for (const t of group) expect((t.options.y as number) + (t.options.h as number), t.text.slice(0, 20)).toBeLessThanOrEqual(stripTop + 1e-6)
  })

  it('the heading under a kicker never takes more than the room the kicker leaves', () => {
    const card = cardOf([{ type: 'heading', text: longTitle, kicker: long }, { type: 'paragraph', text: 'x' }])
    const slide = renderOn(card)
    const kicker = slide.texts.find((t) => t.text.includes('SMALL HEADING'))!
    const heading = slide.texts.find((t) => t.text.startsWith('An extremely'))!
    expect((kicker.options.y as number) + (kicker.options.h as number)).toBeLessThanOrEqual(heading.options.y as number)
    expect((kicker.options.h as number) + (heading.options.h as number)).toBeLessThanOrEqual(1.5 + 1e-9)
  })
})

describe('later headings, stored colours, tint ground, shapes', () => {
  it('a later heading in a merged body carries its kicker as a line above it', () => {
    const slide = renderOn(
      cardOf([HEADING, { type: 'paragraph', text: 'Intro' }, { type: 'heading', text: 'Second part', kicker: 'Side note' }, { type: 'paragraph', text: 'More' }], { layout: 'standard' }),
    )
    const body = allText(slide)
    expect(body).toContain('SIDE NOTE')
    expect(body.indexOf('SIDE NOTE')).toBeLessThan(body.indexOf('Second part'))
  })

  it('on a deep slide every stored colour pick on the new refs is dropped', () => {
    const title = cardOf(
      [
        { type: 'heading', text: 'Welcome', kicker: 'Lesson' },
        { type: 'point', label: 'Term', text: 'Meaning' },
        { type: 'callout', label: 'Key', text: 'Idea' },
        { type: 'code', label: 'file', code: 'x', caption: 'cap' },
      ],
      {
        orderIndex: 0,
        layout: 'hero',
        textStyle: { color: '#123456' },
        inline: {
          '0:kicker': { marks: [{ type: 'color', start: 0, end: 3, value: '#123456' }] },
          '1:label': { style: { color: '#123456' } },
          '1:text': { marks: [{ type: 'color', start: 0, end: 3, value: '#123456' }] },
          '2:label': { style: { color: '#123456' } },
          '2:text': { marks: [{ type: 'color', start: 0, end: 2, value: '#123456' }] },
          '3:label': { marks: [{ type: 'color', start: 0, end: 2, value: '#123456' }] },
          '3:caption': { style: { color: '#123456' } },
        },
      },
    )
    const slide = renderOn(title)
    const colours = slide.texts.flatMap((t) => [t.options.color, ...t.runs.map((r) => r.options.color)]).filter(Boolean)
    expect(colours.length).toBeGreaterThan(0)
    for (const colour of colours) expect(String(colour).toLowerCase()).not.toBe('123456')
  })

  it('a code panel on a tinted slide is the deep ground with light ink', () => {
    const slide = renderOn(cardOf([HEADING, { type: 'quote', text: 'Said' }, { type: 'code', code: 'x = 1' }]))
    const panel = slide.shapes.find((s) => s.shape === 'roundRect')!
    expect(fillOf(panel)).toBe(hex(c.deep))
    expect(textOf(slide, 'x = 1').options.color).toBe(hex(c.deepForeground))
  })

  it('every shape stays on the slide too', () => {
    const card = cardOf([HEADING, { type: 'paragraph', text: 'Prose' }, ...POINTS, { type: 'callout', text: 'Idea' }, { type: 'code', code: 'x = 1' }])
    for (const shape of renderOn(card).shapes) {
      const { x, y, w, h } = shape.options as { x: number; y: number; w: number; h: number }
      expect(x).toBeGreaterThanOrEqual(-1e-9)
      expect(y).toBeGreaterThanOrEqual(-1e-9)
      expect(x + w).toBeLessThanOrEqual(10 + 1e-9)
      expect(y + h).toBeLessThanOrEqual(5.625 + 1e-6)
    }
  })
})

describe('the kicker capitals', () => {
  it('are set at export time', () => {
    expect(textOf(renderOn(cardOf([{ type: 'heading', text: 'T', kicker: 'part two' }])), 'PART TWO')).toBeDefined()
  })

  it('keep the typed words when capitals would change the length, so marks stay on their letters', () => {
    const slide = renderOn(cardOf([{ type: 'heading', text: 'T', kicker: 'straße' }]))
    expect(textOf(slide, 'straße')).toBeDefined()
  })
})

describe('rotation of the structured blocks on a nudged card', () => {
  const blocks: ContentBlock[] = [HEADING, { type: 'callout', label: 'Key', text: 'Idea' }, { type: 'point', label: 'T', text: 'M' }, { type: 'code', code: 'x = 1' }]
  const ADJ = (rotation: number) => ({
    '1': { dx: 0, dy: 0, w: 0.4, h: 0.2, rotation },
    '2': { dx: 0, dy: 0, w: 0.4, h: 0.1, rotation },
    '3': { dx: 0, dy: 0, w: 0.4, h: 0.15, rotation },
  })
  const centre = (o: Record<string, unknown>) => ({ x: (o.x as number) + (o.w as number) / 2, y: (o.y as number) + (o.h as number) / 2 })

  it.each([
    ['callout', 'Idea', 0],
    ['code', 'x = 1', 1],
  ])('turns a %s panel and its text together about the panel centre', (_name, needle, panelIndex) => {
    const flat = renderOn(cardOf(blocks, { adjusts: ADJ(0) }))
    const turned = renderOn(cardOf(blocks, { adjusts: ADJ(30) }))
    const flatPanel = flat.shapes.filter((s) => s.shape === 'roundRect')[panelIndex]
    const turnedPanel = turned.shapes.filter((s) => s.shape === 'roundRect')[panelIndex]
    expect(turnedPanel.options.rotate).toBe(30)
    const about = centre(flatPanel.options)
    expect(centre(turnedPanel.options).x).toBeCloseTo(about.x, 6)
    expect(centre(turnedPanel.options).y).toBeCloseTo(about.y, 6)
    const text = (slide: ReturnType<typeof fakeSlide>) => textOf(slide, needle).options
    expect(text(turned).rotate).toBe(30)
    const dist = (o: Record<string, unknown>) => Math.hypot(centre(o).x - about.x, centre(o).y - about.y)
    expect(dist(text(turned))).toBeCloseTo(dist(text(flat)), 6)
    expect(centre(text(turned)).x).not.toBeCloseTo(centre(text(flat)).x, 3)
  })

  it('turns a term row and its rules', () => {
    const turned = renderOn(cardOf(blocks, { adjusts: ADJ(30) }))
    expect(textOf(turned, 'M').options.rotate).toBe(30)
    for (const rule of turned.shapes.filter((s) => s.shape === 'line')) expect(rule.options.rotate).toBe(30)
  })

  it('leaves an unrotated block with no rotate option', () => {
    const flat = renderOn(cardOf(blocks, { adjusts: ADJ(0) }))
    expect(textOf(flat, 'Idea').options.rotate).toBeUndefined()
  })
})
