import { readFacePhoto, supabaseFacePorts } from '@/avatar/facePhoto'
import { isWavespeedConfigured } from '@/avatar/wavespeed'
import type { DecodedClip } from '@/avatar/drawClip'
import type { Card } from '@/engine/contentBlocks'
import type { TextStyle } from '@/engine/textStyle'
import { FACE_NOT_SET_UP } from '@/lib/setupCopy'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import type { VoiceSettings } from '@/voice/settingsRow'
import { VideoError } from './errors'
import { generateVideo, type BookendDeps, type PipelineBookends, type Progress } from './pipeline'
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

export type GenerateResult = { status: 'done'; view: VideoView; faceFailed: boolean } | { status: 'cancelled' }

export async function generateVideoForDeck(o: {
  deck: VideoDeck
  voice: VoiceSettings
  previous: VideoRecord | null
  /** The spoken intro and outro to animate with the saved face photo, or null for none. */
  face: { bookends: PipelineBookends } | null
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

  const [{ createEncoder, detectFormat }, { createNarrator }, { createSlideRenderer }, drawClip, talker] =
    await Promise.all([
      import('./encode'),
      import('./narrate'),
      import('./renderFrame'),
      o.face ? import('@/avatar/drawClip') : null,
      o.face ? import('@/avatar/talker') : null,
    ])

  // Before any Cartesia request: a browser that cannot encode must not spend the user's credits.
  const format = await detectFormat()
  if (!format) throw new VideoError('encoding', 'This browser cannot encode video. Try a recent Chrome, Edge or Safari.')

  // Also before any Cartesia request: a face that cannot be animated must not spend credits on narration.
  let photoUrl: string | null = null
  if (o.face) {
    if (!isWavespeedConfigured()) throw new VideoError('animating', FACE_NOT_SET_UP)
    const photo = await readFacePhoto(supabaseFacePorts(supabase), uid)
    if (!photo) throw new VideoError('animating', 'Add a photo of your face first.')
    photoUrl = photo.url
  }

  const encoder = createEncoder(format)
  const narrator = createNarrator({ ...o.voice, voiceId })
  const ports = supabasePorts(supabase)
  // Last before the `try`: this appends an off-screen host to the page and makes a React root, and
  // only the `finally` below disposes them, so nothing that can throw may sit between the two.
  const renderer = await createSlideRenderer({
    cards: o.deck.cards,
    theme: o.deck.theme,
    textStyle: o.deck.textStyle,
    target: encoder.canvas,
  })

  // Every clip decoded this run is freed when it ends, whether or not it was ever drawn.
  const openedClips: DecodedClip[] = []
  let bookends: BookendDeps<AudioBuffer, DecodedClip> | undefined
  if (o.face && drawClip && talker && photoUrl) {
    const talk = talker.createTalker({ photoUrl })
    const { colors, typography } = o.deck.theme
    bookends = {
      narrateWithFile: (text, signal) => narrator.narrateWithFile(text, signal),
      talk: async (file, signal) => {
        const clip = await talk.talk(file, signal)
        if (clip) openedClips.push(clip)
        return clip
      },
      encodeTalk: (clip, startSeconds, durationSeconds, signal) =>
        drawClip.encodeClip({
          clip,
          target: encoder.canvas,
          background: colors.deep,
          startSeconds,
          durationSeconds,
          addFrame: (timestamp, duration) => encoder.addFrame(timestamp, duration),
          signal,
        }),
      drawTitleCard: async () => {
        const font = typography.headingFont
        try {
          await document.fonts.load(`64px ${font}`)
        } catch {
          // A font that will not load draws in the fallback face, which is better than no title card.
        }
        drawClip.drawTitleCard(encoder.canvas, {
          title: o.deck.title,
          background: colors.deep,
          foreground: colors.deepForeground,
          font,
        })
      },
    }
  }

  try {
    const result = await generateVideo(
      {
        texts: o.deck.cards.map((c) => c.narration?.text ?? ''),
        cardIds: o.deck.cards.map((c) => c.id),
        signal: o.signal,
        onProgress: o.onProgress,
        bookends: o.face?.bookends,
      },
      {
        narrate: (text, signal) => narrator.narrate(text, signal),
        silence: (seconds, channels) => narrator.silence(seconds, channels),
        drawSlide: (index, signal) => renderer.draw(index, signal),
        encoder,
        bookends,
        save: (blob, durationSeconds, slides) =>
          saveVideo(ports, {
            uid,
            presentationId,
            blob,
            format,
            durationSeconds,
            slides,
            previous: o.previous,
          }),
      },
    )
    if (result.status === 'cancelled') return result

    // Fresh links for the video just saved, the same as reopening the modal would give.
    const view = await loadVideo(ports, presentationId, o.deck.title || 'presentation')
    return {
      status: 'done',
      view: view ?? { record: result.record, url: null, downloadUrl: null },
      faceFailed: result.faceFailed,
    }
  } finally {
    for (const clip of openedClips) clip.dispose()
    renderer.dispose()
  }
}
