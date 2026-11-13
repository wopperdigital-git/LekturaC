import { describe, expect, it } from 'vitest'
import { filterVideos, videoLength, videoLibrary } from './library'

const record = (generatedAt: string, path = 'u/p.mp4') => ({
  path,
  contentType: 'video/mp4',
  durationSeconds: 30,
  generatedAt,
})

describe('videoLibrary', () => {
  it('lists the decks with a readable video, newest video first', () => {
    const entries = videoLibrary([
      { deck: { title: 'Old' }, video: record('2026-10-01T00:00:00.000Z') },
      { deck: { title: 'New' }, video: record('2026-11-01T00:00:00.000Z') },
    ])
    expect(entries.map((e) => e.deck.title)).toEqual(['New', 'Old'])
  })

  it('leaves out a deck whose video is missing or malformed', () => {
    const entries = videoLibrary([
      { deck: { title: 'None' }, video: null },
      { deck: { title: 'Broken' }, video: { path: 'u/p.mp4' } },
      { deck: { title: 'Good' }, video: record('2026-11-01T00:00:00.000Z') },
    ])
    expect(entries.map((e) => e.deck.title)).toEqual(['Good'])
  })
})

describe('filterVideos', () => {
  const entries = videoLibrary([
    { deck: { title: 'Volcanoes' }, video: record('2026-11-01T00:00:00.000Z') },
    { deck: { title: 'Tides' }, video: record('2026-10-01T00:00:00.000Z') },
  ])

  it('matches the deck title, ignoring case and spaces', () => {
    expect(filterVideos(entries, '  VOLC ').map((e) => e.deck.title)).toEqual(['Volcanoes'])
  })

  it('returns everything for an empty search', () => {
    expect(filterVideos(entries, '   ')).toHaveLength(2)
  })
})

describe('videoLength', () => {
  it('reads like a player clock', () => {
    expect(videoLength(42.4)).toBe('0:42')
    expect(videoLength(125)).toBe('2:05')
    expect(videoLength(3725)).toBe('1:02:05')
  })

  it('never shows 0:00 for a real clip', () => {
    expect(videoLength(0.2)).toBe('0:01')
  })
})
