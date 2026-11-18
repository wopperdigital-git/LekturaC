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
    case 'point':
      return [block.label, block.text]
    case 'callout':
      return block.label ? [block.label, block.text] : [block.text]
    case 'code':
      return [block.code, ...(block.label ? [block.label] : []), ...(block.caption ? [block.caption] : [])]
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
  // Headings added by hand (Add content) arrive after everything else and carry a
  // size; every layout still has to draw each of them, once.
  { type: 'heading', text: 'MARKSIZEH1', size: 'h1' },
  { type: 'heading', text: 'MARKSIZEH3', size: 'h3' },
  // The structured blocks (drawn by stand-ins for now; Task 5 replaces the drawings).
  { type: 'point', label: 'MARKPOINTLAB', text: 'MARKPOINTTEXT' },
  { type: 'callout', label: 'MARKCALLLAB', text: 'MARKCALLTEXT' },
  { type: 'code', code: 'MARKSRC', label: 'MARKCODELAB', caption: 'MARKCODECAP' },
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
  'checklist',
  'splitList',
  'statList',
  'timelineRow',
  'comparisonTable',
  'quote',
  'textFocus',
  'gallery',
  'imageFocus',
  'section',
  'statement',
  'twoColumn',
  'statSplit',
  'steps',
  'photoList',
  'beforeAfter',
]

const VARIANTS: VisualStyle[] = ['structured', 'expressive']

function card(
  blocks: ContentBlock[],
  layout: LayoutType,
  visualStyle: VisualStyle,
  orderIndex = 0,
): Card {
  return { id: 'card', orderIndex, blocks, layout, visualStyle }
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

/*
  The same kitchen sink without its photos: a card holding photos is always a stack, so
  this is the one that can resolve to a composed slide (side head or split body). Every block
  is still drawn exactly once whichever composition the card lands in.
*/
const IMAGE_FREE_SINK: ContentBlock[] = KITCHEN_SINK.filter(
  // A heading in the body keeps a slide a stack (the sized headings are drawn, in a stack, by
  // the kitchen sink above), so they are left out here to let the card be zoned.
  (block) => block.type !== 'image' && !(block.type === 'heading' && block.size),
).map((block) =>
  // Short enough for a side head, so the zoned path is really exercised.
  block.type === 'heading' && block.text === 'MARKHEADING' ? { ...block, text: 'MARKHEAD' } : block,
)

describe('an image-free card draws every block once, composed or not', () => {
  for (const layout of LAYOUTS) {
    for (const variant of VARIANTS) {
      it(`${layout} (${variant}) draws every block of an image-free kitchen-sink card`, () => {
        const html = renderToStaticMarkup(<LayoutRenderer card={card(IMAGE_FREE_SINK, layout, variant)} />)
        expectEveryBlockDrawn(html, IMAGE_FREE_SINK)
      })
    }
  }

  it('at least one of those runs is a side head, so the zoned path is exercised', () => {
    const drawnAs = new Set<string>()
    for (const layout of LAYOUTS) {
      for (const variant of VARIANTS) {
        const html = renderToStaticMarkup(<LayoutRenderer card={card(IMAGE_FREE_SINK, layout, variant)} />)
        const kind = html.match(/data-composition="(\w+)"/)?.[1]
        if (kind) drawnAs.add(kind)
      }
    }
    expect(drawnAs.has('sideHead')).toBe(true)
  })
})

/*
  A card with exactly ONE photo: the photo is part of the arrangement (a background, half a
  split, beside a figure, a band over a list, an image slide), and every layout must still
  draw each other block once, draw the photo once, and show the photographer's credit once.
*/
const PHOTO_URL = 'https://example.test/MARKPHOTO.png'
const PHOTO: ContentBlock = {
  type: 'image',
  url: PHOTO_URL,
  alt: 'a photo',
  credit: { name: 'MARKPHOTOGRAPHER', url: 'https://www.pexels.com/@markphotographer', source: 'pexels' },
}
const ONE_PHOTO_SINK: ContentBlock[] = [...KITCHEN_SINK.filter((block) => block.type !== 'image'), PHOTO]

function creditCount(html: string): number {
  return html.split('data-photo-credit').length - 1
}

describe('a card with one photo', () => {
  for (const layout of LAYOUTS) {
    for (const variant of VARIANTS) {
      it(`${layout} (${variant}) draws every block, the photo and its credit once`, () => {
        const html = renderToStaticMarkup(<LayoutRenderer card={card(ONE_PHOTO_SINK, layout, variant)} />)
        expectEveryBlockDrawn(html, ONE_PHOTO_SINK)
        expect(creditCount(html), 'the credit should be drawn exactly once').toBe(1)
        expect(html.split('MARKPHOTOGRAPHER').length - 1, 'the photographer is named once').toBe(1)
      })
    }
  }

  // The shapes a model actually produces with a photo, routed by the classifier.
  const REALISTIC_PHOTO: { name: string; blocks: ContentBlock[] }[] = [
    {
      name: 'a title with a photo',
      blocks: [{ type: 'heading', text: 'MARKHEAD' }, { type: 'paragraph', text: 'MARKSUB' }, PHOTO],
    },
    {
      name: 'a text slide with a photo',
      blocks: [
        { type: 'heading', text: 'MARKHEAD' },
        { type: 'paragraph', text: 'MARKBODY' },
        { type: 'paragraph', text: 'MARKSECONDPARA' },
        PHOTO,
      ],
    },
    {
      name: 'a stat with a photo',
      blocks: [{ type: 'heading', text: 'MARKHEAD' }, { type: 'stat', value: 'MARKV', label: 'MARKL' }, PHOTO],
    },
    {
      name: 'a list with a photo',
      blocks: [{ type: 'heading', text: 'MARKHEAD' }, { type: 'bulletList', items: ['MARKI1', 'MARKI2'] }, PHOTO],
    },
    {
      name: 'a timeline with a photo',
      blocks: [
        { type: 'heading', text: 'MARKHEAD' },
        { type: 'timelineStep', label: 'MARKS1', text: 'MARKT1' },
        { type: 'timelineStep', label: 'MARKS2', text: 'MARKT2' },
        PHOTO,
      ],
    },
    {
      name: 'an image slide',
      blocks: [{ type: 'heading', text: 'MARKHEAD' }, PHOTO, { type: 'paragraph', text: 'MARKCAPTION' }],
    },
    { name: 'a heading and a photo only', blocks: [{ type: 'heading', text: 'MARKHEAD' }, PHOTO] },
  ]
  for (const { name, blocks } of REALISTIC_PHOTO) {
    for (const variant of VARIANTS) {
      for (const position of [0, 1]) {
        it(`${name} (${variant}, slide ${position + 1}, automatic layout)`, () => {
          const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant, position)} />)
          expectEveryBlockDrawn(html, blocks)
          expect(creditCount(html)).toBe(1)
        })
      }
    }
  }

  it('the credit is plain text: no link, nothing focusable', () => {
    const html = renderToStaticMarkup(<LayoutRenderer card={card(ONE_PHOTO_SINK, 'hero', 'structured')} />)
    expect(creditCount(html)).toBe(1)
    expect(html).not.toMatch(/<a[ >]/)
  })

  it('a credit from a pasted link has no credit line', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'MARKHEAD' },
      { type: 'paragraph', text: 'MARKBODY' },
      { type: 'image', url: PHOTO_URL, credit: { name: 'x', url: 'https://example.test', source: 'url' } },
    ]
    const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', 'structured')} />)
    expect(creditCount(html)).toBe(0)
  })

  it('every photo in a gallery carries its own credit', () => {
    const shot = (n: number): ContentBlock => ({
      type: 'image',
      url: `https://example.test/MARKGAL${n}.png`,
      credit: { name: `Gal${n}`, url: 'https://www.pexels.com/@x', source: 'pexels' },
    })
    const blocks: ContentBlock[] = [{ type: 'heading', text: 'MARKHEAD' }, shot(1), shot(2), shot(3), shot(4)]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expect(creditCount(html)).toBe(4)
    }
  })

  it('a photo with no credit at all draws without one', () => {
    const blocks: ContentBlock[] = [{ type: 'heading', text: 'MARKHEAD' }, { type: 'image', url: PHOTO_URL }]
    const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', 'structured')} />)
    expect(creditCount(html)).toBe(0)
    expect(html).toContain(`src="${PHOTO_URL}"`)
  })

  describe('where the photo goes', () => {
    const title: ContentBlock[] = [{ type: 'heading', text: 'MARKHEAD' }, { type: 'paragraph', text: 'MARKSUB' }, PHOTO]

    it('a title slide puts it behind the text, under a dark scrim, with white text', () => {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(title, 'hero', 'structured')} />)
      expect(html).toContain('data-on-photo')
      expect(html).toContain('from-black/75')
    })

    it('a quote slide does the same, under an even scrim (its text is mid-slide, not in the dark band)', () => {
      const blocks: ContentBlock[] = [{ type: 'quote', text: 'MARKQ' }, PHOTO]
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'quote', 'expressive')} />)
      expect(html).toContain('data-on-photo')
      expect(html).toContain('bg-black/60')
      expect(html).not.toContain('from-black/75')
    })

    it('a slide with no photo never puts text on one', () => {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(title.slice(0, 2), 'hero', 'structured')} />)
      expect(html).not.toContain('data-on-photo')
    })

    it('two photos are not a background: the hero draws them as leftovers', () => {
      const two: ContentBlock[] = [...title, { ...PHOTO, url: 'https://example.test/MARKSECOND.png' } as ContentBlock]
      const html = renderToStaticMarkup(<LayoutRenderer card={card(two, 'hero', 'structured')} />)
      expect(html).not.toContain('data-on-photo')
    })

    it('a split alternates sides with the slide position', () => {
      const blocks: ContentBlock[] = [{ type: 'heading', text: 'MARKHEAD' }, { type: 'paragraph', text: 'MARKBODY' }, PHOTO]
      for (const variant of VARIANTS) {
        const first = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant, 0)} />)
        const second = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant, 1)} />)
        expect(first.indexOf('MARKBODY'), 'slide 1: text first, photo on the right').toBeLessThan(first.indexOf(`src="`))
        expect(second.indexOf(`src="`), 'slide 2: photo first, on the left').toBeLessThan(second.indexOf('MARKBODY'))
      }
    })

    it('a list gets the photo as a band between the claim and its content', () => {
      const blocks: ContentBlock[] = [{ type: 'heading', text: 'MARKHEAD' }, { type: 'bulletList', items: ['MARKI1'] }, PHOTO]
      // Named, because an automatic list with one photo is a photo list now, a frame with its own photo place.
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'iconGrid', 'structured')} />)
      // The claim is the frame's head; the band opens the body zone, ahead of the list.
      expect(html.indexOf('MARKHEAD')).toBeLessThan(html.indexOf(`src="`))
      expect(html.indexOf(`src="`)).toBeLessThan(html.indexOf('MARKI1'))
      expect(html).toContain('aspect-[6/1]')
    })
  })
})

describe('a blank card', () => {
  // Removing a card's last element leaves it with no blocks. Cards size to their
  // content, so it needs a floor of height or it collapses to its padding.
  it.each(LAYOUTS)('draws as a slide-sized blank under %s, not a thin strip', (layout) => {
    const html = renderToStaticMarkup(<LayoutRenderer card={card([], layout, 'structured')} />)
    expect(html).toContain('min-h-64')
  })
})

/** Asserts the markers appear in the markup in exactly this order. */
function expectInOrder(html: string, markers: string[]) {
  const positions = markers.map((marker) => html.indexOf(marker))
  markers.forEach((marker, i) => {
    expect(positions[i], `"${marker}" is missing from the rendered card`).toBeGreaterThanOrEqual(0)
  })
  expect(positions, `drawn out of order: expected ${markers.join(' → ')}`).toEqual(
    [...positions].sort((a, b) => a - b),
  )
}

describe("a family card keeps the author's order", () => {
  // The old family layouts gathered every block of their type together and
  // pushed anything else to the end. A family card now draws its blocks where
  // they sit, and each test below FAILS against the old component for its
  // family — which is how a port proves it actually took effect.

  it('stat grid: a paragraph between stats stays between them', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDSTATH' },
      { type: 'stat', value: 'ORDSTATV1', label: 'ORDSTATL1' },
      { type: 'paragraph', text: 'ORDSTATP' },
      { type: 'stat', value: 'ORDSTATV2', label: 'ORDSTATL2' },
      { type: 'stat', value: 'ORDSTATV3', label: 'ORDSTATL3' },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expectInOrder(html, ['ORDSTATH', 'ORDSTATV1', 'ORDSTATP', 'ORDSTATV2', 'ORDSTATV3'])
    }
  })

  it('timeline: a paragraph between steps stays between them', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDTLH' },
      { type: 'timelineStep', label: 'ORDTLS1', text: 'ORDTLT1' },
      { type: 'paragraph', text: 'ORDTLP' },
      { type: 'timelineStep', label: 'ORDTLS2', text: 'ORDTLT2' },
      { type: 'timelineStep', label: 'ORDTLS3', text: 'ORDTLT3' },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expectInOrder(html, ['ORDTLH', 'ORDTLS1', 'ORDTLP', 'ORDTLS2', 'ORDTLS3'])
    }
  })

  it('comparison: a paragraph between columns stays between them', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDCMH' },
      { type: 'comparisonGroup', heading: 'ORDCMA', items: ['ORDCMAI'] },
      { type: 'paragraph', text: 'ORDCMP' },
      { type: 'comparisonGroup', heading: 'ORDCMB', items: ['ORDCMBI'] },
      { type: 'comparisonGroup', heading: 'ORDCMC', items: ['ORDCMCI'] },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expectInOrder(html, ['ORDCMH', 'ORDCMA', 'ORDCMP', 'ORDCMB', 'ORDCMC'])
    }
  })

  it('icon grid: a paragraph before a short list stays before it', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDIGH' },
      { type: 'paragraph', text: 'ORDIGP' },
      { type: 'bulletList', items: ['ORDIGI1', 'ORDIGI2'] },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expectInOrder(html, ['ORDIGH', 'ORDIGP', 'ORDIGI1', 'ORDIGI2'])
    }
  })

  it('numbered list: a paragraph before a long list stays before it', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDNLH' },
      { type: 'paragraph', text: 'ORDNLP' },
      {
        type: 'bulletList',
        items: ['ORDNLI1', 'ORDNLI2', 'ORDNLI3', 'ORDNLI4', 'ORDNLI5', 'ORDNLI6', 'ORDNLI7'],
      },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expectInOrder(html, ['ORDNLH', 'ORDNLP', 'ORDNLI1', 'ORDNLI7'])
    }
  })

  it('gallery: a quote between images stays between them', () => {
    // Forced, to exercise the Level 2 picker path; the classifier would also choose gallery for this card.
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDGLH' },
      { type: 'image', url: 'https://example.test/ORDGL1.png' },
      { type: 'quote', text: 'ORDGLQ' },
      { type: 'image', url: 'https://example.test/ORDGL2.png' },
      { type: 'image', url: 'https://example.test/ORDGL3.png' },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'gallery', variant)} />)
      expectInOrder(html, [
        'ORDGLH',
        'src="https://example.test/ORDGL1.png"',
        'ORDGLQ',
        'src="https://example.test/ORDGL2.png"',
        'src="https://example.test/ORDGL3.png"',
      ])
    }
  })
})
