import type { VoiceLanguage } from './scripts'

/*
  The rules about a recording that need no browser: how long, what format, when a clip
  is good enough to clone. Kept apart from `recorder.ts` (which touches the microphone)
  so they can be tested without one.
*/

/** Cartesia's instant clone works from about 3-10 s of clean audio. */
export const MIN_CLIP_SECONDS = 3
/** Recording stops by itself here: a longer clip adds nothing and invites background noise. */
export const MAX_CLIP_SECONDS = 15
export const MAX_NAME_LENGTH = 60

/* Formats Cartesia accepts (flac, mp3, mpeg, mpga, oga, ogg, wav, webm), best first. Safari's
   mp4/aac is not among them, so a browser that can only produce it is reported as unable. */
const CANDIDATE_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']

export function pickRecordingMime(isSupported: (mime: string) => boolean): string | null {
  return CANDIDATE_MIMES.find((mime) => isSupported(mime)) ?? null
}

/** `m:ss` from a number of seconds, rounded down; never negative. */
export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function canClone({ clipSeconds, name }: { clipSeconds: number; name: string }): boolean {
  const trimmed = name.trim()
  return clipSeconds >= MIN_CLIP_SECONDS && trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH
}

/** Cartesia reads the format from the upload's extension, so name it after what it is. */
export function clipFileName(mime: string): string {
  return mime.startsWith('audio/ogg') ? 'voice.ogg' : 'voice.webm'
}

export type RecState = 'idle' | 'starting' | 'recording' | 'recorded'

/**
 * Can a new recording be started right now?
 *
 * Not while a clone is in flight: finishing a clone clears the recording state, so a take
 * started meanwhile would be left running with its Stop button gone and its microphone
 * held. Not while one is already starting or running either.
 */
export function canRecord(s: {
  ready: boolean
  configured: boolean
  supported: boolean
  recState: RecState
  cloning: boolean
}): boolean {
  return s.ready && s.configured && s.supported && !s.cloning && (s.recState === 'idle' || s.recState === 'recorded')
}

/**
 * The language to tell Cartesia a clip is in: the one it was recorded in. The picker can be
 * changed after recording (to browse other voices), and sending the clip under a different
 * language than it was read in is the wrong-result case the language rules exist to prevent.
 */
export function languageForClone(recordedIn: VoiceLanguage | null, selected: VoiceLanguage): VoiceLanguage {
  return recordedIn ?? selected
}
