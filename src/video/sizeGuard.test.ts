import { describe, expect, it } from 'vitest'
import { encodeQualityFor, tooLongMessage } from './sizeGuard'

describe('encodeQualityFor', () => {
  const secondsFor = (mib: number, perMinute: number) => (mib / perMinute) * 60
  it('keeps medium up to and including a 45 MiB estimate', () => {
    expect(encodeQualityFor(60)).toBe('medium')
    expect(encodeQualityFor(secondsFor(45, 3.2))).toBe('medium')
  })
  it('drops to low past 45 MiB, up to and including 48 MiB at low', () => {
    expect(encodeQualityFor(secondsFor(45, 3.2) + 1)).toBe('low')
    expect(encodeQualityFor(secondsFor(48, 2.2))).toBe('low')
  })
  it('refuses past what low can fit', () => {
    expect(encodeQualityFor(secondsFor(48, 2.2) + 1)).toBeNull()
  })
})

describe('tooLongMessage', () => {
  it('speaks in minutes, never bytes', () => {
    const m = tooLongMessage(30 * 60)
    expect(m).toMatch(/30 minutes/)
    expect(m).toMatch(/about 21 minutes/)
    expect(m).not.toMatch(/MB|MiB|byte|VITE_/i)
  })
})
