import { describe, expect, it } from 'vitest'
import { TRACKS, deckSwatch, deckTrack } from './deckSwatch'

describe('deckTrack', () => {
  it('gives a deck the same track every time', () => {
    expect(deckTrack('deck-a')).toBe(deckTrack('deck-a'))
  })

  it('spreads decks over all four tracks', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => deckTrack(`deck-${i}`)))
    expect([...seen].sort()).toEqual([...TRACKS].sort())
  })
})

describe('deckSwatch', () => {
  it('starts on the deck’s own track', () => {
    const id = 'deck-7'
    expect(deckSwatch(id).from).toBe(`var(--app-track-${deckTrack(id)})`)
    expect(deckSwatch(id).to).not.toBe(deckSwatch(id).from)
  })
})
