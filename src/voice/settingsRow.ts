import { DEFAULT_LANGUAGE, isVoiceLanguage, type VoiceLanguage } from './scripts'

/* Cartesia's documented limits for `generation_config`. */
export const MIN_SPEED = 0.6
export const MAX_SPEED = 1.5
export const SPEED_STEP = 0.05
export const MIN_VOLUME = 0.5
export const MAX_VOLUME = 2.0
export const VOLUME_STEP = 0.05

/** Cartesia's full emotion list (English only). The first six are the ones it recommends. */
export const EMOTIONS = [
  'neutral', 'calm', 'angry', 'content', 'sad', 'scared',
  'happy', 'excited', 'enthusiastic', 'elated', 'euphoric', 'triumphant', 'amazed', 'surprised',
  'flirtatious', 'curious', 'peaceful', 'serene', 'grateful', 'affectionate', 'trust',
  'sympathetic', 'anticipation', 'mysterious', 'mad', 'outraged', 'frustrated', 'agitated',
  'threatened', 'disgusted', 'contempt', 'envious', 'sarcastic', 'ironic', 'dejected',
  'melancholic', 'disappointed', 'hurt', 'guilty', 'bored', 'tired', 'rejected', 'nostalgic',
  'wistful', 'apologetic', 'hesitant', 'insecure', 'confused', 'resigned', 'anxious', 'panicked',
  'alarmed', 'proud', 'confident', 'distant', 'skeptical', 'contemplative', 'determined',
] as const

export type Emotion = (typeof EMOTIONS)[number]

export function isEmotion(value: unknown): value is Emotion {
  return typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value)
}

export type VoiceSource = 'premade' | 'cloned'

export interface VoiceSettings {
  voiceId: string | null
  voiceName: string | null
  voiceSource: VoiceSource | null
  language: VoiceLanguage
  speed: number
  volume: number
  emotion: Emotion | null
}

export const DEFAULT_SETTINGS: VoiceSettings = {
  voiceId: null,
  voiceName: null,
  voiceSource: null,
  language: DEFAULT_LANGUAGE,
  speed: 1,
  volume: 1,
  emotion: null,
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return 1
  // Two decimals: a slider step of 0.05 accumulates float noise otherwise.
  return Math.round(Math.min(Math.max(n, min), max) * 100) / 100
}

export const clampSpeed = (n: number) => clamp(n, MIN_SPEED, MAX_SPEED)
export const clampVolume = (n: number) => clamp(n, MIN_VOLUME, MAX_VOLUME)

/** The `voice_settings` row, as the database names it. */
export interface VoiceSettingsRow {
  voice_id: string | null
  voice_name: string | null
  voice_source: VoiceSource | null
  language: string
  speed: number
  volume: number
  emotion: string | null
}

/**
 * Reads whatever the database returned, repairing rather than trusting it: an unknown
 * language becomes English, out-of-range numbers are clamped, an unknown emotion or
 * source is dropped, and a row with no voice id is no voice at all.
 */
export function settingsFromRow(raw: unknown): VoiceSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS }
  const row = raw as Record<string, unknown>

  const voiceId = typeof row.voice_id === 'string' && row.voice_id !== '' ? row.voice_id : null
  const source = row.voice_source === 'premade' || row.voice_source === 'cloned' ? row.voice_source : null

  return {
    voiceId,
    voiceName: voiceId !== null && typeof row.voice_name === 'string' ? row.voice_name : null,
    voiceSource: voiceId !== null ? source : null,
    language: isVoiceLanguage(row.language) ? row.language : DEFAULT_LANGUAGE,
    // `numeric` columns can come back as strings; Number() takes both.
    speed: row.speed === undefined || row.speed === null ? 1 : clampSpeed(Number(row.speed)),
    volume: row.volume === undefined || row.volume === null ? 1 : clampVolume(Number(row.volume)),
    emotion: isEmotion(row.emotion) ? row.emotion : null,
  }
}

export function rowFromSettings(s: VoiceSettings): VoiceSettingsRow {
  return {
    voice_id: s.voiceId,
    voice_name: s.voiceName,
    voice_source: s.voiceSource,
    language: s.language,
    speed: clampSpeed(s.speed),
    volume: clampVolume(s.volume),
    emotion: s.emotion,
  }
}
