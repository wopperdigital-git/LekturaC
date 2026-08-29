import { describe, expect, it } from 'vitest'
import { NO_ADJUST, type BlockAdjust } from '@/engine/blockAdjust'
import type { Frame } from '@/engine/frame'
import { currentFrame, normalizeAlign, toAdjust } from './measureBlock'

/*
  The delta round-trip.

  An adjustment is stored as a displacement from wherever the layout engine put
  the element, so every gesture reads a position out (`currentFrame`) and folds
  a new one back in (`toAdjust`). Getting that pair wrong in either direction is
  the bug that makes an element run away from the pointer at double speed, and
  it is invisible on the first drag — it only shows on the second.

  `natural` here is what `measureAt` returns: the layout's position for the
  element **at the size it currently has**. The size therefore lives in
  `natural`, not in the adjustment, and `currentFrame` only adds displacement.
*/

const CARD = { w: 800, h: 450 }
/** Where the layout put the element, before any nudge. */
const NATURAL: Frame = { x: 100, y: 60, w: 400, h: 120, rotation: 0 }

describe('currentFrame', () => {
  it('is the natural rect for an element nobody touched', () => {
    expect(currentFrame(NATURAL, undefined, CARD)).toEqual(NATURAL)
  })

  it('adds the displacement, scaled to the card', () => {
    const at = currentFrame(NATURAL, { dx: 0.25, dy: 0.1, rotation: 0 }, CARD)
    expect(at.x).toBe(300)
    expect(at.y).toBe(140)
  })

  /*
    The size comes from the measurement, never from the adjustment. `measureAt`
    reads the element with its size override already applied, so adding
    `adjust.w` on top here would count it twice.
  */
  it('takes its size from the measurement, not the adjustment', () => {
    const at = currentFrame(NATURAL, { dx: 0.25, dy: 0, w: 0.25, h: 0.125, rotation: 0 }, CARD)
    expect(at.w).toBe(NATURAL.w)
    expect(at.h).toBe(NATURAL.h)
  })
})

describe('toAdjust', () => {
  it('records a displacement as a fraction of the card', () => {
    const moved = { ...NATURAL, x: NATURAL.x + 200, y: NATURAL.y + 80 }
    expect(toAdjust(moved, NATURAL, CARD, NO_ADJUST, false)).toMatchObject({ dx: 0.25, dy: 0.1 })
  })

  /*
    The round-trip that matters: reading a moved element's position and folding
    it straight back must be a no-op. When it is not, each pointer event adds
    the existing displacement again.
  */
  it('round-trips without compounding the existing displacement', () => {
    const adjust: BlockAdjust = { dx: 0.25, dy: 0.1, rotation: 0 }
    const at = currentFrame(NATURAL, adjust, CARD)
    expect(toAdjust(at, NATURAL, CARD, adjust, false)).toMatchObject({ dx: 0.25, dy: 0.1 })
  })

  /*
    A resize is measured against the layout's position for the element *at the
    new size* — the caller probes for it — because most layouts align their
    children, so changing a width moves the element on its own. Measured against
    the old position instead, that re-centring is mistaken for a drag and the
    anchored edge slides by half the size change.
  */
  it('measures a resize against the probed position, not the old one', () => {
    // The layout re-centres a 400-wide element to 600 wide by moving it 100 left.
    const probed: Frame = { ...NATURAL, x: NATURAL.x - 100, w: 600 }
    const anchored: Frame = { ...NATURAL, w: 600 }
    const next = toAdjust(anchored, probed, CARD, NO_ADJUST, true)
    // 100px of the card's 800 puts the left edge back where the user held it.
    expect(next.dx).toBe(0.125)
    expect(next.w).toBe(0.75)
  })

  /*
    A move must not silently freeze the element's size. An element that was only
    ever dragged keeps sizing to its own content, so its text still reflows when
    edited — recording the measured size on every move would stop that with no
    way for the user to tell why.
  */
  it('leaves the size alone when the gesture was not a resize', () => {
    const moved = { ...NATURAL, x: NATURAL.x + 40 }
    const next = toAdjust(moved, NATURAL, CARD, NO_ADJUST, false)
    expect('w' in next).toBe(false)
    expect('h' in next).toBe(false)
  })

  it('writes the size when the gesture was a resize', () => {
    const bigger = { ...NATURAL, w: 600, h: 200 }
    expect(toAdjust(bigger, NATURAL, CARD, NO_ADJUST, true)).toMatchObject({ w: 0.75, h: 0.25 })
  })

  it('keeps a size the element already had through a later move', () => {
    const previous: BlockAdjust = { dx: 0, dy: 0, w: 0.5, h: 0.2, rotation: 0 }
    const moved = { ...NATURAL, x: NATURAL.x + 80 }
    expect(toAdjust(moved, NATURAL, CARD, previous, false)).toMatchObject({
      dx: 0.1,
      w: 0.5,
      h: 0.2,
    })
  })

  it('carries rotation through', () => {
    expect(toAdjust({ ...NATURAL, rotation: -30 }, NATURAL, CARD, NO_ADJUST, false).rotation).toBe(
      -30,
    )
  })
})

describe('normalizeAlign', () => {
  /*
    `start`/`end` are what the computed value reports when nothing has set an
    explicit side — which is the normal state for an element nobody has aligned,
    and therefore the case the toolbar highlight most needs to get right.
  */
  it('reads the implicit sides as left and right', () => {
    expect(normalizeAlign('start')).toBe('left')
    expect(normalizeAlign('end')).toBe('right')
  })

  it('passes the explicit sides through', () => {
    expect(normalizeAlign('left')).toBe('left')
    expect(normalizeAlign('center')).toBe('center')
    expect(normalizeAlign('right')).toBe('right')
  })

  /*
    Nothing rather than a guess: the toolbar has no button that could honestly
    be lit for these, and lighting the nearest one would be a quiet lie about
    what the slide is doing.
  */
  it('has no answer for alignments the toolbar cannot express', () => {
    expect(normalizeAlign('justify')).toBeNull()
    expect(normalizeAlign('')).toBeNull()
    expect(normalizeAlign('match-parent')).toBeNull()
  })
})
