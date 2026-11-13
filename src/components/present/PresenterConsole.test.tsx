import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { BUILTIN_THEMES } from '@/lib/theme-tokens'
import type { DeckSnapshot, ScreenLink } from '@/present/protocol'
import type { PresenterState } from '@/present/presenterState'
import { PresenterConsoleView, type PresenterConsoleViewProps } from './PresenterConsole'

function card(id: string, orderIndex: number, script?: string): Card {
  return {
    id,
    orderIndex,
    blocks: [{ type: 'heading', text: `Slide ${orderIndex + 1}` }],
    layout: 'auto',
    visualStyle: 'structured',
    narration: script === undefined ? undefined : { text: script, generated: script },
  }
}

const DECK: DeckSnapshot = {
  title: 'My deck',
  theme: BUILTIN_THEMES[0],
  textStyle: {},
  cards: [card('a', 0, 'Script one'), card('b', 1, '   '), card('c', 2, 'Script three')],
}

function state(over: Partial<PresenterState> = {}): PresenterState {
  return { index: 1, count: 3, black: false, ended: false, ...over }
}

function render(over: Partial<PresenterConsoleViewProps> = {}) {
  const noop = () => {}
  const props: PresenterConsoleViewProps = {
    deck: DECK,
    state: state(),
    noteSize: 1,
    screen: 'open' as ScreenLink,
    exitPending: false,
    onPrev: noop,
    onNext: noop,
    onToggleBlack: noop,
    onNotesSmaller: noop,
    onNotesLarger: noop,
    onOpenScreen: noop,
    onEnd: noop,
    ...over,
  }
  return renderToStaticMarkup(<PresenterConsoleView {...props} />)
}

describe('PresenterConsoleView', () => {
  it('shows the current slide\'s script and the counter', () => {
    const html = render({ state: state({ index: 0 }) })
    expect(html).toContain('Script one')
    expect(html).toContain('1 / 3')
    expect(html).toContain('My deck')
    expect(html).toContain('End presentation')
    expect(render()).toContain('2 / 3')
  })

  it('says so when the script is blank', () => {
    expect(render()).toContain('No script for this slide.')
    expect(render({ state: state({ index: 0 }) })).not.toContain('No script for this slide.')
  })

  it('has no next-slide preview, timer or pacing', () => {
    const html = render({ state: state({ index: 0 }) })
    expect(html).not.toContain('>Next<')
    expect(html).not.toContain('Slide 2</h')
    for (const gone of ['Pause', 'Resume', 'Reset', 'Target', 'On time', 'data-planned-tick']) {
      expect(html).not.toContain(gone)
    }
  })

  it('says when the screen is black', () => {
    expect(render({ state: state({ black: true }) })).toContain('Screen is black · press B to show')
    expect(render()).not.toContain('Screen is black')
  })

  it('says when the presentation has ended, in the current slide pane too', () => {
    const html = render({ state: state({ index: 1, ended: true }) })
    expect(html).toContain('End of presentation')
    expect(html).toContain('bg-black')
    expect(render({ state: state({ index: 1 }) })).not.toContain('End of presentation')
  })

  it('asks for a second Escape only after the first', () => {
    expect(render({ exitPending: true })).toContain('Press Esc again to end presentation')
    expect(render()).not.toContain('Press Esc again')
  })

  it('banners a closed or blocked slide window', () => {
    const closed = render({ screen: 'closed' })
    expect(closed).toContain('Slide window closed')
    expect(closed).toContain('Reopen')

    const blocked = render({ screen: 'blocked' })
    expect(blocked).toContain('Your browser blocked the slide window')
    expect(blocked).toContain('Open slide window')

    for (const screen of ['open', 'connecting'] as const) {
      const html = render({ screen })
      expect(html).not.toContain('Slide window closed')
      expect(html).not.toContain('blocked the slide window')
    }
  })


  it('marks Black screen pressed only while black', () => {
    expect(render()).toContain('aria-pressed="false"')
    expect(render({ state: state({ black: true }) })).toContain('aria-pressed="true"')
  })

  it('renders only a message for an empty deck', () => {
    const html = render({ deck: { ...DECK, cards: [] }, state: state({ index: 0, count: 0 }) })
    expect(html).toContain('No slides to present.')
    expect(html).toContain('End presentation')
    expect(html).not.toContain('Next')
  })

  it('announces the slide politely', () => {
    const html = render()
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Slide 2 of 3')
  })
})
