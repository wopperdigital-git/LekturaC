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
})
