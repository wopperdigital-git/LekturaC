import type { VideoStage } from './errors'
import type { Progress } from './pipeline'

/*
  The rules the modal draws, kept out of the component so they are tested: what stops the button,
  what the progress list says, and when Cancel is still possible.
*/

export interface BlockerInput {
  webCodecs: boolean
  hasDeck: boolean
  slideCount: number
  voiceChosen: boolean
}

/** Why Generate Presentation cannot be pressed, or `null`. The browser is named first: it is the hardest to fix. */
export function generateBlocker(i: BlockerInput): string | null {
  if (!i.webCodecs) return 'This browser cannot encode video. Try a recent Chrome, Edge or Safari.'
  if (!i.hasDeck) return 'Open a saved deck to make a video.'
  if (i.slideCount === 0) return 'This deck has no slides yet.'
  if (!i.voiceChosen) return 'Choose a voice first.'
  return null
}

const ORDER: VideoStage[] = ['narrating', 'rendering', 'encoding', 'uploading']

const LABELS: Record<VideoStage, string> = {
  narrating: 'Narrating slides',
  rendering: 'Drawing slides',
  encoding: 'Encoding video',
  uploading: 'Saving video',
}

export interface StageRow {
  stage: VideoStage
  label: string
  state: 'done' | 'active' | 'pending'
  detail: string | null
}

export function stageRows(progress: Progress | null): StageRow[] {
  const current = progress ? ORDER.indexOf(progress.stage) : -1
  return ORDER.map((stage, i) => ({
    stage,
    label: LABELS[stage],
    state: i < current ? 'done' : i === current ? 'active' : 'pending',
    detail: i === current && progress && progress.total > 1 ? `${progress.done}/${progress.total}` : null,
  }))
}

/** The upload cannot be aborted, so once the video is being saved the run is past the point of no return. */
export function canCancelVideo(progress: Progress | null): boolean {
  return progress?.stage !== 'uploading'
}
