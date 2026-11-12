import type { PresenterAction } from './presenterState'

export type KeyIntent =
  | PresenterAction
  | { type: 'digit'; digit: string }
  | { type: 'enter' }
  | { type: 'fullscreen' }
  | { type: 'exit' }

export interface KeyInput {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  inField: boolean
}

/** What a key press means in the presenter, or null to leave it to the browser. */
export function presenterKeyIntent(e: KeyInput): KeyIntent | null {
  if (e.inField || e.ctrlKey || e.metaKey || e.altKey) return null

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case ' ':
    case 'PageDown':
    case 'n':
    case 'N':
      return { type: 'next' }
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
    case 'p':
    case 'P':
      return { type: 'prev' }
    case 'Home':
      return { type: 'first' }
    case 'End':
      return { type: 'last' }
    case 'b':
    case 'B':
    case '.':
      return { type: 'toggleBlack' }
    case 'Enter':
      return { type: 'enter' }
    case 'f':
    case 'F':
      return { type: 'fullscreen' }
    case 'Escape':
      return { type: 'exit' }
  }
  if (/^[0-9]$/.test(e.key)) return { type: 'digit', digit: e.key }
  return null
}

/**
 * Enter and Space on a focused button or link belong to the browser (they press
 * it); every other key still drives the presenter.
 */
export function leavesKeyToBrowser(key: string, onControl: boolean): boolean {
  return onControl && (key === 'Enter' || key === ' ')
}
