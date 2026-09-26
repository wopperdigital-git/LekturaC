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
