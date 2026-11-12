import { describe, expect, it } from 'vitest'
import { presenterKeyIntent, type KeyInput } from './keys'

const key = (k: string, extra: Partial<KeyInput> = {}) =>
  presenterKeyIntent({ key: k, ctrlKey: false, metaKey: false, altKey: false, inField: false, ...extra })

describe('presenterKeyIntent', () => {
  it.each(['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'n', 'N'])('%j goes next', (k) => {
    expect(key(k)).toEqual({ type: 'next' })
  })

  it.each(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'])('%j goes back', (k) => {
    expect(key(k)).toEqual({ type: 'prev' })
  })

  it('Home and End jump to the ends', () => {
    expect(key('Home')).toEqual({ type: 'first' })
    expect(key('End')).toEqual({ type: 'last' })
  })

  it.each(['b', 'B', '.'])('%j toggles black', (k) => {
    expect(key(k)).toEqual({ type: 'toggleBlack' })
  })

  it.each(['0', '1', '5', '9'])('digit %s is a digit', (d) => {
    expect(key(d)).toEqual({ type: 'digit', digit: d })
  })

  it('Enter, fullscreen and Escape', () => {
    expect(key('Enter')).toEqual({ type: 'enter' })
    expect(key('f')).toEqual({ type: 'fullscreen' })
    expect(key('F')).toEqual({ type: 'fullscreen' })
    expect(key('Escape')).toEqual({ type: 'exit' })
  })

  it('ignores an unmapped key', () => {
    expect(key('x')).toBeNull()
  })

  it('ignores keys typed in a field', () => {
    expect(key('5', { inField: true })).toBeNull()
  })

  it('ignores keys with Ctrl, Meta or Alt held', () => {
    expect(key('ArrowRight', { ctrlKey: true })).toBeNull()
    expect(key('b', { metaKey: true })).toBeNull()
    expect(key('n', { altKey: true })).toBeNull()
  })
})
