import { describe, expect, it } from 'vitest'
import { adjustStyle, isNeutral, normalizeAdjust, parseAdjusts, NO_ADJUST } from './blockAdjust'

describe('parseAdjusts', () => {
  it('reads a well-formed record', () => {
    const raw = { '0': { dx: 0.1, dy: -0.2, w: 0.5, rotation: 15 } }
    expect(parseAdjusts(raw)).toEqual(raw)
  })

  /*
    `default '{}'` on the column means every card written before this feature
    reads back as an empty object. That has to mean "nobody touched this",
    because the presence of adjustments is what routes a card down the export's
    approximate per-element path.
  */
  it('treats an empty record as no adjustments at all', () => {
    expect(parseAdjusts({})).toBeUndefined()
  })

  it('survives a row with no column', () => {
    expect(parseAdjusts(null)).toBeUndefined()
    expect(parseAdjusts(undefined)).toBeUndefined()
  })

  it('rejects a non-record', () => {
    expect(parseAdjusts([1, 2])).toBeUndefined()
    expect(parseAdjusts('nope')).toBeUndefined()
  })

  /*
    Tolerant per entry, not per record. One bad rectangle drops that element
    back to its layout position; discarding the whole record would throw away
    every other nudge on the card because of it.
  */
  it('drops only the malformed entries', () => {
    const parsed = parseAdjusts({
      '0': { dx: 0.1, dy: 0, rotation: 0 },
      '1': { dx: 'left', dy: 0, rotation: 0 },
      '2': { dy: 0.2, rotation: 0 },
    })
    expect(Object.keys(parsed ?? {})).toEqual(['0'])
  })

  it('rejects a non-positive size rather than collapsing the element', () => {
    expect(parseAdjusts({ '0': { dx: 0, dy: 0, w: 0, rotation: 0 } })).toBeUndefined()
    expect(parseAdjusts({ '0': { dx: 0, dy: 0, h: -1, rotation: 0 } })).toBeUndefined()
  })
})

describe('isNeutral', () => {
  it('is true for an untouched element', () => {
    expect(isNeutral(NO_ADJUST)).toBe(true)
  })

  it('is false once anything is set', () => {
    expect(isNeutral({ ...NO_ADJUST, dx: 0.01 })).toBe(false)
    expect(isNeutral({ ...NO_ADJUST, dy: -0.01 })).toBe(false)
    expect(isNeutral({ ...NO_ADJUST, rotation: 1 })).toBe(false)
    expect(isNeutral({ ...NO_ADJUST, w: 0.5 })).toBe(false)
    expect(isNeutral({ ...NO_ADJUST, h: 0.5 })).toBe(false)
  })
})

describe('normalizeAdjust', () => {
  it('rounds off the float noise a long drag accumulates', () => {
    const next = normalizeAdjust({ dx: 0.31999999999999995, dy: 0, rotation: 0 })
    expect(next.dx).toBe(0.32)
  })

  /*
    An absent size is what "still sizes to its own content" means, so it must
    not come back as a number — least of all zero, which would collapse the box.
  */
  it('keeps an absent size absent', () => {
    const next = normalizeAdjust({ dx: 0, dy: 0, rotation: 0 })
    expect('w' in next).toBe(false)
    expect('h' in next).toBe(false)
  })

  it('keeps a present size', () => {
    expect(normalizeAdjust({ dx: 0, dy: 0, w: 0.25, h: 0.1, rotation: 0 })).toMatchObject({
      w: 0.25,
      h: 0.1,
    })
  })
})

describe('adjustStyle', () => {
  const CARD_W = 800

  /*
    An untouched element must produce no CSS at all. `Adjustable` writes these
    onto the real DOM node the layout produced, so an empty result is what keeps
    a card nobody has edited rendering byte-identically.
  */
  it('emits nothing for a neutral adjustment', () => {
    expect(adjustStyle(NO_ADJUST, CARD_W)).toEqual({})
  })

  it('turns fractions into pixels against the card width', () => {
    const style = adjustStyle({ dx: 0.25, dy: -0.1, rotation: 0 }, CARD_W)
    expect(style.transform).toBe('translate(200px, -80px)')
  })

  /*
    A transform is applied after layout, which is the entire reason only the
    element you touched moves. If displacement ever became a margin or an
    absolute position, every sibling below it would shift too.
  */
  it('displaces with a transform, never with layout', () => {
    const style = adjustStyle({ dx: 0.1, dy: 0.1, rotation: 0 }, CARD_W)
    expect(style.transform).toContain('translate')
    expect(style.width).toBeUndefined()
    expect(style.height).toBeUndefined()
  })

  it('combines displacement and rotation in one transform', () => {
    const style = adjustStyle({ dx: 0.125, dy: 0, rotation: 30 }, CARD_W)
    expect(style.transform).toBe('translate(100px, 0px) rotate(30deg)')
  })

  it('rotates about the element without displacing it', () => {
    expect(adjustStyle({ dx: 0, dy: 0, rotation: 45 }, CARD_W).transform).toBe('rotate(45deg)')
  })

  /*
    Height is stored as a fraction of *width* — the card has no fixed height to
    measure against — so both axes scale by the same number and a resized
    element keeps its shape as the card resizes.
  */
  it('sizes both axes against the width', () => {
    const style = adjustStyle({ dx: 0, dy: 0, w: 0.5, h: 0.25, rotation: 0 }, CARD_W)
    expect(style.width).toBe('400px')
    expect(style.height).toBe('200px')
  })

  it('reproduces the same proportions at any card width', () => {
    const adjust = { dx: 0.25, dy: 0, w: 0.5, rotation: 0 }
    expect(adjustStyle(adjust, 400)).toMatchObject({
      transform: 'translate(100px, 0px)',
      width: '200px',
    })
    expect(adjustStyle(adjust, 1200)).toMatchObject({
      transform: 'translate(300px, 0px)',
      width: '600px',
    })
  })

  /*
    The readability caps the layouts carry — `max-w-prose` on paragraphs and
    bullet lists, `max-w-md`/`max-w-lg`/`max-w-2xl` elsewhere — override a plain
    width. Without lifting them a side handle sets a width that does nothing:
    the selection box grows and the text refuses to, which reads as "the resize
    handles don't work".
  */
  it('lifts the layout max-width so a resized element can actually grow', () => {
    expect(adjustStyle({ dx: 0, dy: 0, w: 0.9, rotation: 0 }, CARD_W).maxWidth).toBe('none')
  })

  it('lifts max-height alongside an explicit height', () => {
    expect(adjustStyle({ dx: 0, dy: 0, h: 0.4, rotation: 0 }, CARD_W).maxHeight).toBe('none')
  })

  /*
    Only alongside the axis that was actually set. Lifting a cap the user never
    overrode would silently widen elements nobody touched.
  */
  it('leaves the caps alone on an axis with no override', () => {
    const style = adjustStyle({ dx: 0, dy: 0, w: 0.5, rotation: 0 }, CARD_W)
    expect(style.maxHeight).toBeUndefined()
    expect(adjustStyle({ dx: 0.2, dy: 0, rotation: 0 }, CARD_W).maxWidth).toBeUndefined()
  })
})
