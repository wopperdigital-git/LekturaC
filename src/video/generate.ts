import type { Card } from '@/engine/contentBlocks'
import type { TextStyle } from '@/engine/textStyle'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import type { VoiceSettings } from '@/voice/settingsRow'
import { VideoError } from './errors'
import { generateVideo, type Progress } from './pipeline'
import { loadVideo, saveVideo, supabasePorts, type VideoView } from './storage'
import type { VideoRecord } from './videoRecord'

/*
  The one door into the video code. The modal `import()`s this file only when Generate Presentation
  is pressed, and this file `import()`s the three that pull in the encoder library and the
  rasteriser, so none of it is downloaded until then. It wires the real narrator, renderer,
  encoder and storage into the pipeline; every rule is in pipeline.ts and storage.ts.
*/

/** What the modal needs to know about the deck. `cards` must already be sorted by `orderIndex`. */
export interface VideoDeck {
  presentationId: string | null
  title: string
  cards: readonly Card[]
  theme: ThemeTokens
  textStyle: TextStyle
}

export type GenerateResult = { status: 'done'; view: VideoView } | { status: 'cancelled' }

export async function generateVideoForDeck(o: {
  deck: VideoDeck
  voice: VoiceSettings
  previous: VideoRecord | null
  signal: AbortSignal
  onProgress?: (p: Progress) => void
}): Promise<GenerateResult> {
  const uid = useAuthStore.getState().user?.id
  const { presentationId } = o.deck
  if (!supabase || !uid || !presentationId) {
    throw new VideoError('uploading', 'Sign in and open a saved deck to make a video.')
  }
  const { voiceId } = o.voice
  if (!voiceId) throw new VideoError('narrating', 'Choose a voice first.')

  const [{ createEncoder, detectFormat }, { createNarrator }, { createSlideRenderer }] = await Promise.all([
    import('./encode'),
    import('./narrate'),
    import('./renderFrame'),
  ])

  // Before any Cartesia request: a browser that cannot encode must not spend the user's credits.
  const format = await detectFormat()
  if (!format) throw new VideoError('encoding', 'This browser cannot encode video. Try a recent Chrome, Edge or Safari.')

  const encoder = createEncoder(format)
  const renderer = await createSlideRenderer({
    cards: o.deck.cards,
    theme: o.deck.theme,
    textStyle: o.deck.textStyle,
    target: encoder.canvas,
  })
  const narrator = createNarrator({ ...o.voice, voiceId })
  const ports = supabasePorts(supabase)

  try {
    const result = await generateVideo(
      {
        texts: o.deck.cards.map((c) => c.narration?.text ?? ''),
        signal: o.signal,
        onProgress: o.onProgress,
      },
      {
        narrate: (text, signal) => narrator.narrate(text, signal),
        silence: (seconds, channels) => narrator.silence(seconds, channels),
        drawSlide: (index, signal) => renderer.draw(index, signal),
        encoder,
        save: (blob, durationSeconds) =>
          saveVideo(ports, {
            uid,
            presentationId,
            blob,
            format,
            durationSeconds,
            previous: o.previous,
          }),
      },
    )
    if (result.status === 'cancelled') return result

    // Fresh links for the video just saved, the same as reopening the modal would give.
    const view = await loadVideo(ports, presentationId, o.deck.title || 'presentation')
    return { status: 'done', view: view ?? { record: result.record, url: null, downloadUrl: null } }
  } finally {
    renderer.dispose()
  }
}
