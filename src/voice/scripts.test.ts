import { describe, expect, it } from 'vitest'
import {
  PREVIEW_SENTENCES,
  READING_SCRIPTS,
  VOICE_LANGUAGES,
  isVoiceLanguage,
  previewTranscript,
} from './scripts'

const words = (text: string) => text.trim().split(/\s+/).length

describe('voice scripts', () => {
  it('ships six languages, each with a reading script and two preview sentences', () => {
    expect(VOICE_LANGUAGES.map((l) => l.code)).toEqual(['en', 'es', 'fr', 'de', 'pt', 'it'])
    for (const { code } of VOICE_LANGUAGES) {
      expect(READING_SCRIPTS[code].length).toBeGreaterThan(0)
      expect(PREVIEW_SENTENCES[code]).toHaveLength(2)
    }
  })

  // About 20 seconds read aloud (TARGET_CLIP_SECONDS): ~50 words at a teaching pace, well inside the cap.
  it('keeps every reading script to roughly twenty seconds', () => {
    for (const { code } of VOICE_LANGUAGES) {
      const n = words(READING_SCRIPTS[code].replace(/ /g, ''))
      expect(n).toBeGreaterThanOrEqual(42)
      expect(n).toBeLessThanOrEqual(60)
    }
  })

  // A pangram is one flat sentence; the passage should make the reader ask, list and exclaim.
  it('gives every reading script a question, an exclamation and a list', () => {
    for (const { code } of VOICE_LANGUAGES) {
      const text = READING_SCRIPTS[code]
      expect(text).toContain('?')
      expect(text).toContain('!')
      expect(text).toContain(':')
    }
  })

  // "Two premade sentences": each entry is exactly one sentence, ending in one terminator.
  it('makes every preview exactly two single sentences', () => {
    for (const { code } of VOICE_LANGUAGES) {
      for (const sentence of PREVIEW_SENTENCES[code]) {
        expect(sentence).toMatch(/^[^.!?]+[.!?]$/)
      }
    }
  })

  it('joins the two sentences into the transcript that is spoken', () => {
    expect(previewTranscript('en')).toBe(
      'Hello, this is how your narration will sound. Every slide in your deck can be read aloud in this voice.',
    )
  })

  it('recognises only the shipped language codes', () => {
    expect(isVoiceLanguage('fr')).toBe(true)
    expect(isVoiceLanguage('ja')).toBe(false)
    expect(isVoiceLanguage(undefined)).toBe(false)
  })
})
