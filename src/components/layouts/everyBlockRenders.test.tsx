import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { LayoutRenderer } from './LayoutRenderer'

/**
 * The one component test in this repo, and a deliberate exception to its
 * "pure logic only" rule.
 *
 * The defect it guards against lives only in JSX: a layout that forgets to draw
 * something, or draws it twice. Eleven of the twelve layouts once drew only the
 * block types they understood, so a paragraph on a timeline card was drawn
 * nowhere — while the PPTX export and the narration script both still carried it.
 * No pure function can see that, because the bug is in what a component's markup
 * leaves out or duplicates.
 *
 * So every layout, forced and automatic, in both visual treatments, renders a
 * card holding every block type, and every block's text must appear exactly once.
 * A layout that drops anything or draws it twice fails here by name.
 */

/** What a block puts on screen: its text fields, or an image's URL. */
function visibleText(block: ContentBlock): string[] {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return [block.text]
    case 'bulletList':
      return block.items
    case 'stat':
      return [block.value, block.label]
    case 'image':
      // React 19's server renderer emits a `<link rel="preload" as="image" href>` for every image,
      // so the bare URL appears twice. Check for the src attribute to count drawn images exactly once.
      return [`src="${block.url}"`]
    case 'quote':
      return block.attribution ? [block.text, block.attribution] : [block.text]
    case 'timelineStep':
      return [block.label, block.text]
    case 'comparisonGroup':
      return [block.heading, ...block.items]
  }
}

/** One of every block type, with markers that cannot collide with markup. */
const KITCHEN_SINK: ContentBlock[] = [
  { type: 'heading', text: 'MARKHEADING' },
  { type: 'paragraph', text: 'MARKPARA' },
  { type: 'bulletList', items: ['MARKLISTA', 'MARKLISTB'] },
  { type: 'stat', value: 'MARKSTATVALA', label: 'MARKSTATLABA' },
  { type: 'stat', value: 'MARKSTATVALB', label: 'MARKSTATLABB' },
  { type: 'quote', text: 'MARKQUOTE', attribution: 'MARKATTRIB' },
  { type: 'timelineStep', label: 'MARKSTEPLABA', text: 'MARKSTEPTEXTA' },
  { type: 'timelineStep', label: 'MARKSTEPLABB', text: 'MARKSTEPTEXTB' },
  { type: 'comparisonGroup', heading: 'MARKCMPHA', items: ['MARKCMPIA'] },
  { type: 'comparisonGroup', heading: 'MARKCMPHB', items: ['MARKCMPIB'] },
  { type: 'image', url: 'https://example.test/MARKIMGA.png', alt: 'a' },
  { type: 'image', url: 'https://example.test/MARKIMGB.png', alt: 'b' },
]

/**
 * Cards shaped like what the model actually produces for each family, each
 * with one block the family does not own. `'auto'` lets the classifier route
 * them, which is the path nearly every real card takes.
 */
const REALISTIC: { name: string; blocks: ContentBlock[] }[] = [
  {
    name: 'a stat grid with a paragraph',
    blocks: [
      { type: 'heading', text: 'MARKH1' },
      { type: 'stat', value: 'MARKV1', label: 'MARKL1' },
      { type: 'stat', value: 'MARKV2', label: 'MARKL2' },
      { type: 'paragraph', text: 'MARKP1' },
    ],
  },
  {
    name: 'a timeline with a paragraph between steps',
    blocks: [
      { type: 'heading', text: 'MARKH2' },
      { type: 'timelineStep', label: 'MARKS1', text: 'MARKT1' },
      { type: 'paragraph', text: 'MARKP2' },
      { type: 'timelineStep', label: 'MARKS2', text: 'MARKT2' },
      { type: 'timelineStep', label: 'MARKS3', text: 'MARKT3' },
    ],
  },
  {
    name: 'a comparison with a stat',
    blocks: [
      { type: 'heading', text: 'MARKH3' },
      { type: 'comparisonGroup', heading: 'MARKC1', items: ['MARKCI1'] },
      { type: 'comparisonGroup', heading: 'MARKC2', items: ['MARKCI2'] },
      { type: 'stat', value: 'MARKV3', label: 'MARKL3' },
    ],
  },
  {
    name: 'a short list with a quote',
    blocks: [
      { type: 'heading', text: 'MARKH4' },
      { type: 'bulletList', items: ['MARKI1', 'MARKI2'] },
      { type: 'quote', text: 'MARKQ1' },
    ],
  },
  {
    name: 'a long list with a second list',
    blocks: [
      { type: 'heading', text: 'MARKH5' },
      {
        type: 'bulletList',
        items: ['MARKLONG1', 'MARKLONG2', 'MARKLONG3', 'MARKLONG4', 'MARKLONG5', 'MARKLONG6', 'MARKLONG7'],
      },
      { type: 'bulletList', items: ['MARKSECOND'] },
    ],
  },
  {
    name: 'a gallery of four images',
    blocks: [
      { type: 'heading', text: 'MARKH6' },
      { type: 'image', url: 'https://example.test/MARKG1.png' },
      { type: 'image', url: 'https://example.test/MARKG2.png' },
      { type: 'image', url: 'https://example.test/MARKG3.png' },
      { type: 'image', url: 'https://example.test/MARKG4.png' },
    ],
  },
]

const LAYOUTS: LayoutType[] = [
  'auto',
  'hero',
  'standard',
  'standardSplit',
  'statHero',
  'statGrid',
  'comparison',
  'timeline',
  'iconGrid',
  'numberedList',
  'quote',
  'textFocus',
  'gallery',
]

const VARIANTS: VisualStyle[] = ['structured', 'expressive']

function card(blocks: ContentBlock[], layout: LayoutType, visualStyle: VisualStyle): Card {
  return { id: 'card', orderIndex: 0, blocks, layout, visualStyle }
}

function expectEveryBlockDrawn(html: string, blocks: ContentBlock[]) {
  for (const block of blocks) {
    for (const text of visibleText(block)) {
      const count = html.split(text).length - 1
      expect(count, `"${text}" (${block.type}) should be drawn exactly once`).toBe(1)
    }
  }
}

describe('every block on a card reaches the screen', () => {
  for (const layout of LAYOUTS) {
    for (const variant of VARIANTS) {
      it(`${layout} (${variant}) draws every block of a kitchen-sink card`, () => {
        const html = renderToStaticMarkup(<LayoutRenderer card={card(KITCHEN_SINK, layout, variant)} />)
        expectEveryBlockDrawn(html, KITCHEN_SINK)
      })
    }
  }

  for (const { name, blocks } of REALISTIC) {
    for (const variant of VARIANTS) {
      it(`${name} (${variant}, automatic layout)`, () => {
        const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
        expectEveryBlockDrawn(html, blocks)
      })
    }
  }
})
