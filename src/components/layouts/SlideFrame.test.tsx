import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock } from '@/engine/contentBlocks'
import { CPP_DECK } from '@/engine/fixtures/cppDeck'
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
    expect(out.indexOf('Claim')).toBeLessThan(out.indexOf('Before'))
  })

  it('makes the lead paragraph the element Adjustable holds', () => {
    expect(html(CPP_DECK[1])).toMatch(/<p[^>]*data-lead/)
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
})
