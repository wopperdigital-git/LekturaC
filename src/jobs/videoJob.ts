import type { GenerateResult, VideoDeck } from '@/video/generate'
import { VideoError } from '@/video/errors'
import type { Progress } from '@/video/pipeline'
import { canCancelVideo } from '@/video/ui'
import type { VideoRecord } from '@/video/videoRecord'
import type { VoiceSettings } from '@/voice/settingsRow'
import { abortError, type JobSpec } from './jobsStore'
import { videoTimeline } from './timelines'

/*
  The narrated video, in the background: the run CloneVoiceModal used to own. `generate` is
  injected so this file never imports the encoder or the rasteriser (start.ts reaches them
  through `import()`). The upload cannot be aborted, so from then on the job is not cancellable.
*/

export interface VideoJobInput {
  deck: VideoDeck & { presentationId: string }
  voice: VoiceSettings
  previous: VideoRecord | null
}

export interface VideoJobDeps {
  generate(o: {
    deck: VideoDeck
    voice: VoiceSettings
    previous: VideoRecord | null
    signal: AbortSignal
    onProgress: (p: Progress) => void
  }): Promise<GenerateResult>
}

export function videoJobSpec(input: VideoJobInput, deps: VideoJobDeps): JobSpec {
  return {
    kind: 'video',
    deckId: input.deck.presentationId,
    title: input.deck.title,
    timeline: videoTimeline(null).timeline,
    async run({ signal, report }) {
      report({ ...videoTimeline(null), cancellable: true })
      const result = await deps.generate({
        deck: input.deck,
        voice: input.voice,
        previous: input.previous,
        signal,
        onProgress: (p) => report({ ...videoTimeline(p), cancellable: canCancelVideo(p) }),
      })
      if (result.status === 'cancelled') throw abortError()
      return { deckId: input.deck.presentationId }
    },
    describe: (err) => {
      if (err instanceof VideoError) return err.message
      console.error('[video]', err)
      return 'Something went wrong. Try again.'
    },
  }
}
