import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { BUILTIN_THEMES } from '@/lib/theme-tokens'
import type { DeckSnapshot, ScreenLink } from '@/present/protocol'
import type { PresenterState } from '@/present/presenterState'
import { DEFAULT_LIVE_PEN, livePenSettings } from '@/present/liveInk'
import { presentDrawing } from './presentDrawing'
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

  it('offers the live tools as icon buttons, with the pointer chosen to start', () => {
    const html = render()
    expect(html).toContain('aria-label="Draw on the slide"')
    for (const label of ['Pointer', 'Pen', 'Highlighter', 'Laser', 'Eraser']) {
      const button = html.split('<button').find((b) => b.includes(`aria-label="${label}"`)) ?? ''
      expect(button).toContain('<svg')
      expect(button).not.toContain(`>${label}<`)
    }
    expect(html).toMatch(/aria-pressed="true" aria-label="Pointer"/)
  })

  it('enables Undo and Redo only when the slide has a step to take', () => {
    const button = (html: string, label: string) => html.split('<button').find((b) => b.includes(`aria-label="${label}"`)) ?? ''
    expect(button(render(), 'Undo')).toContain('disabled=""')
    expect(button(render(), 'Redo')).toContain('disabled=""')
    expect(button(render({ canUndo: true }), 'Undo')).not.toContain('disabled=""')
    expect(button(render({ canRedo: true }), 'Redo')).not.toContain('disabled=""')
  })

  it('keeps the colours in the chosen tool menu, not the bar', () => {
    expect(render({ pen: { ...DEFAULT_LIVE_PEN, tool: 'pen' } })).not.toContain('aria-label="Colour"')
    const open = render({ pen: { ...DEFAULT_LIVE_PEN, tool: 'pen' }, toolMenu: 'pen' })
    expect(open).toContain('aria-label="Pen settings"')
    expect(open).toContain('aria-label="Colour"')
    expect(open).toContain('aria-label="Size"')
  })

  it('opens a menu only for the chosen tool, and only for tools that have one', () => {
    // Asked for a menu on a tool that is not chosen: nothing opens.
    expect(render({ toolMenu: 'pen' })).not.toContain('data-tool-menu')
    expect(render({ pen: { ...DEFAULT_LIVE_PEN, tool: 'laser' }, toolMenu: 'laser' })).not.toContain('data-tool-menu')
    // The eraser has sizes but no colours.
    const eraser = render({ pen: { ...DEFAULT_LIVE_PEN, tool: 'eraser' }, toolMenu: 'eraser' })
    expect(eraser).toContain('aria-label="Size"')
    expect(eraser).not.toContain('aria-label="Colour"')
  })

  it('marks the chosen size in the menu', () => {
    const html = render({ pen: { ...DEFAULT_LIVE_PEN, tool: 'pen', penSize: 'big' }, toolMenu: 'pen' })
    expect(html).toMatch(/aria-pressed="true" aria-label="Thick"/)
    expect(html).toMatch(/aria-pressed="false" aria-label="Fine"/)
  })

  it('offers text sizes for the Text tool on the board', () => {
    const html = render({ board: true, pen: { ...DEFAULT_LIVE_PEN, tool: 'text' }, toolMenu: 'text' })
    for (const label of ['Small', 'Medium', 'Large']) expect(html).toContain(`aria-label="${label}"`)
  })

  it('says a tool with settings opens them on a second press, and shows its colour on the button', () => {
    const html = render()
    const pen = html.split('<button').find((b) => b.includes('aria-label="Pen"')) ?? ''
    expect(pen).toContain('aria-haspopup="dialog"')
    expect(pen).toContain('data-tool-color')
    const laser = html.split('<button').find((b) => b.includes('aria-label="Laser"')) ?? ''
    expect(laser).not.toContain('aria-haspopup')
  })

  it('enables Clear slide only when the slide has ink', () => {
    const clear = (html: string) => html.split('<button').find((b) => b.includes('aria-label="Clear slide"')) ?? ''
    expect(clear(render())).toContain('disabled=""')
    expect(clear(render({ hasInk: true }))).not.toContain('disabled=""')
  })

  it('lays the drawing surface over the slide only while the pen captures', () => {
    const pen = { ...DEFAULT_LIVE_PEN, tool: 'pen' as const }
    const drawing = presentDrawing({ strokes: undefined, settings: livePenSettings(pen) })
    expect(render({ pen, drawing })).toContain('data-drawing-surface')
    expect(render({ drawing: presentDrawing({ strokes: undefined }) })).not.toContain('data-drawing-surface')
  })

  it('offers the whiteboard, and the Text tool only while it is up', () => {
    const boardButton = (html: string) => html.split('<button').find((b) => b.includes('Whiteboard</button>')) ?? ''
    const slide = render()
    expect(boardButton(slide)).toContain('aria-pressed="false"')
    expect(slide).not.toContain('aria-label="Text"')
    expect(slide).not.toContain('data-whiteboard')

    const board = render({ board: true })
    expect(boardButton(board)).toContain('aria-pressed="true"')
    expect(board).toContain('aria-label="Text"')
    expect(board).toContain('data-whiteboard')
  })

  it('shows the end, not the whiteboard, once the presentation has ended', () => {
    const html = render({ board: true, state: state({ ended: true }) })
    expect(html).toContain('End of presentation')
    expect(html).not.toContain('data-whiteboard')
  })

  it('offers zoom only while the board is up, showing the zoom as a percentage', () => {
    expect(render()).not.toContain('aria-label="Zoom in"')
    const html = render({ board: true, boardView: { x: 0, y: 0, zoom: 1.5 } })
    expect(html).toContain('aria-label="Zoom out"')
    expect(html).toContain('aria-label="Zoom in"')
    expect(html).toContain('>150%</button>')
  })

  it('moves and scales the board to the view, and lets the pointer grab it', () => {
    const html = render({ board: true, boardView: { x: 0.5, y: -0.25, zoom: 2 }, onBoardView: () => {} })
    expect(html).toContain('transform:scale(2) translate(-488px, 244px)')
    expect(html).toContain('cursor:grab')
    // The pen draws instead of grabbing.
    expect(render({ board: true, onBoardView: () => {}, pen: { ...DEFAULT_LIVE_PEN, tool: 'pen' } })).not.toContain('cursor:grab')
  })
})

