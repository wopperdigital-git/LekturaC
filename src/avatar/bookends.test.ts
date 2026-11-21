import { describe, expect, it } from 'vitest'
import {
  EMPTY_BOOKENDS,
  bookendText,
  bookendsToRow,
  clipCost,
  formatUsd,
  parseBookends,
  starterIntro,
  starterOutro,
  waitMinutes,
} from './bookends'

describe('parseBookends', () => {
  it('gives null for missing fields', () => {
    expect(parseBookends({})).toEqual({ intro: null, outro: null })
  })
  it('keeps empty strings and text', () => {
    expect(parseBookends({ intro: '', outro: 'Bye' })).toEqual({ intro: '', outro: 'Bye' })
  })
  it('gives null for a non-string field', () => {
    expect(parseBookends({ intro: 5 }).intro).toBeNull()
  })
  it('gives EMPTY_BOOKENDS for non-objects', () => {
    expect(parseBookends(null)).toEqual(EMPTY_BOOKENDS)
    expect(parseBookends([])).toEqual(EMPTY_BOOKENDS)
    expect(parseBookends('x')).toEqual(EMPTY_BOOKENDS)
  })
})

describe('bookendText', () => {
  it("null uses the starter, '' means none", () => {
    const b = { intro: null, outro: '' }
    expect(bookendText(b, 'intro', 'Volcanoes')).toBe("Hi! Today we're looking at Volcanoes. Let's get started.")
    expect(bookendText(b, 'outro', 'Volcanoes')).toBe('')
  })
  it('trims stored text', () => {
    expect(bookendText({ intro: '  Hello  ', outro: null }, 'intro', 'X')).toBe('Hello')
  })
})

describe('starters', () => {
  it('handle a blank title', () => {
    expect(starterIntro('   ')).toBe("Hi! Let's get started.")
    expect(starterOutro('')).toBe("That's all for today. Thanks for watching!")
  })
  it('trim the title', () => {
    expect(starterOutro('  Volcanoes ')).toBe("That's all for Volcanoes. Thanks for watching!")
  })
})

describe('cost and wait', () => {
  it('prices clips by whole seconds with a 3 s minimum', () => {
    expect(clipCost(0)).toBe(0)
    expect(clipCost(1.2)).toBe(0.09)
    expect(clipCost(20)).toBe(0.6)
    expect(clipCost(20.1)).toBe(0.63)
  })
  it('formats dollars', () => {
    expect(formatUsd(1.05)).toBe('$1.05')
  })
  it('estimates the wait', () => {
    expect(waitMinutes(20)).toEqual({ min: 4, max: 10 })
  })
})

describe('bookendsToRow', () => {
  it('drops null and keeps empty strings', () => {
    expect(bookendsToRow({ intro: '', outro: null })).toEqual({ intro: '' })
  })
})
