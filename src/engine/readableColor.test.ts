import { describe, expect, it } from 'vitest'
import { BUILTIN_THEMES } from '@/lib/theme-tokens'
import type { Card } from './contentBlocks'
import { dropUnreadableColors, isReadableOn } from './readableColor'

const BLACK = '#111827'
const WHITE = '#ffffff'
const DARK_BG = '#080b1a' // Deep Space
const LIGHT_BG = '#f7f5fa' // Moonlight

const card = (extra: Partial<Card> = {}): Card => ({
  id: 'a',
  orderIndex: 0,
  blocks: [
    { type: 'heading', text: 'Title' },
    { type: 'bulletList', items: ['One', 'Two'] },
  ],
  layout: 'auto',
  visualStyle: 'structured',
  ...extra,
})

describe('isReadableOn', () => {
  it('refuses black on a dark theme and white on a light one', () => {
    expect(isReadableOn(BLACK, DARK_BG)).toBe(false)
    expect(isReadableOn(WHITE, LIGHT_BG)).toBe(false)
    expect(isReadableOn(BLACK, LIGHT_BG)).toBe(true)
    expect(isReadableOn(WHITE, DARK_BG)).toBe(true)
  })

  it('leaves anything that is not a hex colour to the theme', () => {
    expect(isReadableOn(undefined, DARK_BG)).toBe(true)
    expect(isReadableOn('accent', DARK_BG)).toBe(true)
  })

  // The two reported themes: black text, picked on a light theme, on their dark cards.
  it('catches black text on Deep Space and Solar Flare', () => {
    for (const id of ['midnight', 'bold']) {
      const theme = BUILTIN_THEMES.find((t) => t.id === id)!
      expect(isReadableOn(BLACK, theme.colors.background)).toBe(false)
    }
  })
})

describe('dropUnreadableColors', () => {
  it('drops an unreadable colour from the deck, the card, each element and character marks', () => {
    const before = card({
      textStyle: { align: 'left', color: BLACK },
      inline: {
        '0': { style: { color: BLACK, fontScale: 0.9 } },
        '1': { style: { color: BLACK } },
        '0:text': {
          marks: [
            { type: 'color', start: 0, end: 2, value: BLACK },
            { type: 'bold', start: 0, end: 2 },
          ],
        },
      },
    })
    const after = dropUnreadableColors([before], { color: BLACK, bold: true }, DARK_BG)
    expect(after.textStyle).toEqual({ bold: true })
    expect(after.cards[0].textStyle).toEqual({ align: 'left' })
    expect(after.cards[0].inline).toEqual({
      '0': { style: { fontScale: 0.9 } },
      '0:text': { marks: [{ type: 'bold', start: 0, end: 2 }] },
    })
  })

  it('keeps a colour that reads on the theme', () => {
    const before = card({ textStyle: { color: WHITE }, inline: { '0': { style: { color: '#ef4444' } } } })
    const cards = [before]
    const style = { color: WHITE }
    const after = dropUnreadableColors(cards, style, DARK_BG)
    expect(after.cards).toBe(cards)
    expect(after.textStyle).toBe(style)
  })

  it('leaves untouched cards as the same objects, and mutates nothing', () => {
    const plain = card({ id: 'b' })
    const styled = card({ inline: { '1': { style: { color: BLACK } } } })
    const after = dropUnreadableColors([styled, plain], {}, DARK_BG)
    expect(after.cards[1]).toBe(plain)
    expect(after.cards[0].inline).toEqual({})
    expect(styled.inline).toEqual({ '1': { style: { color: BLACK } } })
  })
})
