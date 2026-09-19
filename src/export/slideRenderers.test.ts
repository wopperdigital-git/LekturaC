import { describe, expect, it } from 'vitest'
import { RENDERERS, type PptxSlide } from './slideRenderers'
import { slideGroup } from './slideGroup'
import { DEFAULT_THEME } from '@/lib/theme-tokens'
import { CREATABLE_KINDS, layoutForKind, starterBlocks } from '@/engine/cardTemplates'
import { contentBlockSchema, type Card, type ContentBlock } from '@/engine/contentBlocks'
import { estimateMeasurer, textHeight, type FitParagraph, type FitSizing } from './textFit'
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
 * run — `indentLevel: 1` (a nested comparison item) inset 0.6in, a plain
 * `bullet` inset 0.3in, neither un-inset — matching what the renderers
 * actually draw, since only the first run of a line carries either option.
 */
function paragraphsOf(runs: PptxTextRun[]): FitParagraph[] {
  const paragraphs: FitParagraph[] = []
  let current: PptxTextRun[] = []

  const flush = () => {
    if (current.length === 0) return
    const text = current.map((run) => run.text).join('')
    const first = current[0].options as { bullet?: boolean; indentLevel?: number }
    const indentIn = first.indentLevel === 1 ? 0.6 : first.bullet ? 0.3 : undefined
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
      lineSpacingMultiple?: number
    }
    const paragraphs = paragraphsOf(box.runs)
    const sizing: FitSizing = {
      preferredPt: options.fontSize,
      minPt: options.fontSize,
      face: options.fontFace,
      bold: options.bold,
      lineSpacing: options.lineSpacingMultiple ?? 1.2,
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
