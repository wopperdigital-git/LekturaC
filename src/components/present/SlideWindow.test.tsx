import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { BUILTIN_THEMES } from '@/lib/theme-tokens'
import type { DeckSnapshot, ShownState } from '@/present/protocol'
import { SlideWindowView, type ScreenPhase } from './SlideWindow'

function card(id: string, orderIndex: number): Card {
  return {
    id,
    orderIndex,
    blocks: [{ type: 'heading', text: `Slide ${orderIndex + 1}` }],
    layout: 'auto',
    visualStyle: 'structured',
  }
}

const DECK: DeckSnapshot = {
  title: 'Deck',
  theme: BUILTIN_THEMES[0],
  textStyle: {},
  cards: [card('a', 0), card('b', 1), card('c', 2)],
}

function render(
  phase: ScreenPhase,
  shown: ShownState | null = null,
  opts: { deck?: DeckSnapshot | null; showFullscreenHint?: boolean } = {},
) {
  return renderToStaticMarkup(
    <SlideWindowView
      phase={phase}
      deck={opts.deck === undefined ? DECK : opts.deck}
      shown={shown}
      showFullscreenHint={opts.showFullscreenHint ?? false}
    />,
  )
}

describe('SlideWindowView', () => {
  it('says it is waiting for the presenter', () => {
    expect(render('waiting', null, { deck: null })).toContain('Waiting for the presenter…')
  })

  it('tells an orphaned window how to get a presenter', () => {
    expect(render('orphan', null, { deck: null })).toContain(
      'Open Presenter view from the editor to use this window.',
    )
  })

  it('says the presentation ended when the console is gone', () => {
    expect(render('gone')).toContain('Presentation ended')
  })

  it('draws the shown slide while live', () => {
    const html = render('live', { index: 1, black: false, ended: false })
    expect(html).toContain('Slide 2')
    expect(html).not.toContain('Slide 1')
  })

  it('is black, with no slide text, when blacked out', () => {
    const html = render('live', { index: 1, black: true, ended: false })
    expect(html).not.toContain('Slide 1')
    expect(html).not.toContain('Slide 2')
  })

  it('shows the end screen after the last slide', () => {
    const html = render('live', { index: 2, black: false, ended: true })
    expect(html).toContain('End of presentation')
    expect(html).not.toContain('Slide 3')
  })

  it('shows the full screen hint only when asked to', () => {
    const shown = { index: 0, black: false, ended: false }
    expect(render('live', shown, { showFullscreenHint: true })).toContain(
      'Click or press F for full screen',
    )
    expect(render('live', shown)).not.toContain('Click or press F for full screen')
  })
})
