import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  EMOTIONS,
  MAX_SPEED,
  MAX_VOLUME,
  MIN_SPEED,
  MIN_VOLUME,
  canSaveVoice,
  clampSpeed,
  clampVolume,
  rowFromSettings,
  settingsFromRow,
} from './settingsRow'

describe('clamps', () => {
  it('keeps speed and volume inside Cartesia limits', () => {
    expect(clampSpeed(0.1)).toBe(MIN_SPEED)
    expect(clampSpeed(9)).toBe(MAX_SPEED)
    expect(clampVolume(0)).toBe(MIN_VOLUME)
    expect(clampVolume(9)).toBe(MAX_VOLUME)
  })

  it('rounds away float noise from a slider', () => {
    expect(clampSpeed(0.7000000000000001)).toBe(0.7)
  })

  it('falls back to 1 for a number that is not a number', () => {
    expect(clampSpeed(Number.NaN)).toBe(1)
    expect(clampVolume(Number.NaN)).toBe(1)
  })
})

describe('emotions', () => {
  it('lists the primary emotions and the full set', () => {
    for (const e of ['neutral', 'calm', 'angry', 'content', 'sad', 'scared', 'determined']) {
      expect(EMOTIONS).toContain(e)
    }
  })
})

describe('settingsFromRow', () => {
  it('reads a full row', () => {
    expect(
      settingsFromRow({
        voice_id: 'v1',
        voice_name: 'Skylar',
        voice_source: 'premade',
        language: 'fr',
        speed: 1.2,
        volume: 0.8,
        emotion: 'calm',
      }),
    ).toEqual({
      voiceId: 'v1',
      voiceName: 'Skylar',
      voiceSource: 'premade',
      language: 'fr',
      speed: 1.2,
      volume: 0.8,
      emotion: 'calm',
    })
  })

  it('reads a missing or malformed row as the defaults', () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_SETTINGS)
    expect(settingsFromRow('nope')).toEqual(DEFAULT_SETTINGS)
    expect(settingsFromRow({})).toEqual(DEFAULT_SETTINGS)
  })

  it('treats a row with no voice id as no voice at all', () => {
    const s = settingsFromRow({ voice_id: '', voice_name: 'Ghost', voice_source: 'cloned' })
    expect(s.voiceId).toBeNull()
    expect(s.voiceName).toBeNull()
    expect(s.voiceSource).toBeNull()
  })

  it('repairs out-of-range and unknown values instead of trusting them', () => {
    const s = settingsFromRow({
      voice_id: 'v1',
      language: 'ja',
      speed: 99,
      volume: '0.1',
      emotion: 'ecstatic-dragon',
      voice_source: 'stolen',
    })
    expect(s.language).toBe('en')
    expect(s.speed).toBe(MAX_SPEED)
    expect(s.volume).toBe(MIN_VOLUME)
    expect(s.emotion).toBeNull()
    expect(s.voiceSource).toBeNull()
  })

  it('round-trips through rowFromSettings', () => {
    const settings = { ...DEFAULT_SETTINGS, voiceId: 'v9', voiceName: 'Me', voiceSource: 'cloned' as const, speed: 1.1 }
    expect(settingsFromRow(rowFromSettings(settings))).toEqual(settings)
  })
})

describe('canSaveVoice', () => {
  it('needs the modal ready and the saved voice known', () => {
    expect(canSaveVoice({ ready: true, savedVoiceKnown: true, saving: false })).toBe(true)
    expect(canSaveVoice({ ready: false, savedVoiceKnown: true, saving: false })).toBe(false)
  })

  it('refuses while a save is in flight', () => {
    expect(canSaveVoice({ ready: true, savedVoiceKnown: true, saving: true })).toBe(false)
  })

  // A failed read leaves the defaults on screen; saving them would overwrite the stored voice.
  it('refuses when the saved voice could not be read', () => {
    expect(canSaveVoice({ ready: true, savedVoiceKnown: false, saving: false })).toBe(false)
  })
})
