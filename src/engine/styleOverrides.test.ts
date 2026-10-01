import { describe, expect, it } from 'vitest'
import type { Card } from './contentBlocks'
import { clearDeckOverrides, clearStyleOverrides, patchKeys } from './styleOverrides'

const card = (extra: Partial<Card> = {}): Card => ({
  id: 'a',
  orderIndex: 0,
  blocks: [
    { type: 'heading', text: 'Title' },
    { type: 'paragraph', text: 'Some prose' },
  ],
  layout: 'hero',
  visualStyle: 'structured',
  ...extra,
})

describe('patchKeys', () => {
  it('names a field whether the patch sets or clears it', () => {
    expect(patchKeys({ color: '#ef4444', fontFamily: null })).toEqual(['color', 'fontFamily'])
  })
})

describe('clearStyleOverrides', () => {
  // The case that prompted it: a title slide styled by hand stopped following the deck.
  it('drops the written field from the card and from every element, for a deck-wide write', () => {
    const before = card({
      textStyle: { align: 'left', color: '#111827' },
      inline: {
        '0': { style: { color: '#111827', fontScale: 0.9 } },
        '1': { style: { align: 'left', color: '#111827' } },
      },
    })
    const after = clearStyleOverrides(before, ['color'], true)
    expect(after.textStyle).toEqual({ align: 'left' })
    expect(after.inline).toEqual({ '0': { style: { fontScale: 0.9 } }, '1': { style: { align: 'left' } } })
  })

  it('leaves the card own style alone for a card-wide write, clearing only its elements', () => {
    const before = card({ textStyle: { color: '#111827' }, inline: { '0': { style: { color: '#ef4444' } } } })
    const after = clearStyleOverrides(before, ['color'], false)
    expect(after.textStyle).toEqual({ color: '#111827' })
    expect(after.inline).toEqual({})
  })

  it('never touches character marks or a run entry', () => {
    const marks = [{ type: 'color' as const, start: 0, end: 3, value: '#ef4444' }]
    const before = card({
      inline: { '0': { style: { color: '#111827' } }, '0:text': { marks } },
    })
    const after = clearStyleOverrides(before, ['color'], true)
    expect(after.inline).toEqual({ '0:text': { marks } })
  })

  it('drops an emptied style but keeps whatever else the entry holds', () => {
    const marks = [{ type: 'bold' as const, start: 0, end: 2 }]
    const before = card({ inline: { '0': { style: { color: '#111827' }, marks } } })
    expect(clearStyleOverrides(before, ['color'], true).inline).toEqual({ '0': { marks } })
  })

  it('returns the same card when there is nothing to clear', () => {
    const before = card({ textStyle: { align: 'left' }, inline: { '0': { style: { fontScale: 0.9 } } } })
    expect(clearStyleOverrides(before, ['color'], true)).toBe(before)
    expect(clearStyleOverrides(card(), ['color'], true).inline).toBeUndefined()
  })

  it('does not mutate its input', () => {
    const before = card({ textStyle: { color: '#111827' }, inline: { '0': { style: { color: '#111827' } } } })
    clearStyleOverrides(before, ['color'], true)
    expect(before.textStyle).toEqual({ color: '#111827' })
    expect(before.inline).toEqual({ '0': { style: { color: '#111827' } } })
  })
})

describe('clearDeckOverrides', () => {
  it('keeps the array and every untouched card as they were', () => {
    const plain = card({ id: 'b' })
    const styled = card({ textStyle: { color: '#111827' } })
    const cards = [styled, plain]
    const next = clearDeckOverrides(cards, ['color'])
    expect(next).not.toBe(cards)
    expect(next[0].textStyle).toEqual({})
    expect(next[1]).toBe(plain)
    expect(clearDeckOverrides(cards, ['fontFamily'])).toBe(cards)
  })
})
