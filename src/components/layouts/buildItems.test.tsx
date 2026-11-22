import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { CPP_DECK } from '@/engine/fixtures/cppDeck'
import { BuildItemsContext } from './adjustContext'
import { LayoutRenderer } from './LayoutRenderer'

/**
 * The video reveals list items one at a time and finds them by a marker that only
 * the video surface asks for. Every other surface must render exactly as before.
 */
const card: Card = {
  ...CPP_DECK[0],
  orderIndex: 2,
  layout: 'auto',
  visualStyle: 'structured',
  blocks: [
    { type: 'heading', text: 'Four habits' },
    { type: 'bulletList', items: ['First habit', 'Second habit', 'Third habit', 'Fourth habit'] },
  ],
}

const html = (c: Card, { buildItems }: { buildItems: boolean }) =>
  renderToStaticMarkup(
    <BuildItemsContext value={buildItems}>
      <LayoutRenderer card={c} />
    </BuildItemsContext>,
  )

describe('build item markers', () => {
  it('marks each list item for the video when asked', () => {
    const marked = html(card, { buildItems: true })
    expect(marked.match(/data-build-item=""/g)).toHaveLength(4)
  })

  it('marks nothing on every other surface', () => {
    expect(html(card, { buildItems: false })).not.toContain('data-build-item')
  })

  it('marks nothing when no provider is mounted', () => {
    expect(renderToStaticMarkup(<LayoutRenderer card={card} />)).not.toContain('data-build-item')
  })
})
