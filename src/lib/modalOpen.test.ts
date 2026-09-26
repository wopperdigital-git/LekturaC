import { describe, expect, it } from 'vitest'
import { modalIsOpen } from './modalOpen'

/** A stand-in for `document`: answers only the one selector `modalIsOpen` asks. */
function page(hasModal: boolean): Pick<Document, 'querySelector'> {
  return {
    querySelector: ((selector: string) =>
      hasModal && selector === '[aria-modal="true"]' ? ({} as Element) : null) as Document['querySelector'],
  }
}

describe('modalIsOpen', () => {
  // The editor's shortcut listener uses this to stand down: a dialog opened from inside the
  // panel (the narration dialogs) is not one of the editor's own dialog flags.
  it('is true while a modal dialog is on the page', () => {
    expect(modalIsOpen(page(true))).toBe(true)
  })

  it('is false when no modal dialog is on the page', () => {
    expect(modalIsOpen(page(false))).toBe(false)
  })
})
