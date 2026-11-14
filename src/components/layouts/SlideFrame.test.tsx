import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock } from '@/engine/contentBlocks'
import { CPP_DECK, withStyle } from '@/engine/fixtures/cppDeck'
import { GALLERY_DECK } from '@/engine/fixtures/galleryDeck'
import { LayoutRenderer } from './LayoutRenderer'
import { SlideFrame } from './SlideFrame'

const html = (card: Card, first = false) =>
  renderToStaticMarkup(<LayoutRenderer card={card} context={{ isFirstCard: first }} />)

describe('SlideFrame through the layouts', () => {
  it('draws the claim, then the lead, then the body, in the frame', () => {
    const out = html(CPP_DECK[1]) // heading, paragraph, list
    const head = out.indexOf('data-slot="head"')
    const lead = out.indexOf('data-lead')
    const body = out.indexOf('data-slot="body"')
    expect(head).toBeGreaterThan(-1)
    expect(lead).toBeGreaterThan(head)
    expect(body).toBeGreaterThan(lead)
  })

  it('has no head zone for a card without a heading, and still draws everything once', () => {
    const card = {
      ...CPP_DECK[1],
      blocks: [
        { type: 'paragraph', text: 'Only words' },
        { type: 'bulletList', items: ['alpha', 'beta'] },
      ],
    } as Card
    const out = html(card)
    expect(out).not.toContain('data-slot="head"')
    for (const word of ['Only words', 'alpha', 'beta']) expect(out.split(word).length - 1).toBe(1)
  })

  it('keeps a heading that is not first as the claim and the earlier block in the body', () => {
    const card = {
      ...CPP_DECK[1],
      blocks: [
        { type: 'paragraph', text: 'Before' },
        { type: 'heading', text: 'Claim' },
      ],
    } as Card
    const out = html(card)
    const head = out.indexOf('data-slot="head"')
    const body = out.indexOf('data-slot="body"')
    expect(head).toBeGreaterThan(-1)
    expect(body).toBeGreaterThan(head)
    // The claim is in the head zone: after its opening and before the body zone opens.
    expect(out.indexOf('Claim')).toBeGreaterThan(head)
    expect(out.indexOf('Claim')).toBeLessThan(body)
    // The paragraph before it is not a lead; it sits in the body zone.
    expect(out.indexOf('Before')).toBeGreaterThan(body)
    expect(out).not.toContain('data-lead')
  })

  it('makes the lead paragraph the element Adjustable holds', () => {
    // The holder `display: contents` div carries the block index and the lead <p> is its
    // direct child, so a nudge or a selection of block 1 lands on the lead itself.
    expect(html(CPP_DECK[1])).toMatch(/data-block-index="1"[^>]*><p[^>]*data-lead/)
  })

  it('has a head zone and no lead when the heading is not followed by a paragraph', () => {
    const card = {
      ...CPP_DECK[1],
      blocks: [
        { type: 'heading', text: 'Claim only' },
        { type: 'bulletList', items: ['alpha', 'beta'] },
      ],
    } as Card
    const out = html(card)
    expect(out).toContain('data-slot="head"')
    expect(out).not.toContain('data-lead')
  })

  it('gives the head zone the full width of its column, with no inline max-width', () => {
    for (const card of [CPP_DECK[1], CPP_DECK[6], { ...CPP_DECK[6], layout: 'imageFocus' } as Card]) {
      const tag = html(card).match(/<div[^>]*data-slot="head"[^>]*>/)?.[0] ?? ''
      expect(tag).not.toBe('')
      expect(tag).not.toMatch(/max-width/)
    }
  })
})

describe('the photo layouts on the frame', () => {
  it('puts the split photo in the aside, right on even positions and left on odd', () => {
    const even = html({ ...CPP_DECK[6], orderIndex: 6 })
    const odd = html({ ...CPP_DECK[6], orderIndex: 5 })
    expect(even.indexOf('data-slot="aside"')).toBeGreaterThan(even.indexOf('data-slot="head"'))
    expect(odd.indexOf('data-slot="aside"')).toBeLessThan(odd.indexOf('data-slot="head"'))
  })

  it('left-aligns the title slide in both treatments', () => {
    for (const style of ['structured', 'expressive'] as const) {
      const out = html(withStyle(CPP_DECK, style)[0], true)
      expect(out).toContain('text-left')
      expect(out).not.toContain('text-center')
    }
  })

  it('draws a second photo in the body, once, when the split already has one in the aside', () => {
    const card = {
      ...CPP_DECK[6],
      layout: 'standardSplit',
      blocks: [
        { type: 'heading', text: 'SPLITCLAIM' },
        { type: 'image', url: 'https://example.test/FIRSTPHOTO.png' },
        { type: 'paragraph', text: 'SPLITBODY' },
        { type: 'image', url: 'https://example.test/SECONDPHOTO.png' },
      ],
    } as Card
    const out = html(card)
    for (const mark of ['src="https://example.test/FIRSTPHOTO.png"', 'src="https://example.test/SECONDPHOTO.png"', 'SPLITBODY'])
      expect(out.split(mark).length - 1, mark).toBe(1)
    // The first photo is the aside, so it comes after the head; the second sits in the body zone.
    expect(out.indexOf('src="https://example.test/FIRSTPHOTO.png"')).toBeGreaterThan(out.indexOf('data-slot="aside"'))
    expect(out.indexOf('data-slot="body"')).toBeLessThan(out.indexOf('src="https://example.test/SECONDPHOTO.png"'))
  })
})

describe('photo cards without a heading, and image focus', () => {
  const count = (out: string, mark: string) => out.split(mark).length - 1

  it.each(['standardSplit', 'imageFocus'] as const)('draws a headless %s card with an aside and no head', (layout) => {
    const card = {
      ...CPP_DECK[6],
      layout,
      blocks: [
        { type: 'paragraph', text: 'HEADLESSBODY' },
        { type: 'image', url: 'https://example.test/HEADLESS.png' },
        { type: 'bulletList', items: ['HEADLESSITEM'] },
      ],
    } as Card
    const out = html(card)
    expect(out).not.toContain('data-slot="head"')
    expect(count(out, 'data-slot="aside"')).toBe(1)
    for (const mark of ['HEADLESSBODY', 'HEADLESSITEM', 'src="https://example.test/HEADLESS.png"'])
      expect(count(out, mark), mark).toBe(1)
  })

  describe.each(['structured', 'expressive'] as const)('imageFocus (%s)', (style) => {
    const card = {
      ...CPP_DECK[6],
      layout: 'imageFocus',
      visualStyle: style,
      orderIndex: 6,
      blocks: [
        { type: 'heading', text: 'FOCUSCLAIM' },
        { type: 'paragraph', text: 'FOCUSLEAD' },
        { type: 'image', url: 'https://example.test/FOCUSFIRST.png' },
      ],
    } as Card

    it('puts the photo in the aside on the left, before the head', () => {
      const out = html(card)
      expect(count(out, 'data-slot="aside"')).toBe(1)
      expect(out.indexOf('data-slot="aside"')).toBeLessThan(out.indexOf('data-slot="head"'))
      expect(out.indexOf('src="https://example.test/FOCUSFIRST.png"')).toBeGreaterThan(out.indexOf('data-slot="aside"'))
    })

    it('draws a second photo once, in the body after the aside', () => {
      const two = {
        ...card,
        blocks: [...card.blocks, { type: 'image', url: 'https://example.test/FOCUSSECOND.png' }],
      } as Card
      const out = html(two)
      for (const mark of ['src="https://example.test/FOCUSFIRST.png"', 'src="https://example.test/FOCUSSECOND.png"'])
        expect(count(out, mark), mark).toBe(1)
      expect(out.indexOf('src="https://example.test/FOCUSSECOND.png"')).toBeGreaterThan(out.indexOf('data-slot="body"'))
    })
  })
})

describe('SlideFrame used directly', () => {
  const blocks: ContentBlock[] = [
    { type: 'heading', text: 'MARKCLAIM' },
    { type: 'paragraph', text: 'MARKLEAD' },
    { type: 'image', url: 'https://example.test/MARKPHOTO.png' },
    { type: 'paragraph', text: 'MARKBODY' },
  ]
  const render = (aside?: Parameters<typeof SlideFrame>[0]['aside']) =>
    renderToStaticMarkup(
      <SlideFrame blocks={blocks} variant="structured" aside={aside}>
        {(body) => <span data-body-indices={body.join(',')}>BODYZONE</span>}
      </SlideFrame>,
    )

  it('hands the body indices to its child, with the photo merged back in when there is no aside', () => {
    expect(render()).toContain('data-body-indices="2,3"')
  })

  it('leaves the photo out of the body when an aside is given', () => {
    expect(render({ node: <i>ASIDEPHOTO</i>, side: 'right', width: 'half' })).toContain(
      'data-body-indices="3"',
    )
  })

  it('draws an aside on the left before the text column', () => {
    const out = render({ node: <i>ASIDEPHOTO</i>, side: 'left', width: 'half' })
    expect(out.indexOf('data-slot="aside"')).toBeGreaterThan(-1)
    expect(out.indexOf('ASIDEPHOTO')).toBeLessThan(out.indexOf('MARKCLAIM'))
  })

  it('draws an aside on the right after the text column', () => {
    const out = render({ node: <i>ASIDEPHOTO</i>, side: 'right', width: 'wide' })
    expect(out.indexOf('ASIDEPHOTO')).toBeGreaterThan(out.indexOf('BODYZONE'))
  })

  it('takes the aside from a named index even when the card holds two photos', () => {
    const two: ContentBlock[] = [
      { type: 'heading', text: 'MARKCLAIM' },
      { type: 'image', url: 'https://example.test/A.png' },
      { type: 'paragraph', text: 'MARKBODY' },
      { type: 'image', url: 'https://example.test/B.png' },
    ]
    const out = renderToStaticMarkup(
      <SlideFrame
        blocks={two}
        variant="structured"
        aside={{ node: <i>ASIDEPHOTO</i>, side: 'right', width: 'half', index: 1 }}
      >
        {(body) => <span data-body-indices={body.join(',')}>BODYZONE</span>}
      </SlideFrame>,
    )
    expect(out).toContain('data-body-indices="2,3"')
  })
})

describe('the photo frames bleed to the slide edge', () => {
  const split = GALLERY_DECK.find((card) => card.id === 'g-split-photo') as Card
  const focus = GALLERY_DECK.find((card) => card.id === 'g-image') as Card
  const count = (out: string, mark: string) => out.split(mark).length - 1
  const asideTag = (out: string) => out.match(/<div[^>]*data-slot="aside"[^>]*>/)?.[0] ?? ''
  const imgTag = (out: string) => out.match(/<img[^>]*>/)?.[0] ?? ''
  // The class tokens the aside cell carries to reach the slide's top, bottom and outer edge.
  const PAD = 'calc(-1*var(--slide-pad,0px))'
  const BLOCK_MARGIN = `@min-[640px]:[margin-block:${PAD}]`
  const SIDE_MARGIN = {
    left: `@min-[640px]:[margin-left:${PAD}]`,
    right: `@min-[640px]:[margin-right:${PAD}]`,
  }

  describe.each(['structured', 'expressive'] as const)('(%s)', (style) => {
    const cases = [
      ['standardSplit at an even position', { ...split, visualStyle: style, orderIndex: 4 }, 'right'],
      ['standardSplit at an odd position', { ...split, visualStyle: style, orderIndex: 5 }, 'left'],
      ['imageFocus', { ...focus, visualStyle: style, orderIndex: 4 }, 'left'],
    ] as const

    it.each(cases)('%s: the aside names its side and reaches the edge on it, the top and the bottom', (_name, card, side) => {
      const tag = asideTag(html(card as Card))
      expect(tag).toContain(`data-bleed="${side}"`)
      expect(tag).toContain(BLOCK_MARGIN)
      expect(tag).toContain(SIDE_MARGIN[side])
      expect(tag).not.toContain(SIDE_MARGIN[side === 'left' ? 'right' : 'left'])
      // It stretches with the row and sets no height of its own, so the slide can still grow.
      expect(tag).toContain('@min-[640px]:self-stretch')
      expect(tag).not.toMatch(/overflow-hidden|max-h|min-h|h-\[|style="[^"]*height/)
    })

    it.each(cases)('%s: the photo fills its cell with no aspect ratio, border or radius from 640px up', (_name, card) => {
      const out = html(card as Card)
      const img = imgTag(out)
      expect(count(out, '<img')).toBe(1)
      expect(img).toContain('object-cover')
      expect(img).toContain('@min-[640px]:h-full')
      expect(img).toContain('@min-[640px]:aspect-auto')
      expect(img).not.toMatch(/@min-\[640px\]:aspect-\[/)
      const figure = out.match(/<figure[^>]*>/)?.[0] ?? ''
      expect(figure).toContain('@min-[640px]:h-full')
      expect(figure).toContain('@min-[640px]:border-0')
      expect(figure).toContain('@min-[640px]:rounded-none')
      // Stacked below 640px it keeps today's shape.
      expect(img).toContain('aspect-[4/3]')
    })

    it.each(cases)('%s: every block is drawn once and the credit stays inside the figure', (_name, card) => {
      const credited = {
        ...(card as Card),
        blocks: (card as Card).blocks.map((block) =>
          block.type === 'image'
            ? { ...block, credit: { name: 'Ada Lovelace', url: 'https://example.test', source: 'pexels' as const } }
            : block,
        ),
      } as Card
      const out = html(credited)
      for (const block of credited.blocks) {
        if (block.type === 'heading' || block.type === 'paragraph') expect(count(out, block.text), block.text).toBe(1)
      }
      expect(count(out, '<img')).toBe(1)
      expect(count(out, 'data-photo-credit')).toBe(1)
      const figure = out.slice(out.indexOf('<figure'), out.indexOf('</figure>'))
      expect(figure).toContain('data-photo-credit')
    })
  })

  it('draws the expressive image focus with no accent outline from 640px up, and keeps it stacked', () => {
    const img = imgTag(html({ ...focus, visualStyle: 'expressive' }))
    expect(img).toContain('outline-4')
    expect(img).toContain('@min-[640px]:outline-0')
    expect(imgTag(html({ ...focus, visualStyle: 'structured' }))).not.toContain('outline')
  })

  it('leaves a second photo in the body, unbled', () => {
    const two = { ...split, blocks: [...split.blocks, { type: 'image', url: 'https://example.test/SECOND.png' }] } as Card
    const out = html(two)
    expect(count(out, 'src="https://example.test/SECOND.png"')).toBe(1)
    expect(count(out, '@min-[640px]:absolute')).toBe(1)
    expect(count(out, 'data-bleed')).toBe(1)
  })

  const plainBlocks: ContentBlock[] = [
    { type: 'heading', text: 'PLAINCLAIM' },
    { type: 'image', url: 'https://example.test/PLAIN.png' },
  ]

  it('names no side on a frame used without bleed, and adds no margins or stretch', () => {
    const out = renderToStaticMarkup(
      <SlideFrame blocks={plainBlocks} variant="structured" aside={{ node: <i>ASIDEPHOTO</i>, side: 'right', width: 'half' }}>
        {() => <span>BODYZONE</span>}
      </SlideFrame>,
    )
    expect(out).not.toContain('data-bleed')
    expect(out).not.toContain('margin-block')
    expect(out).not.toContain('self-stretch')
  })

  it('names its side on a frame used directly with bleed', () => {
    for (const side of ['left', 'right'] as const) {
      const out = renderToStaticMarkup(
        <SlideFrame blocks={plainBlocks} variant="structured" aside={{ node: <i>ASIDEPHOTO</i>, side, width: 'half', bleed: true }}>
          {() => <span>BODYZONE</span>}
        </SlideFrame>,
      )
      expect(out).toContain(`data-bleed="${side}"`)
    }
  })

  it('draws a photo that does not bleed with exactly the classes it always had', () => {
    const card = {
      ...CPP_DECK[1],
      layout: 'standard',
      blocks: [
        { type: 'heading', text: 'LEAFCLAIM' },
        { type: 'image', url: 'https://example.test/LEAF.png' },
      ],
    } as Card
    const out = html(card)
    expect(out.match(/<figure[^>]*>/)?.[0]).toBe(
      '<figure class="relative w-full overflow-hidden rounded-slide-sm border border-slide-border">',
    )
    expect(imgTag(out)).toBe(
      '<img src="https://example.test/LEAF.png" alt="" class="block w-full object-cover "/>',
    )
    expect(out).not.toContain('data-bleed')
  })
})
