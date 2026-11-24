import { describe, expect, it } from 'vitest'
import { EXIT_CONFIRM_MS, confirmsExit, inkUndoKey, leavesKeyToBrowser, presenterKeyIntent, type KeyInput } from './keys'

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

describe('leavesKeyToBrowser', () => {
  it('leaves Enter and Space to a focused control', () => {
    expect(leavesKeyToBrowser('Enter', true)).toBe(true)
    expect(leavesKeyToBrowser(' ', true)).toBe(true)
  })

  it('handles every other key, and Enter and Space elsewhere', () => {
    expect(leavesKeyToBrowser('ArrowRight', true)).toBe(false)
    expect(leavesKeyToBrowser('b', true)).toBe(false)
    expect(leavesKeyToBrowser('Enter', false)).toBe(false)
    expect(leavesKeyToBrowser(' ', false)).toBe(false)
  })
})

describe('confirmsExit', () => {
  it('needs an earlier Escape', () => {
    expect(confirmsExit(null, 5000)).toBe(false)
  })

  it('confirms a second Escape within the window, boundary included', () => {
    expect(confirmsExit(1000, 1000)).toBe(true)
    expect(confirmsExit(1000, 1000 + EXIT_CONFIRM_MS)).toBe(true)
  })

  it('does not confirm after the window', () => {
    expect(confirmsExit(1000, 1000 + EXIT_CONFIRM_MS + 1)).toBe(false)
  })
})

describe('inkUndoKey', () => {
  const k = (key: string, over: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
    inkUndoKey({ key, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, ...over })

  it('reads Ctrl/Cmd+Z as undo, with Shift or Ctrl+Y as redo', () => {
    expect(k('z')).toBe('undo')
    expect(k('z', { ctrlKey: false, metaKey: true })).toBe('undo')
    expect(k('Z', { shiftKey: true })).toBe('redo')
    expect(k('y')).toBe('redo')
  })

  it('ignores the keys without Ctrl or Cmd, with Alt, and other letters', () => {
    expect(k('z', { ctrlKey: false })).toBeNull()
    expect(k('z', { altKey: true })).toBeNull()
    expect(k('x')).toBeNull()
    expect(k('y', { shiftKey: true })).toBeNull()
  })
})
