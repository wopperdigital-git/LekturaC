import type { VideoStage } from './errors'
import type { Progress } from './pipeline'
import { FACE_NOT_SET_UP } from '@/lib/setupCopy'
import { canSaveVoice } from '@/voice/settingsRow'

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

export interface BookendsReadyInput {
  presentationId: string | null
  /** Whether the app talks to a database at all (the intro and outro are read from it). */
  hasDatabase: boolean
  /** The bookends store has finished reading. */
  loaded: boolean
  /** The deck the bookends store holds. */
  deckId: string | null
}

/**
 * Whether the deck's saved intro and outro have been read, so the cost line and Generate use the
 * user's words, not the starters. With no saved deck or no database there is nothing to wait for.
 */
export function bookendsReady(i: BookendsReadyInput): boolean {
  if (i.presentationId === null || !i.hasDatabase) return true
  return i.loaded && i.deckId === i.presentationId
}

/** Why Generate Presentation cannot be pressed, or `null`. The browser is named first: it is the hardest to fix. */
export function generateBlocker(i: BlockerInput): string | null {
  if (!i.webCodecs) return 'This browser cannot encode video. Try a recent Chrome, Edge or Safari.'
  if (!i.hasDeck) return 'Open a saved deck to make a video.'
  if (i.slideCount === 0) return 'This deck has no slides yet.'
  if (!i.voiceChosen) return 'Choose a voice first.'
  return null
}

export interface FaceBlockerInput {
  configured: boolean
  hasPhoto: boolean
  introText: string
  outroText: string
}

/** Why the face intro and outro cannot be switched on, or `null`. The site comes first: the user cannot fix it. */
export function faceBlocker(i: FaceBlockerInput): string | null {
  if (!i.configured) return FACE_NOT_SET_UP
  if (!i.hasPhoto) return 'Add a photo of your face first.'
  if (i.introText.trim() === '' && i.outroText.trim() === '') return 'Write an intro or an outro first.'
  return null
}

export type FaceRequest =
  | { kind: 'off' }
  | { kind: 'blocked'; message: string }
  | { kind: 'on'; bookends: { intro: string; outro: string } }

/**
 * What Generate does about the talking intro and outro. `effectiveOn` is the switch as the user saw it
 * when they pressed Generate (on, and nothing stopping it); `blockerNow` is the blocker worked out again
 * from the freshest intro and outro. A switch that was already off or blocked on screen never stops the
 * video: only one the user saw on that has since become impossible does, so it is not made without the face
 * in silence.
 */
export function faceRequest(o: {
  effectiveOn: boolean
  blockerNow: string | null
  intro: string
  outro: string
}): FaceRequest {
  if (!o.effectiveOn) return { kind: 'off' }
  if (o.blockerNow !== null) return { kind: 'blocked', message: o.blockerNow }
  return { kind: 'on', bookends: { intro: o.intro, outro: o.outro } }
}

export interface StartInput {
  configured: boolean
  blocker: string | null
  ready: boolean
  savedVoiceKnown: boolean
  saving: boolean
  generating: boolean
  cloning: boolean
  recording: boolean
}

/**
 * Whether Generate Presentation may be pressed. A clone that finishes mid-run calls `pick`, changing the
 * draft under a run that is already using the old voice, so a clone or a recording in progress stops it
 * too, on top of `canSaveVoice`'s own rules (the saved voice is read and known, no save under way).
 */
export function canStartGenerate(s: StartInput): boolean {
  return (
    s.configured &&
    s.blocker === null &&
    canSaveVoice({ ready: s.ready, savedVoiceKnown: s.savedVoiceKnown, saving: s.saving }) &&
    !s.generating &&
    !s.cloning &&
    !s.recording
  )
}

const ORDER: VideoStage[] = ['narrating', 'rendering', 'encoding', 'uploading']
const ORDER_WITH_FACE: VideoStage[] = ['narrating', 'animating', 'rendering', 'encoding', 'uploading']

const LABELS: Record<VideoStage, string> = {
  narrating: 'Narrating slides',
  animating: 'Animating your intro & outro',
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

/** The progress rows; the animating row is there only when the video has a face intro or outro. */
export function stageRows(progress: Progress | null, withFace = false): StageRow[] {
  const order = withFace ? ORDER_WITH_FACE : ORDER
  const current = progress ? order.indexOf(progress.stage) : -1
  return order.map((stage, i) => ({
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
