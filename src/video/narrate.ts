import { speak } from '@/voice/cartesia'
import type { VoiceSettings } from '@/voice/settingsRow'
import { AUDIO_SAMPLE_RATE } from './format'

/*
  Speech for a slide, as a Web Audio buffer, and silence for a slide with none. Thin on purpose:
  the rules about blank scripts and empty clips are in pipeline.ts.

  One OfflineAudioContext does both jobs: it decodes without the autoplay rules a live
  AudioContext has, and buffers made from it and buffers it decoded share one sample rate, which
  is what the encoder's audio track needs.
*/

export type NarratorVoice = VoiceSettings & { voiceId: string }

export interface Narrator {
  narrate(text: string, signal: AbortSignal): Promise<AudioBuffer>
  /** The same speech as `narrate`, plus the WAV it was decoded from (the talking face is animated from the file). */
  narrateWithFile(text: string, signal: AbortSignal): Promise<{ audio: AudioBuffer; file: Blob }>
  silence(seconds: number, channels: number): AudioBuffer
}

export function createNarrator(voice: NarratorVoice): Narrator {
  const context = new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE)
  async function narrateWithFile(text: string, signal: AbortSignal) {
    const file = await speak({
      voiceId: voice.voiceId,
      transcript: text,
      language: voice.language,
      speed: voice.speed,
      volume: voice.volume,
      emotion: voice.emotion,
      signal,
    })
    // decodeAudioData detaches the buffer it is given, not the Blob, so the file stays usable.
    const audio = await context.decodeAudioData(await file.arrayBuffer())
    return { audio, file }
  }

  return {
    async narrate(text, signal) {
      return (await narrateWithFile(text, signal)).audio
    },
    narrateWithFile,
    silence(seconds, channels) {
      return context.createBuffer(channels, Math.round(seconds * AUDIO_SAMPLE_RATE), AUDIO_SAMPLE_RATE)
    },
  }
}
