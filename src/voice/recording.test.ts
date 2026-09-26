import { describe, expect, it } from 'vitest'
import {
  MAX_NAME_LENGTH,
  MIN_CLIP_SECONDS,
  canClone,
  canRecord,
  clipFileName,
  formatClock,
  languageForClone,
  pickRecordingMime,
} from './recording'

describe('pickRecordingMime', () => {
  it('prefers webm with opus, then webm, then ogg', () => {
    expect(pickRecordingMime(() => true)).toBe('audio/webm;codecs=opus')
    expect(pickRecordingMime((m) => m === 'audio/webm')).toBe('audio/webm')
    expect(pickRecordingMime((m) => m.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus')
  })

  // Safari records mp4/aac, which Cartesia does not accept: report "cannot", do not send it.
  it('returns null when only unsupported formats (mp4) are available', () => {
    expect(pickRecordingMime((m) => m === 'audio/mp4')).toBeNull()
    expect(pickRecordingMime(() => false)).toBeNull()
  })
})

describe('formatClock', () => {
  it('formats seconds as m:ss, rounding down', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(7.9)).toBe('0:07')
    expect(formatClock(65)).toBe('1:05')
  })

  it('never shows a negative or non-numeric time', () => {
    expect(formatClock(-3)).toBe('0:00')
    expect(formatClock(Number.NaN)).toBe('0:00')
  })
})

describe('canClone', () => {
  it('needs a clip of at least the minimum length and a name', () => {
    expect(canClone({ clipSeconds: MIN_CLIP_SECONDS, name: 'My voice' })).toBe(true)
    expect(canClone({ clipSeconds: MIN_CLIP_SECONDS - 0.1, name: 'My voice' })).toBe(false)
  })

  it('refuses a blank or whitespace-only name', () => {
    expect(canClone({ clipSeconds: 8, name: '' })).toBe(false)
    expect(canClone({ clipSeconds: 8, name: '   ' })).toBe(false)
  })

  it('refuses a name longer than the limit', () => {
    expect(canClone({ clipSeconds: 8, name: 'x'.repeat(MAX_NAME_LENGTH) })).toBe(true)
    expect(canClone({ clipSeconds: 8, name: 'x'.repeat(MAX_NAME_LENGTH + 1) })).toBe(false)
  })
})

describe('clipFileName', () => {
  it('names the upload after the format it is in', () => {
    expect(clipFileName('audio/webm;codecs=opus')).toBe('voice.webm')
    expect(clipFileName('audio/ogg;codecs=opus')).toBe('voice.ogg')
    expect(clipFileName('')).toBe('voice.webm')
  })
})

describe('canRecord', () => {
  const ok = { ready: true, configured: true, supported: true, recState: 'idle' as const, cloning: false }

  it('is true when everything is in order, and for a second take after a recording', () => {
    expect(canRecord(ok)).toBe(true)
    expect(canRecord({ ...ok, recState: 'recorded' })).toBe(true)
  })

  // A new recording started while a clone is in flight is orphaned when the clone finishes:
  // the clone clears the recording state, the recorder keeps holding the microphone.
  it('is false while a clone is in flight', () => {
    expect(canRecord({ ...ok, cloning: true })).toBe(false)
  })

  it('is false while a recording is starting or running', () => {
    expect(canRecord({ ...ok, recState: 'starting' })).toBe(false)
    expect(canRecord({ ...ok, recState: 'recording' })).toBe(false)
  })

  it('is false before the voice has loaded, without a key, or where recording is unsupported', () => {
    expect(canRecord({ ...ok, ready: false })).toBe(false)
    expect(canRecord({ ...ok, configured: false })).toBe(false)
    expect(canRecord({ ...ok, supported: false })).toBe(false)
  })
})

describe('languageForClone', () => {
  // The clip is in the language it was read in, whatever the language picker says now.
  it('uses the language the clip was recorded in, not the one selected since', () => {
    expect(languageForClone('en', 'es')).toBe('en')
  })

  it('falls back to the selected language when there is no record of one', () => {
    expect(languageForClone(null, 'fr')).toBe('fr')
  })
})
