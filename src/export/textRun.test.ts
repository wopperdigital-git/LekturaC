import { describe, expect, it } from 'vitest'
import { faceName, hex, markedRuns, pointSize, resolveRunStyle, PT_PER_REM } from './textRun'
import { mergeTextStyle } from '@/engine/textStyle'

describe('faceName', () => {
  it('takes the first family out of a CSS stack', () => {
    expect(faceName("'Inter', system-ui, sans-serif")).toBe('Inter')
    expect(faceName('Verdana, Geneva, sans-serif')).toBe('Verdana')
  })

  it('strips both quote styles', () => {
    expect(faceName('"Arial Black", sans-serif')).toBe('Arial Black')
  })

  it('handles a single family with no comma', () => {
    expect(faceName('Georgia')).toBe('Georgia')
  })
})

describe('resolveRunStyle', () => {
  it('lets an inline value win over the card and deck value', () => {
    const deckAndCard = mergeTextStyle({ align: 'left', bold: true }, { align: 'center' })
    const resolved = resolveRunStyle(deckAndCard, { align: 'right' })
    expect(resolved.align).toBe('right')
    // Inherited, not thrown away: the run only overrode `align`.
    expect(resolved.bold).toBe(true)
  })

  it('falls back to the merged deck+card style when there is no inline entry', () => {
    const deckAndCard = mergeTextStyle({ fontScale: 1.2 }, undefined)
    expect(resolveRunStyle(deckAndCard, undefined).fontScale).toBe(1.2)
  })
})

describe('pointSize', () => {
  it('puts a 1rem body line at the target point size', () => {
    expect(pointSize(1, undefined)).toBe(PT_PER_REM)
  })

  it('keeps the theme scale ratios rather than flattening them', () => {
    expect(pointSize(2.75, undefined)).toBe(Math.round(2.75 * PT_PER_REM))
  })

  it('multiplies by the font scale', () => {
    expect(pointSize(1, 1.5)).toBe(Math.round(1.5 * PT_PER_REM))
  })
})

describe('markedRuns', () => {
  it('returns one plain run when there are no marks', () => {
    expect(markedRuns('hello', undefined)).toEqual([
      { text: 'hello', options: {} },
    ])
  })

  it('splits a run at every mark edge', () => {
    const runs = markedRuns('abcdef', [{ type: 'bold', start: 2, end: 4 }])
    expect(runs.map((r) => r.text)).toEqual(['ab', 'cd', 'ef'])
    expect(runs[1].options.bold).toBe(true)
  })

  it('omits false flags rather than emitting them, so pptxgenjs inherits the box default', () => {
    const runs = markedRuns('abcdef', [{ type: 'bold', start: 2, end: 4 }])
    expect(runs[0].options).toEqual({})
    expect('italic' in runs[1].options).toBe(false)
  })
})

describe('hex', () => {
  it('strips the leading hash pptxgenjs does not want', () => {
    expect(hex('#8a6cff')).toBe('8a6cff')
    expect(hex('8a6cff')).toBe('8a6cff')
  })
})
