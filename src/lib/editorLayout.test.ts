import { describe, expect, it } from 'vitest'
import { COMPACT_MIN_WIDTH_PX, FULL_MIN_WIDTH_PX, editorLayout } from './editorLayout'

describe('editorLayout', () => {
  // A phone has no room for the canvas beside any panel: it gets the deck view instead.
  it('is phone below 768px', () => {
    expect(editorLayout(390)).toBe('phone')
    expect(editorLayout(COMPACT_MIN_WIDTH_PX - 1)).toBe('phone')
  })

  // An iPad in portrait: the editor, with its panels over the canvas instead of beside it.
  it('is compact from 768px up to 1099px', () => {
    expect(editorLayout(COMPACT_MIN_WIDTH_PX)).toBe('compact')
    expect(editorLayout(1024)).toBe('compact')
    expect(editorLayout(FULL_MIN_WIDTH_PX - 1)).toBe('compact')
  })

  it('is full from 1100px', () => {
    expect(editorLayout(FULL_MIN_WIDTH_PX)).toBe('full')
    expect(editorLayout(1920)).toBe('full')
  })

  // A width that couldn't be read must not hide the editor from a laptop.
  it('is full when the width is unknown', () => {
    expect(editorLayout(0)).toBe('full')
    expect(editorLayout(Number.NaN)).toBe('full')
  })
})
