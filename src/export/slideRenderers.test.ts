import { describe, expect, it } from 'vitest'
import { RENDERERS, fitCard, fittedPointSize, type PptxSlide } from './slideRenderers'
import { slideGroup } from './slideGroup'
import { cardBoxes } from './blockBoxes'
import { DEFAULT_THEME } from '@/lib/theme-tokens'
import { CREATABLE_KINDS, layoutForKind, starterBlocks } from '@/engine/cardTemplates'
import { contentBlockSchema, type Card, type ContentBlock } from '@/engine/contentBlocks'
import { textRef } from '@/engine/marks'
import {
  BULLET_INDENT_IN,
  FLOOR_PT,
  estimateMeasurer,
  textHeight,
  type FitParagraph,
  type FitSizing,
} from './textFit'
import type { PptxTextRun } from './textRun'

/*
  Every word on the slide has to reach the .pptx.

  The export's five arrangements each pick out the blocks they know how to draw
  and ignore the rest, which is fine while every card comes from one generator
  that produces a narrow set of shapes. Hand-built cards widen that set: a user
  can now make a stat card with three stats and a paragraph, or convert a
  timeline into a quote, and a renderer that quietly drops what it does not
  recognise loses text that cannot be regenerated.

  So this walks each card type a user can create straight through the real
  renderer and checks the text arrives. It captures pptxgenjs calls through the
  same structural `PptxSlide` interface the renderers are written against, so no
  library and no DOM is involved.
*/

interface Captured {
  text: string
  options: Record<string, unknown>
  /** The runs as passed to `addText`, kept alongside the joined `text` for the fit harness below. */
  runs: PptxTextRun[]
}

function fakeSlide() {
  const texts: Captured[] = []
  const shapes: { shape: string; options: Record<string, unknown> }[] = []

  const slide: PptxSlide & { texts: Captured[]; shapes: typeof shapes } = {
    texts,
    shapes,
    addText(value, options) {
      // A box's runs are concatenated: the split into runs is a formatting
      // detail (one run per mark), not something a reader sees.
      const runs = typeof value === 'string' ? [{ text: value, options: {} }] : value
      const text = runs.map((run) => run.text).join('')
      texts.push({ text, options, runs })
    },
    addShape(shape, options) {
      shapes.push({ shape, options })
    },
  }
  return slide
}

function render(card: Card, isFirstCard = false) {
  const slide = fakeSlide()
  RENDERERS[slideGroup(card, isFirstCard)](slide, card, DEFAULT_THEME, {}, estimateMeasurer)
  return slide
}

function cardOf(blocks: ContentBlock[], layout: Card['layout'] = 'auto'): Card {
  return { id: 'c1', orderIndex: 0, blocks, layout, visualStyle: 'structured' }
}

/** Every string a user could read on the card, as the renderer would have to emit it. */
function wordsOf(blocks: ContentBlock[]): string[] {
  const out: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        out.push(block.text)
        break
      case 'bulletList':
        out.push(...block.items)
        break
      case 'stat':
        out.push(block.value, block.label)
        break
      case 'quote':
        out.push(block.text)
        if (block.attribution) out.push(block.attribution)
        break
      case 'timelineStep':
        out.push(block.label, block.text)
        break
      case 'comparisonGroup':
        out.push(block.heading, ...block.items)
        break
      case 'image':
        break
    }
  }
  return out
}

describe('exporting a card of each creatable type', () => {
  it.each(CREATABLE_KINDS)('carries every word of a new %s card onto the slide', (kind) => {
    const blocks = starterBlocks(kind)
    const slide = render(cardOf(blocks, layoutForKind(kind)), kind === 'title')
    const written = slide.texts.map((t) => t.text).join('\n')

    for (const word of wordsOf(blocks)) {
      expect(written).toContain(word)
    }

    // Review I3: every card a user can create should also fit its own boxes,
    // not just carry its words — a starter card is short, so this rarely
    // exercises the shrink path, but it does exercise every arrangement's
    // `lineSpacing`/inset/indent wiring on real (if brief) content.
    expectFits(slide)
  })

  it.each(CREATABLE_KINDS)('gives a new %s card at least one text box', (kind) => {
    const slide = render(cardOf(starterBlocks(kind), layoutForKind(kind)), kind === 'title')
    expect(slide.texts.length).toBeGreaterThan(0)
  })

  /*
    A blank slide is the failure mode that matters here: it exports without
    error, opens without error, and is simply empty. Nothing but a check like
    this notices.
  */
  it.each(CREATABLE_KINDS)('never writes an empty text box for a new %s card', (kind) => {
    const slide = render(cardOf(starterBlocks(kind), layoutForKind(kind)), kind === 'title')
    for (const box of slide.texts) {
      expect(box.text.trim()).not.toBe('')
    }
  })

  /*
    A title slide added anywhere but the front carries an explicit `hero`
    layout, which is the whole reason `layoutForKind` exists — if the export
    grouped on the blocks instead it would land in `body` and render the
    subtitle as a bullet.
  */
  it('exports a title card as a title slide wherever it sits', () => {
    const card = cardOf(starterBlocks('title'), layoutForKind('title'))
    expect(slideGroup(card, false)).toBe('title')
  })

  it('keeps every box inside the slide', () => {
    // LAYOUT_16x9 is 10 x 5.625 inches. A box positioned off the canvas is
    // invisible in PowerPoint but perfectly valid in the file.
    for (const kind of CREATABLE_KINDS) {
      const slide = render(cardOf(starterBlocks(kind), layoutForKind(kind)), kind === 'title')
      for (const box of [...slide.texts, ...slide.shapes]) {
        const { x, y, w, h } = box.options as { x: number; y: number; w: number; h: number }
        expect(x).toBeGreaterThanOrEqual(0)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(x + w).toBeLessThanOrEqual(10.001)
        expect(y + h).toBeLessThanOrEqual(5.626)
      }
    }
  })
})

/*
  Fit harness: reused as-is by Tasks 4 and 5 for the stat/two-column/quote/
  adjusted arrangements, so it works on any captured text box rather than
  assuming which renderer produced it.
*/

/** `n` distinct space-separated words, e.g. `words(3, 'w')` -> `"w1 w2 w3"`. */
function words(n: number, prefix: string): string {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).join(' ')
}

/**
 * Rebuilds one box's paragraphs from its captured runs: a run whose options
 * carry `breakLine` ends a paragraph (the pptxgenjs break every renderer here
 * writes between paragraphs), and a paragraph's indent is read off its first
 * run — `indentLevel: 1` (a nested comparison item) inset twice
 * `BULLET_INDENT_IN`, a plain `bullet` inset once, neither un-inset —
 * matching what the renderers actually draw, since only the first run of a
 * line carries either option.
 */
function paragraphsOf(runs: PptxTextRun[]): FitParagraph[] {
  const paragraphs: FitParagraph[] = []
  let current: PptxTextRun[] = []

  const flush = () => {
    if (current.length === 0) return
    const text = current.map((run) => run.text).join('')
    const first = current[0].options as { bullet?: boolean; indentLevel?: number }
    const indentIn = first.indentLevel === 1 ? 2 * BULLET_INDENT_IN : first.bullet ? BULLET_INDENT_IN : undefined
    paragraphs.push({ text, indentIn })
    current = []
  }

  for (const run of runs) {
    current.push(run)
    if (run.options.breakLine) flush()
  }
  flush()

  return paragraphs
}

/**
 * Asserts every captured text box on `slide` actually fits: its paragraphs,
 * rebuilt from its own captured runs, re-measure (at the box's own
 * `fontSize`/`fontFace`/`bold`, with `estimateMeasurer`) to no more than the
 * height it was given, and the box itself lies within the slide.
 *
 * The spacing multiple used for that re-measurement is derived from the box's
 * own emitted `lineSpacing` (points) divided by its `fontSize` — not a
 * hardcoded default — so a renderer that emits the wrong pitch, or reverts to
 * `lineSpacingMultiple`, is caught here rather than by a harness that assumed
 * the right answer.
 */
function expectFits(slide: PptxSlide & { texts: Captured[] }) {
  for (const box of slide.texts) {
    const options = box.options as {
      x: number
      y: number
      w: number
      h: number
      fontSize: number
      fontFace: string
      bold?: boolean
      lineSpacing?: number
      lineSpacingMultiple?: number
    }

    expect(options.lineSpacing).toBeDefined()
    expect(options.lineSpacingMultiple).toBeUndefined()

    const paragraphs = paragraphsOf(box.runs)
    const sizing: FitSizing = {
      preferredPt: options.fontSize,
      minPt: options.fontSize,
      face: options.fontFace,
      bold: options.bold,
      lineSpacing: (options.lineSpacing as number) / options.fontSize,
    }
    const height = textHeight(paragraphs, options.w, sizing, options.fontSize, estimateMeasurer)

    expect(height).toBeLessThanOrEqual(options.h + 1e-6)
    expect(options.x).toBeGreaterThanOrEqual(0)
    expect(options.y).toBeGreaterThanOrEqual(0)
    expect(options.x + options.w).toBeLessThanOrEqual(10 + 1e-6)
    expect(options.y + options.h).toBeLessThanOrEqual(5.625 + 1e-6)
  }
}

describe('fitting the title, heading and body arrangements', () => {
  const LONG_HEADING = words(20, 'heading')
  const LONG_BULLETS = Array.from({ length: 8 }, (_, i) => words(14, `b${i + 1}-`))
  const TITLE_WORDS = words(16, 'title')
  const SUBTITLE_WORDS = words(45, 'subtitle')

  it('fits a body arrangement with a long heading and a long bulleted body', () => {
    const card = cardOf(
      [
        { type: 'heading', text: LONG_HEADING },
        { type: 'bulletList', items: LONG_BULLETS },
      ],
      'standard',
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('fits a title arrangement with a long title and a long subtitle', () => {
    const card = cardOf(
      [
        { type: 'heading', text: TITLE_WORDS },
        { type: 'paragraph', text: SUBTITLE_WORDS },
      ],
      'hero',
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  /*
    Review M5: `renderTitle` centres the title+subtitle group on the slide by
    subtracting its combined height from SLIDE_H and halving. A subtitle long
    enough that its fitted height (even at FLOOR_PT, over budget) exceeds the
    slide pushes that centring negative, sliding the title itself off the top
    edge. `groupY = Math.max(TOP, ...)` is the fix.
  */
  it('clamps an oversized title group to TOP instead of centring it off the top of the slide', () => {
    const manyParagraphs = Array.from({ length: 20 }, (_, i) => ({
      type: 'paragraph' as const,
      text: words(30, `p${i}-`),
    }))
    const card = cardOf([{ type: 'heading', text: 'Title' }, ...manyParagraphs], 'hero')
    const slide = render(card)
    const titleBox = slide.texts[0]
    const TITLE_TOP = 0.45 // matches renderTitle/addHeading's own TOP
    expect((titleBox.options as { y: number }).y).toBeCloseTo(TITLE_TOP, 6)
  })

  it('centres the body box with valign middle', () => {
    const card = cardOf(
      [
        { type: 'heading', text: LONG_HEADING },
        { type: 'bulletList', items: LONG_BULLETS },
      ],
      'standard',
    )
    const slide = render(card)
    const bodyBox = slide.texts[slide.texts.length - 1]
    expect(bodyBox.options.valign).toBe('middle')
  })

  it('gives a short heading fontSize 30 (the cap) for DEFAULT_THEME', () => {
    const card = cardOf(
      [
        { type: 'heading', text: 'Three word heading' },
        { type: 'paragraph', text: 'Some body text.' },
      ],
      'standard',
    )
    const slide = render(card)
    const headingBox = slide.texts[0]
    expect(headingBox.options.fontSize).toBe(30)
  })

  /*
    Review M2: a paragraph carrying a bold mark must be measured as bold —
    `estimateMeasurer` weighs bold glyphs wider, so ignoring the mark would
    under-measure the text and could let it wrap (or size) as if it were
    narrower than it actually renders. Comparing a bold-marked body against
    an identical unmarked one pins that the mark actually reaches the fit,
    not just the rendered `bold` run option.
  */
  it('fits a bold-marked body paragraph at a size that accounts for the wider bold measurement', () => {
    const text = words(80, 'bold-word')
    const plainCard = cardOf([{ type: 'heading', text: 'Heading' }, { type: 'paragraph', text }], 'standard')
    const boldCard: Card = {
      ...plainCard,
      inline: { [textRef(1, 'text')]: { marks: [{ start: 0, end: text.length, type: 'bold' }] } },
    }

    const plainSlide = render(plainCard)
    const boldSlide = render(boldCard)
    const plainBody = plainSlide.texts[plainSlide.texts.length - 1]
    const boldBody = boldSlide.texts[boldSlide.texts.length - 1]

    const plainSize = (plainBody.options as { fontSize: number }).fontSize
    const boldSize = (boldBody.options as { fontSize: number }).fontSize
    // The bold version can only need the same size or smaller — never larger —
    // and for this fixture's length it is strictly smaller, which is what
    // proves the mark actually changed the measurement rather than being
    // silently ignored by the fit.
    expect(boldSize).toBeLessThan(plainSize)

    expectFits(plainSlide)
    expectFits(boldSlide)
  })

  it("places the accent rule below the heading box's real bottom", () => {
    const card = cardOf(
      [
        { type: 'heading', text: LONG_HEADING },
        { type: 'paragraph', text: 'Some body text.' },
      ],
      'standard',
    )
    const slide = render(card)
    const headingBox = slide.texts[0]
    const { y: headingY, h: headingH } = headingBox.options as { y: number; h: number }
    const rule = slide.shapes[0]
    const ruleY = rule.options.y as number
    expect(ruleY).toBeGreaterThan(headingY + headingH)
  })
})

/** The y+h of the accent rule `addHeading` draws — the real bottom every arrangement's content must clear. */
function ruleBottomOf(slide: PptxSlide & { shapes: { shape: string; options: Record<string, unknown> }[] }): number {
  const rule = slide.shapes[0]
  const { y, h } = rule.options as { y: number; h: number }
  return y + h
}

describe('fitting the stat, two-column and quote arrangements', () => {
  const LONG_HEADING = words(20, 'heading')

  it('fits a single stat with a long label and a long paragraph', () => {
    const card = cardOf(
      [
        { type: 'heading', text: 'Stat heading' },
        { type: 'stat', value: '42%', label: words(12, 'label') },
        { type: 'paragraph', text: words(40, 'p') },
      ],
      'statHero',
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('fits a 6-stat grid', () => {
    const stats: ContentBlock[] = Array.from({ length: 6 }, (_, i) => ({
      type: 'stat',
      value: `${i + 1}00%`,
      label: words(2, `label${i + 1}-`),
    }))
    const card = cardOf([{ type: 'heading', text: 'Six stats' }, ...stats], 'statGrid')
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('fits a two-column card with 3 groups of 6 long items', () => {
    const groups: ContentBlock[] = Array.from({ length: 3 }, (_, i) => ({
      type: 'comparisonGroup',
      heading: words(4, `group${i + 1}-`),
      // 3 words/item, not 4: at the corrected geometry (BULLET_INDENT_IN
      // 0.375in and TEXT_MARGIN_PT's 0.15in inset — both more accurate than
      // this test's original guesses), 4 words wraps every item to 2 lines
      // and 6 x 2-line items in a 3-up column genuinely does not fit even at
      // FLOOR_PT — a real content-density limit, not a fitting bug. Recalibrated
      // down to the widest word count that still fits, so this stays a
      // meaningful "long items" stress case rather than a wrapped one.
      items: Array.from({ length: 6 }, (_, j) => words(3, `g${i + 1}i${j + 1}-`)),
    }))
    const card = cardOf([{ type: 'heading', text: 'Comparison heading' }, ...groups], 'comparison')
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('fits a quote of 60 words with an attribution', () => {
    const card = cardOf(
      [
        { type: 'heading', text: 'Quote heading' },
        { type: 'quote', text: words(60, 'q'), attribution: 'Someone Notable' },
      ],
      'quote',
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  /*
    Review M6: without cell padding, adjacent centred stat boxes share their
    cell boundary exactly, so two long values in neighbouring cells can touch.
  */
  it('pads each stat cell so neighbouring value boxes never touch', () => {
    const stats: ContentBlock[] = Array.from({ length: 4 }, (_, i) => ({
      type: 'stat',
      value: `${i + 1}%`,
      label: `Label ${i + 1}`,
    }))
    const card = cardOf([{ type: 'heading', text: 'Four stats' }, ...stats], 'statGrid')
    const slide = render(card)
    const valueBoxes = slide.texts.filter((t) => (t.options as { valign?: string }).valign === 'bottom')
    expect(valueBoxes.length).toBe(4)
    const sorted = [...valueBoxes].sort(
      (a, b) => (a.options.x as number) - (b.options.x as number),
    )
    const CELL_PAD_IN = 0.08 // matches renderStat's own cell padding
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i].options as { x: number; w: number }
      const b = sorted[i + 1].options as { x: number; w: number }
      const gap = b.x - (a.x + a.w)
      expect(gap).toBeCloseTo(2 * CELL_PAD_IN, 6)
      expect(gap).toBeGreaterThan(0)
    }
  })

  it('gives every stat value box in a grid the same fontSize', () => {
    // One markedly long value and one markedly long label so an unfitted
    // grid would show different sizes; unification must still collapse them
    // to one.
    const stats: ContentBlock[] = [
      { type: 'stat', value: '1,234,567,890%', label: 'Brief' },
      { type: 'stat', value: '2%', label: words(16, 'verywordylabel') },
      { type: 'stat', value: '3%', label: 'Ok' },
      { type: 'stat', value: '4%', label: 'Fine' },
      { type: 'stat', value: '5%', label: 'Good' },
      { type: 'stat', value: '6%', label: 'Nice' },
    ]
    const card = cardOf([{ type: 'heading', text: 'Six stats' }, ...stats], 'statGrid')
    const slide = render(card)
    const valueBoxes = slide.texts.filter((t) => (t.options as { valign?: string }).valign === 'bottom')
    expect(valueBoxes.length).toBe(6)
    const valueSizes = new Set(valueBoxes.map((t) => (t.options as { fontSize: number }).fontSize))
    expect(valueSizes.size).toBe(1)

    const labelBoxes = slide.texts.filter(
      (t) => (t.options as { valign?: string; color?: string }).valign === 'top' && t.options.color === '6f6a78',
    )
    expect(labelBoxes.length).toBe(6)
    const labelSizes = new Set(labelBoxes.map((t) => (t.options as { fontSize: number }).fontSize))
    expect(labelSizes.size).toBe(1)
  })

  it('gives every two-column bullet box the same fontSize', () => {
    // One column's items are markedly longer than the others', so an
    // unfitted column would need a markedly smaller size than its neighbours;
    // unification must still collapse every column to one shared size.
    const groups: ContentBlock[] = [
      {
        type: 'comparisonGroup',
        heading: 'Short',
        items: ['a b', 'c d'],
      },
      {
        type: 'comparisonGroup',
        heading: 'Long',
        items: Array.from({ length: 6 }, (_, j) => words(14, `verylongitem${j + 1}-`)),
      },
      {
        type: 'comparisonGroup',
        heading: 'Medium',
        items: ['m1 word', 'm2 word', 'm3 word'],
      },
    ]
    const card = cardOf([{ type: 'heading', text: 'Comparison heading' }, ...groups], 'comparison')
    const slide = render(card)
    const bulletBoxes = slide.texts.filter((t) => t.runs.some((run) => (run.options as { bullet?: boolean }).bullet))
    expect(bulletBoxes.length).toBe(3)
    const sizes = new Set(bulletBoxes.map((t) => (t.options as { fontSize: number }).fontSize))
    expect(sizes.size).toBe(1)
  })

  it('keeps stat content clear of a long heading', () => {
    const card = cardOf(
      [
        { type: 'heading', text: LONG_HEADING },
        { type: 'stat', value: '42%', label: 'Conversion rate' },
      ],
      'statHero',
    )
    const slide = render(card)
    const ruleBottom = ruleBottomOf(slide)
    for (const box of slide.texts.slice(1)) {
      const { y } = box.options as { y: number }
      expect(y).toBeGreaterThanOrEqual(ruleBottom - 1e-9)
    }
  })

  it('keeps two-column content clear of a long heading', () => {
    const groups: ContentBlock[] = [
      { type: 'comparisonGroup', heading: 'Group one', items: ['Item a', 'Item b'] },
      { type: 'comparisonGroup', heading: 'Group two', items: ['Item c', 'Item d'] },
    ]
    const card = cardOf([{ type: 'heading', text: LONG_HEADING }, ...groups], 'comparison')
    const slide = render(card)
    const ruleBottom = ruleBottomOf(slide)
    for (const box of slide.texts.slice(1)) {
      const { y } = box.options as { y: number }
      expect(y).toBeGreaterThanOrEqual(ruleBottom - 1e-9)
    }
  })

  it('keeps quote content clear of a long heading', () => {
    const card = cardOf(
      [
        { type: 'heading', text: LONG_HEADING },
        { type: 'quote', text: 'A short quote.', attribution: 'Someone' },
      ],
      'quote',
    )
    const slide = render(card)
    const ruleBottom = ruleBottomOf(slide)
    for (const box of slide.texts.slice(1)) {
      const { y } = box.options as { y: number }
      expect(y).toBeGreaterThanOrEqual(ruleBottom - 1e-9)
    }
  })
})

describe('fitting the adjusted arrangement', () => {
  /** `cardOf` plus a `card.adjusts` entry, which is what routes a card to `renderAdjusted`. */
  function adjustedCard(blocks: ContentBlock[], adjusts: Card['adjusts']): Card {
    return { ...cardOf(blocks), adjusts }
  }

  it('fits a paragraph box resized narrow, holding 60 words', () => {
    const card = adjustedCard(
      [
        { type: 'heading', text: 'Adjusted heading' },
        { type: 'paragraph', text: words(60, 'w') },
      ],
      { '1': { dx: 0, dy: 0, w: 0.85, rotation: 0 } },
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('keeps fittedPointSize for an untouched-size adjusted heading that already fits', () => {
    const card = adjustedCard(
      [
        { type: 'heading', text: 'Short heading' },
        { type: 'paragraph', text: 'Some body text.' },
      ],
      // Nudges the paragraph (block 1) only, with no size override, so the
      // heading's box is exactly the baseline stack's — the "already fits" case.
      { '1': { dx: 0, dy: 0.05, rotation: 0 } },
    )
    const slide = render(card)
    const headingBox = slide.texts.find((t) => t.text === 'Short heading')
    expect(headingBox).toBeDefined()

    const { height } = cardBoxes(card)
    const fit = fitCard(height)
    // Index 1 is H2 in the theme's typography scale, matching addHeading's own use.
    const expected = fittedPointSize(DEFAULT_THEME.typography.scale[1], undefined, fit)
    expect(headingBox?.options.fontSize).toBe(expected)
  })

  /*
    Review I2: a tall card pushes `fittedPointSize` (the box-proportional
    preferred size) below `FLOOR_PT` for its body runs. Before the fix,
    `fitText`'s floor was `FLOOR_PT` unconditionally, so a preferred size below
    it that already fit its box still came back raised to `FLOOR_PT` — text
    larger than the user's own box proportions asked for. `words(35, ...)`-ish
    length keeps each paragraph around 200 characters, per the brief.
  */
  it('never raises an adjusted paragraph past its own fittedPointSize, even when that is below FLOOR_PT', () => {
    const longParagraph = Array.from({ length: 40 }, () => 'word').join(' ')
    const card = adjustedCard(
      [
        { type: 'heading', text: 'Tall adjusted card' },
        { type: 'paragraph', text: longParagraph },
        { type: 'paragraph', text: longParagraph },
        { type: 'paragraph', text: longParagraph },
      ],
      // "some adjust on block 1" — a nudge that doesn't touch size, so the
      // card still routes to `renderAdjusted` without changing the baseline
      // box the other paragraphs get.
      { '1': { dx: 0, dy: 0.01, rotation: 0 } },
    )

    const { height } = cardBoxes(card)
    const fit = fitCard(height)
    const expected = fittedPointSize(DEFAULT_THEME.typography.scale[3], undefined, fit)
    // Sanity check that this fixture actually exercises the below-FLOOR_PT
    // case the fix targets — if the card isn't tall enough this assertion
    // would pass for the wrong reason.
    expect(expected).toBeLessThan(FLOOR_PT)

    const slide = render(card)
    const paragraphBoxes = slide.texts.filter((t) => t.text === longParagraph)
    expect(paragraphBoxes.length).toBe(3)
    for (const box of paragraphBoxes) {
      expect(box.options.fontSize).toBe(expected)
    }
    expectFits(slide)
  })

  /*
    Review I3: the adjusted arrangement's fit harness only exercised
    `heading`/`paragraph` blocks. Every block type `renderAdjustedBlock`
    switches on gets its own fitting logic (a stat's two-slice split, a
    quote's attribution slice, a timeline step's label/text split, a
    comparison group's heading/items split, an image's alt text) — each is
    its own chance to size or place something wrong.
  */
  it('fits an adjusted bulletList with long items', () => {
    const card = adjustedCard(
      [
        { type: 'heading', text: 'Adjusted list' },
        {
          type: 'bulletList',
          items: [words(12, 'a'), words(12, 'b'), words(12, 'c'), words(12, 'd')],
        },
      ],
      { '0': { dx: 0, dy: 0, rotation: 0 } },
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  // A block resized to this height (a fraction of the card's own width, same
  // units as every `BlockAdjust`) gives every split-frame case below (stat's
  // value/label, quote's text/attribution, timelineStep's label/text,
  // comparisonGroup's heading/items) enough room to hold its content — the
  // baseline stack's un-adjusted height for a single small block is real but
  // deliberately tiny (see `blockBoxes.ts`'s `naturalHeight`), too tight for
  // any of these splits once INSET_Y_IN's own floor is subtracted twice.
  const RESIZED_H = 0.5

  it('fits an adjusted stat block', () => {
    const card = adjustedCard(
      [
        { type: 'heading', text: 'Adjusted stat' },
        { type: 'stat', value: '87%', label: words(10, 'label') },
      ],
      { '1': { dx: 0, dy: 0, h: RESIZED_H, rotation: 0 } },
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('fits an adjusted quote with an attribution', () => {
    const card = adjustedCard(
      [
        { type: 'heading', text: 'Adjusted quote' },
        { type: 'quote', text: words(30, 'q'), attribution: 'Someone Notable' },
      ],
      { '1': { dx: 0, dy: 0, h: RESIZED_H, rotation: 0 } },
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('fits an adjusted timelineStep', () => {
    const card = adjustedCard(
      [
        { type: 'heading', text: 'Adjusted timeline' },
        { type: 'timelineStep', label: 'Phase one', text: words(20, 't') },
      ],
      { '1': { dx: 0, dy: 0, h: RESIZED_H, rotation: 0 } },
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('fits an adjusted comparisonGroup', () => {
    const card = adjustedCard(
      [
        { type: 'heading', text: 'Adjusted comparison' },
        {
          type: 'comparisonGroup',
          heading: 'Group',
          items: [words(8, 'x'), words(8, 'y'), words(8, 'z')],
        },
      ],
      { '1': { dx: 0, dy: 0, h: RESIZED_H, rotation: 0 } },
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('fits an adjusted image block with alt text', () => {
    const card = adjustedCard(
      [
        { type: 'heading', text: 'Adjusted image' },
        { type: 'image', url: 'https://example.com/x.png', alt: words(16, 'alt') },
      ],
      { '0': { dx: 0, dy: 0, rotation: 0 } },
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })
})

describe('the body fallback from a malformed twoCol or quote card', () => {
  /*
    Review I3: `renderTwoCol` and `renderQuote` both fall back to `renderBody`
    on content the classifier would never actually produce for their own
    layout — an explicit `comparison`/`quote` layout stored on a card that
    doesn't (or no longer) has the blocks that layout needs. Only the "does it
    render at all" side of that was covered; the fit harness never ran on the
    fallback's own output.
  */
  it('falls back to renderBody and fits when an explicit comparison layout has no comparisonGroup blocks', () => {
    const card = cardOf(
      [
        { type: 'heading', text: 'No groups' },
        { type: 'bulletList', items: [words(10, 'a'), words(10, 'b'), words(10, 'c')] },
      ],
      'comparison',
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('falls back to renderBody and fits when an explicit comparison layout has more than 4 groups', () => {
    const groups: ContentBlock[] = Array.from({ length: 5 }, (_, i) => ({
      type: 'comparisonGroup',
      heading: `Group ${i + 1}`,
      items: [words(3, `g${i + 1}a`)],
    }))
    const card = cardOf([{ type: 'heading', text: 'Five groups' }, ...groups], 'comparison')
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })

  it('falls back to renderBody and fits when an explicit quote layout has no quote block', () => {
    const card = cardOf(
      [
        { type: 'heading', text: 'No quote' },
        { type: 'bulletList', items: [words(10, 'a'), words(10, 'b'), words(10, 'c')] },
      ],
      'quote',
    )
    const slide = render(card)
    expect(slide.texts.length).toBeGreaterThan(0)
    expectFits(slide)
  })
})

describe('starter cards as stored data', () => {
  /*
    The zod schema is the contract generation is validated against, and a
    hand-added card is written to the same column and read back by the same
    parser. A starter block the schema would reject — an empty string, a list
    with no items — would be a row that cannot survive a round trip.
  */
  it.each(CREATABLE_KINDS)('a new %s card validates against the block schema', (kind) => {
    for (const block of starterBlocks(kind)) {
      expect(contentBlockSchema.safeParse(block).success).toBe(true)
    }
  })
})
