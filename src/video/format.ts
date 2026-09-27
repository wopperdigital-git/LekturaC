/*
  Which file the browser can be asked to make. The pure half of the encoder set-up: the
  capability probe itself (`detectFormat`, in encode.ts) needs the encoder library, so it
  lives there and reports into `chooseFormat`.
*/

export type VideoContentType = 'video/mp4' | 'video/webm'
export type VideoExt = 'mp4' | 'webm'

export interface VideoFormat {
  container: VideoExt
  videoCodec: 'avc' | 'vp9'
  audioCodec: 'aac' | 'opus'
  ext: VideoExt
  contentType: VideoContentType
}

export const MP4_FORMAT: VideoFormat = {
  container: 'mp4',
  videoCodec: 'avc',
  audioCodec: 'aac',
  ext: 'mp4',
  contentType: 'video/mp4',
}

export const WEBM_FORMAT: VideoFormat = {
  container: 'webm',
  videoCodec: 'vp9',
  audioCodec: 'opus',
  ext: 'webm',
  contentType: 'video/webm',
}

export interface EncodeSupport {
  /** The browser can encode both H.264 and AAC. */
  mp4: boolean
  /** The browser can encode both VP9 and Opus. */
  webm: boolean
}

/** MP4 is what people can open anywhere, so it wins when both work. `null`: neither does. */
export function chooseFormat(support: EncodeSupport): VideoFormat | null {
  if (support.mp4) return MP4_FORMAT
  if (support.webm) return WEBM_FORMAT
  return null
}

/**
 * The cheap, synchronous half of the check: are the WebCodecs encoders there at all? The modal
 * uses this to disable its button without loading the encoder library. Whether a usable codec
 * *pair* exists is decided when a run starts (`detectFormat`).
 */
export function hasWebCodecs(
  scope: { VideoEncoder?: unknown; AudioEncoder?: unknown } = globalThis,
): boolean {
  return typeof scope.VideoEncoder === 'function' && typeof scope.AudioEncoder === 'function'
}

/** Narration is requested at this rate (see `speakBody`), and silent buffers are made at it. */
export const AUDIO_SAMPLE_RATE = 44100
