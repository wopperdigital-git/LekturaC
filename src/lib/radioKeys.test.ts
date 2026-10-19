import { describe, expect, it } from 'vitest'
import { nextRadioIndex, radioTabStop } from './radioKeys'

/*
  The keyboard rules of a radio group (WAI-ARIA Authoring Practices, Radio Group): one
  Tab stop for the whole group, and the arrow keys move between options, selecting as
  they go, wrapping at the ends.
*/

describe('nextRadioIndex', () => {
  it('moves forward with Right and Down, back with Left and Up', () => {
    expect(nextRadioIndex(0, 2, 'ArrowRight')).toBe(1)
    expect(nextRadioIndex(0, 2, 'ArrowDown')).toBe(1)
    expect(nextRadioIndex(1, 2, 'ArrowLeft')).toBe(0)
    expect(nextRadioIndex(1, 2, 'ArrowUp')).toBe(0)
  })

  it('wraps around at both ends', () => {
    expect(nextRadioIndex(1, 2, 'ArrowRight')).toBe(0)
    expect(nextRadioIndex(0, 2, 'ArrowLeft')).toBe(1)
  })

  // Nothing chosen yet: the first arrow press picks the first or the last option.
  it('starts from the ends when nothing is selected', () => {
    expect(nextRadioIndex(-1, 2, 'ArrowRight')).toBe(0)
    expect(nextRadioIndex(-1, 2, 'ArrowLeft')).toBe(1)
  })

  it('ignores every other key', () => {
    expect(nextRadioIndex(0, 2, 'Tab')).toBeNull()
    expect(nextRadioIndex(0, 2, 'Enter')).toBeNull()
    expect(nextRadioIndex(0, 0, 'ArrowRight')).toBeNull()
  })
})

describe('radioTabStop', () => {
  it('is the selected option, or the first when none is selected', () => {
    expect(radioTabStop(1, 2)).toBe(1)
    expect(radioTabStop(-1, 2)).toBe(0)
  })
})
