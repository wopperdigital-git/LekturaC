import { describe, expect, it } from 'vitest'
import { MAX_STROKES_PER_CARD, type Stroke } from '@/engine/overlay'
import {
  DEFAULT_LIVE_PEN,
  LASER_MAX_POINTS,
  LASER_TRAIL_MS,
  INK_UNDO_LIMIT,
  MAX_TEXT_LENGTH,
  addLiveItem,
  setLiveText,
  WHITEBOARD_ID,
  type LiveText,
  canRedoInk,
  canUndoInk,
  recordInk,
  redoInk,
  undoInk,
  type InkHistory,
  type LiveInk,
  clearLiveSlide,
  eraseLiveStrokes,
  livePenSettings,
  liveToolMenu,
  LIVE_TEXT_SIZES,
  parseLiveInk,
  pruneLaser,
  pushLaser,
  slideHasInk,
} from './liveInk'

function stroke(id: string): Stroke {
  return { id, kind: 'stroke', tool: 'pen', color: '#ef4444', width: 0.007, points: [[0.1, 0.1]] }
}

describe('livePenSettings', () => {
  it('draws pen and highlighter as temporary ink in their own colours', () => {
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'pen', penColor: '#3b82f6' })).toEqual({
      tool: 'pen',
      size: 'small',
      color: '#3b82f6',
      keep: 'temporary',
    })
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'highlighter', highlighterColor: '#22c55e' })).toEqual({
      tool: 'marker',
      size: 'big',
      color: '#22c55e',
      keep: 'temporary',
    })
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'eraser' })).toMatchObject({ tool: 'eraser', keep: 'temporary' })
  })

  it('captures nothing for the pointer and the laser', () => {
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'pointer' })).toBeNull()
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'laser' })).toBeNull()
  })

  it('starts on the pointer with a fine red pen and a wide yellow highlighter', () => {
    expect(DEFAULT_LIVE_PEN).toMatchObject({
      tool: 'pointer',
      penColor: '#ef4444',
      highlighterColor: '#facc15',
      penSize: 'small',
      highlighterSize: 'big',
    })
  })

  it('draws each tool at its own chosen size', () => {
    const pen = { ...DEFAULT_LIVE_PEN, penSize: 'big' as const, highlighterSize: 'dot' as const, eraserSize: 'big' as const }
    expect(livePenSettings({ ...pen, tool: 'pen' })?.size).toBe('big')
    expect(livePenSettings({ ...pen, tool: 'highlighter' })?.size).toBe('dot')
    expect(livePenSettings({ ...pen, tool: 'eraser' })?.size).toBe('big')
  })

  it('captures nothing with the Text tool (the board places text itself)', () => {
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'text' })).toBeNull()
  })
})

describe('liveToolMenu', () => {
  it('gives size and colour to the pen, highlighter and text, size only to the eraser', () => {
    for (const tool of ['pen', 'highlighter', 'text'] as const) expect(liveToolMenu(tool)).toEqual({ size: true, color: true })
    expect(liveToolMenu('eraser')).toEqual({ size: true, color: false })
  })

  it('has no menu for the pointer and the laser', () => {
    expect(liveToolMenu('pointer')).toBeNull()
    expect(liveToolMenu('laser')).toBeNull()
  })

  it('orders the text sizes small to large', () => {
    expect(LIVE_TEXT_SIZES.small).toBeLessThan(LIVE_TEXT_SIZES.medium)
    expect(LIVE_TEXT_SIZES.medium).toBeLessThan(LIVE_TEXT_SIZES.large)
  })
})

describe('live ink per slide', () => {
  it('adds a stroke to its own slide only, without touching the input', () => {
    const before = { a: [stroke('1')] }
    const after = addLiveItem(before, 'b', stroke('2'))
    expect(after).toEqual({ a: [stroke('1')], b: [stroke('2')] })
    expect(before).toEqual({ a: [stroke('1')] })
  })

  it('refuses a stroke past the per-slide limit', () => {
    const full = { a: Array.from({ length: MAX_STROKES_PER_CARD }, (_, i) => stroke(String(i))) }
    expect(addLiveItem(full, 'a', stroke('x'))).toBe(full)
  })

  it('erases named strokes and drops a slide left empty', () => {
    const ink = { a: [stroke('1'), stroke('2')], b: [stroke('3')] }
    expect(eraseLiveStrokes(ink, 'a', ['1'])).toEqual({ a: [stroke('2')], b: [stroke('3')] })
    expect(eraseLiveStrokes(ink, 'b', ['3'])).toEqual({ a: [stroke('1'), stroke('2')] })
    expect(eraseLiveStrokes(ink, 'a', ['nope'])).toBe(ink)
  })

  it('clears one slide and keeps the others', () => {
    const ink = { a: [stroke('1')], b: [stroke('2')] }
    expect(clearLiveSlide(ink, 'a')).toEqual({ b: [stroke('2')] })
    expect(clearLiveSlide(ink, 'z')).toBe(ink)
  })

  it('says whether a slide has ink', () => {
    expect(slideHasInk({ a: [stroke('1')] }, 'a')).toBe(true)
    expect(slideHasInk({ a: [stroke('1')] }, 'b')).toBe(false)
  })
})

describe('parseLiveInk', () => {
  it('keeps valid strokes and drops anything else', () => {
    const shape = { id: 's', kind: 'shape', shape: 'rectangle', color: 'accent', width: 0.004, fill: false, x: 0, y: 0, w: 0.1, h: 0.1 }
    expect(parseLiveInk({ a: [stroke('1'), { id: 'bad' }, shape], b: [], c: 'x' })).toEqual({ a: [stroke('1')] })
  })

  it('reads anything that is not an object as no ink', () => {
    expect(parseLiveInk(null)).toEqual({})
    expect(parseLiveInk([stroke('1')])).toEqual({})
    expect(parseLiveInk('x')).toEqual({})
  })
})

describe('laser trail', () => {
  it('appends points and keeps only the newest few', () => {
    let trail = pushLaser([], [0.1, 0.2], 1000)
    expect(trail).toEqual([{ x: 0.1, y: 0.2, at: 1000 }])
    for (let i = 0; i < LASER_MAX_POINTS + 5; i++) trail = pushLaser(trail, [i, i], 1000 + i)
    expect(trail).toHaveLength(LASER_MAX_POINTS)
    expect(trail.at(-1)).toEqual({ x: LASER_MAX_POINTS + 4, y: LASER_MAX_POINTS + 4, at: 1000 + LASER_MAX_POINTS + 4 })
  })

  it('clears when the pointer leaves the slide', () => {
    expect(pushLaser([{ x: 0, y: 0, at: 1 }], null, 2)).toEqual([])
  })

  it('fades old points but always keeps the dot', () => {
    const trail = [
      { x: 0, y: 0, at: 0 },
      { x: 1, y: 1, at: 500 },
      { x: 2, y: 2, at: 600 },
    ]
    expect(pruneLaser(trail, 500 + LASER_TRAIL_MS - 50)).toEqual(trail.slice(1))
    expect(pruneLaser(trail, 10_000)).toEqual([trail[2]])
    expect(pruneLaser([], 10)).toEqual([])
  })
})

describe('live ink undo and redo', () => {
  const s = (id: string): Stroke => ({ id, kind: 'stroke', tool: 'pen', color: '#ef4444', width: 0.004, points: [[0, 0], [0.1, 0.1]] })

  it('undoes a stroke, then redoes it', () => {
    let ink: LiveInk = {}
    let history: InkHistory = {}
    history = recordInk(history, 'a', ink.a ?? [])
    ink = addLiveItem(ink, 'a', s('1'))
    expect(canUndoInk(history, 'a')).toBe(true)
    expect(canRedoInk(history, 'a')).toBe(false)

    const undone = undoInk(ink, history, 'a')!
    expect(undone.ink).toEqual({})
    expect(canUndoInk(undone.history, 'a')).toBe(false)
    expect(canRedoInk(undone.history, 'a')).toBe(true)

    const redone = redoInk(undone.ink, undone.history, 'a')!
    expect(redone.ink).toEqual({ a: [s('1')] })
    expect(canRedoInk(redone.history, 'a')).toBe(false)
  })

  it('undoes a clear and an erase back to the strokes before', () => {
    const before: LiveInk = { a: [s('1'), s('2')] }
    let history = recordInk({}, 'a', before.a)
    const cleared = clearLiveSlide(before, 'a')
    expect(undoInk(cleared, history, 'a')!.ink).toEqual(before)
    history = recordInk({}, 'a', before.a)
    const erased = eraseLiveStrokes(before, 'a', ['1'])
    expect(undoInk(erased, history, 'a')!.ink).toEqual(before)
  })

  it('keeps each slide to its own history', () => {
    const history = recordInk({}, 'a', [])
    const ink: LiveInk = { a: [s('1')], b: [s('2')] }
    expect(undoInk(ink, history, 'b')).toBeNull()
    expect(undoInk(ink, history, 'a')!.ink).toEqual({ b: [s('2')] })
  })

  it('drops the redo steps on a new change', () => {
    let history = recordInk({}, 'a', [])
    const undone = undoInk({ a: [s('1')] }, history, 'a')!
    history = recordInk(undone.history, 'a', [])
    expect(canRedoInk(history, 'a')).toBe(false)
  })

  it('caps the undo steps', () => {
    let history: InkHistory = {}
    for (let i = 0; i < INK_UNDO_LIMIT + 10; i++) history = recordInk(history, 'a', [])
    expect(history.a.past).toHaveLength(INK_UNDO_LIMIT)
  })

  it('has nothing to undo or redo on a fresh slide', () => {
    expect(undoInk({}, {}, 'a')).toBeNull()
    expect(redoInk({}, {}, 'a')).toBeNull()
  })
})

describe('whiteboard text', () => {
  const text = (id: string, words = 'Hello'): LiveText => ({ id, kind: 'text', x: 0.1, y: 0.2, text: words, color: '#ef4444', size: 0.035 })

  it('adds text beside strokes and edits it in place', () => {
    const ink = addLiveItem({}, WHITEBOARD_ID, text('t1'))
    const edited = setLiveText(ink, WHITEBOARD_ID, 't1', 'Hello class')
    expect(edited[WHITEBOARD_ID]).toEqual([text('t1', 'Hello class')])
    expect(setLiveText(edited, WHITEBOARD_ID, 't1', 'Hello class')).toBe(edited)
    expect(setLiveText(edited, WHITEBOARD_ID, 'nope', 'x')).toBe(edited)
  })

  it('cuts text at the limit', () => {
    const ink = addLiveItem({}, WHITEBOARD_ID, text('t1'))
    const long = setLiveText(ink, WHITEBOARD_ID, 't1', 'x'.repeat(MAX_TEXT_LENGTH + 20))
    expect((long[WHITEBOARD_ID][0] as LiveText).text).toHaveLength(MAX_TEXT_LENGTH)
  })

  it('parses text and strokes back, and drops a bad text', () => {
    const good = text('t1')
    expect(parseLiveInk({ [WHITEBOARD_ID]: [good, { ...good, id: 't2', size: 'big' }, { ...good, id: 't3', color: 'red' }] })).toEqual({
      [WHITEBOARD_ID]: [good],
    })
  })

  it('never uses a card-id-shaped key for the board', () => {
    expect(WHITEBOARD_ID).not.toMatch(/^[0-9a-f]{8}-/)
  })
})
