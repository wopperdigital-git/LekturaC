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
  silence(seconds: number, channels: number): AudioBuffer
}

export function createNarrator(voice: NarratorVoice): Narrator {
  const context = new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE)
  return {
    async narrate(text, signal) {
      const wav = await speak({
        voiceId: voice.voiceId,
        transcript: text,
        language: voice.language,
        speed: voice.speed,
        volume: voice.volume,
        emotion: voice.emotion,
        signal,
      })
      return context.decodeAudioData(await wav.arrayBuffer())
    },
    silence(seconds, channels) {
      return context.createBuffer(channels, Math.round(seconds * AUDIO_SAMPLE_RATE), AUDIO_SAMPLE_RATE)
    },
  }
}
