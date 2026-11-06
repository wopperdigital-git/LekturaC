import { describe, expect, it } from 'vitest'
import { parseVideo } from './videoRecord'

const good = { path: 'u1/p1.mp4', contentType: 'video/mp4', durationSeconds: 42.5, generatedAt: '2026-09-27T10:00:00.000Z' }

describe('parseVideo', () => {
  it('reads a well-formed record', () => {
    expect(parseVideo(good)).toEqual(good)
  })

  it.each([null, undefined, 'x', 3, [], {}])('reads %j as no video', (raw) => {
    expect(parseVideo(raw)).toBeNull()
  })

  it('reads a record with a bad field as no video, rather than half of one', () => {
    expect(parseVideo({ ...good, path: '' })).toBeNull()
    expect(parseVideo({ ...good, path: 5 })).toBeNull()
    expect(parseVideo({ ...good, contentType: 'video/quicktime' })).toBeNull()
    expect(parseVideo({ ...good, durationSeconds: 0 })).toBeNull()
    expect(parseVideo({ ...good, durationSeconds: NaN })).toBeNull()
    expect(parseVideo({ ...good, generatedAt: 12 })).toBeNull()
  })

  it('drops fields it does not know', () => {
    expect(parseVideo({ ...good, extra: 1 })).toEqual(good)
  })

  it('keeps valid slide timings', () => {
    const slides = [
      { cardId: 'a', startSeconds: 0, durationSeconds: 4 },
      { cardId: 'b', startSeconds: 4, durationSeconds: 2.5 },
    ]
    expect(parseVideo({ ...good, slides })?.slides).toEqual(slides)
  })

  it('drops malformed slides but keeps the record', () => {
    for (const slides of [
      [{ cardId: 'a' }],
      'x',
      [{ cardId: '', startSeconds: 0, durationSeconds: 4 }],
      [{ cardId: 'a', startSeconds: -1, durationSeconds: 4 }],
      [{ cardId: 'a', startSeconds: 0, durationSeconds: 0 }],
      [{ cardId: 'a', startSeconds: NaN, durationSeconds: 4 }],
      [{ cardId: 'a', startSeconds: 0, durationSeconds: 4 }, null],
    ]) {
      const record = parseVideo({ ...good, slides })
      expect(record).toEqual(good)
      expect(record?.slides).toBeUndefined()
    }
  })

  it('old records have no slides', () => {
    expect(parseVideo(good)?.slides).toBeUndefined()
    expect('slides' in (parseVideo(good) ?? {})).toBe(false)
  })
})
