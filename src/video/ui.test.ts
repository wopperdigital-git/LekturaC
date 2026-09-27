import { describe, expect, it } from 'vitest'
import { canCancelVideo, generateBlocker, stageRows } from './ui'

const ok = { webCodecs: true, hasDeck: true, slideCount: 3, voiceChosen: true }

describe('generateBlocker', () => {
  it('is null when everything is in place', () => {
    expect(generateBlocker(ok)).toBeNull()
  })

  it('explains what is missing', () => {
    expect(generateBlocker({ ...ok, webCodecs: false })).toMatch(/cannot encode video/i)
    expect(generateBlocker({ ...ok, hasDeck: false })).toMatch(/saved deck/i)
    expect(generateBlocker({ ...ok, slideCount: 0 })).toMatch(/no slides/i)
    expect(generateBlocker({ ...ok, voiceChosen: false })).toMatch(/choose a voice/i)
  })

  // The browser is the hardest blocker to fix, so it is the one named when several apply.
  it('names the browser first', () => {
    expect(generateBlocker({ webCodecs: false, hasDeck: true, slideCount: 0, voiceChosen: false })).toMatch(/cannot encode video/i)
  })
})

describe('stageRows', () => {
  it('lists the four stages in order, all pending before anything is reported', () => {
    const rows = stageRows(null)
    expect(rows.map((r) => r.stage)).toEqual(['narrating', 'rendering', 'encoding', 'uploading'])
    expect(rows.every((r) => r.state === 'pending')).toBe(true)
  })

  it('marks earlier stages done, the current one active with its count, later ones pending', () => {
    const rows = stageRows({ stage: 'rendering', done: 2, total: 5 })
    expect(rows.map((r) => r.state)).toEqual(['done', 'active', 'pending', 'pending'])
    expect(rows[1].detail).toBe('2/5')
    expect(rows[0].detail).toBeNull()
  })

  it('shows no count for a single-step stage', () => {
    expect(stageRows({ stage: 'uploading', done: 0, total: 1 })[3].detail).toBeNull()
  })
})

describe('canCancelVideo', () => {
  // The upload cannot be aborted, so it is the point of no return.
  it('is true until the video is being saved', () => {
    expect(canCancelVideo(null)).toBe(true)
    expect(canCancelVideo({ stage: 'narrating', done: 0, total: 3 })).toBe(true)
    expect(canCancelVideo({ stage: 'encoding', done: 0, total: 1 })).toBe(true)
    expect(canCancelVideo({ stage: 'uploading', done: 0, total: 1 })).toBe(false)
  })
})
