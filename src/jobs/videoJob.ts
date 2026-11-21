import type { GenerateResult, VideoDeck } from '@/video/generate'
import { VideoError } from '@/video/errors'
import type { PipelineBookends, Progress } from '@/video/pipeline'
import { clipSeconds } from '@/avatar/costLine'
import { clipCost, formatUsd } from '@/avatar/bookends'
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
  /** The spoken intro and outro to animate with the user's face, or null for a video without them. */
  face: { bookends: PipelineBookends } | null
}

export interface VideoJobDeps {
  generate(o: {
    deck: VideoDeck
    voice: VoiceSettings
    previous: VideoRecord | null
    face: { bookends: PipelineBookends } | null
    signal: AbortSignal
    onProgress: (p: Progress) => void
  }): Promise<GenerateResult>
}

export const FACE_FAILED_NOTICE = 'A talking clip could not be made, so a title card was used instead.'

/** What "Try again" says for a job with talking clips: running it again bills WaveSpeed again. */
export function faceRetryLabel(bookends: PipelineBookends): string {
  // A blank box has no clip: clipSeconds is 0 and clipCost(0) is nothing.
  const cost = clipCost(clipSeconds(bookends.intro)) + clipCost(clipSeconds(bookends.outro))
  return `Try again (WaveSpeed bills about ${formatUsd(cost)} again)`
}

export function videoJobSpec(input: VideoJobInput, deps: VideoJobDeps): JobSpec {
  // The animating row exists only when a face clip is asked for; the timeline must agree everywhere.
  const withFace = input.face !== null
  return {
    kind: 'video',
    deckId: input.deck.presentationId,
    title: input.deck.title,
    timeline: videoTimeline(null, withFace).timeline,
    ...(input.face ? { retryLabel: faceRetryLabel(input.face.bookends) } : {}),
    async run({ signal, report }) {
      report({ ...videoTimeline(null, withFace), cancellable: true })
      const result = await deps.generate({
        deck: input.deck,
        voice: input.voice,
        previous: input.previous,
        face: input.face,
        signal,
        onProgress: (p) => report({ ...videoTimeline(p, withFace), cancellable: canCancelVideo(p) }),
      })
      if (result.status === 'cancelled') throw abortError()
      return { deckId: input.deck.presentationId, ...(result.faceFailed ? { notice: FACE_FAILED_NOTICE } : {}) }
    },
    describe: (err) => {
      if (err instanceof VideoError) return err.message
      console.error('[video]', err)
      return 'Something went wrong. Try again.'
    },
  }
}
