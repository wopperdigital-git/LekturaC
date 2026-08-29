import { describe, expect, it } from 'vitest'
import { RENDERERS, type PptxSlide } from './slideRenderers'
import { slideGroup } from './slideGroup'
import { DEFAULT_THEME } from '@/lib/theme-tokens'
import { CREATABLE_KINDS, layoutForKind, starterBlocks } from '@/engine/cardTemplates'
import { contentBlockSchema, type Card, type ContentBlock } from '@/engine/contentBlocks'

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
      const text = typeof value === 'string' ? value : value.map((run) => run.text).join('')
      texts.push({ text, options })
    },
    addShape(shape, options) {
      shapes.push({ shape, options })
    },
  }
  return slide
}

function render(card: Card, isFirstCard = false) {
  const slide = fakeSlide()
  RENDERERS[slideGroup(card, isFirstCard)](slide, card, DEFAULT_THEME, {})
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
