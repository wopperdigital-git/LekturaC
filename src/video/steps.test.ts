import { describe, expect, it } from 'vitest'
import { VIDEO_STEPS, faceSummary, scriptPlan, slideList, soundSummary, stepAfter } from './steps'
import { SILENT_SLIDE_SECONDS } from './timeline'

describe('video steps', () => {
  it('runs voice, sound, intro & outro, video, numbered from 1', () => {
    expect(VIDEO_STEPS.map((s) => [s.n, s.id])).toEqual([
      [1, 'voice'],
      [2, 'sound'],
      [3, 'face'],
      [4, 'video'],
    ])
  })

  it('steps forward and back, stopping at either end', () => {
    expect(stepAfter('voice', 1)).toBe('sound')
    expect(stepAfter('video', -1)).toBe('face')
    expect(stepAfter('voice', -1)).toBeNull()
    expect(stepAfter('video', 1)).toBeNull()
  })
})

describe('soundSummary', () => {
  it('names speed and emotion in English', () => {
    expect(soundSummary({ speed: 1, emotion: null, language: 'en' })).toBe('1.00× · Default')
    expect(soundSummary({ speed: 1.2, emotion: 'excited', language: 'en' })).toBe('1.20× · Excited')
  })

  // Emotion is English only, and the dialog disables it in other languages.
  it('names only the speed in another language', () => {
    expect(soundSummary({ speed: 0.9, emotion: 'excited', language: 'fr' })).toBe('0.90×')
  })
})

describe('faceSummary', () => {
  it('says what the switch will do', () => {
    const base = { checking: false, configured: true, on: false, blocked: false }
    expect(faceSummary({ ...base, configured: false })).toBe('Not set up')
    expect(faceSummary({ ...base, checking: true })).toBe('Checking…')
    expect(faceSummary({ ...base, on: true })).toBe('On')
    expect(faceSummary({ ...base, blocked: true })).toBe('Needs setup')
    expect(faceSummary(base)).toBe('Off')
  })
})

describe('scriptPlan', () => {
  // 150 words per minute: 25 words is 10 seconds.
  const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')

  it('holds an empty slide for the silent length and lists it by number', () => {
    const plan = scriptPlan({ texts: [words(25), '  ', words(25)], speed: 1, bookends: null })
    expect(plan.slides).toBe(3)
    expect(plan.silent).toEqual([2])
    expect(plan.seconds).toBe(20 + SILENT_SLIDE_SECONDS)
  })

  it('shortens spoken slides at a faster speed, but not silent ones', () => {
    expect(scriptPlan({ texts: [words(25), ''], speed: 2, bookends: null }).seconds).toBe(5 + SILENT_SLIDE_SECONDS)
  })

  it('adds the intro and outro only when they will be made', () => {
    const texts = [words(25)]
    expect(scriptPlan({ texts, speed: 1, bookends: { intro: words(25), outro: '' } }).seconds).toBe(20)
    expect(scriptPlan({ texts, speed: 1, bookends: null }).seconds).toBe(10)
  })
})

describe('slideList', () => {
  it('names one, a few, or counts many', () => {
    expect(slideList([3])).toBe('Slide 3')
    expect(slideList([3, 5])).toBe('Slides 3 and 5')
    expect(slideList([2, 4, 7])).toBe('Slides 2, 4 and 7')
    expect(slideList([1, 2, 3, 4, 5, 6])).toBe('6 slides')
  })
})
