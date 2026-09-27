import { VideoError, type VideoStage } from './errors'
import { SILENT_SLIDE_SECONDS, frameSlots, planTimeline } from './timeline'
import type { VideoRecord } from './videoRecord'

/*
  The whole run, in order: narrate every slide, then draw and encode each one, then finish the
  file and save it. It knows nothing about the browser: narration, drawing, encoding and saving are
  handed in, so the rules that matter here (what a cancel leaves behind, which failure says what,
  that blank slides cost nothing) are tested against fakes.

  Cancelling before the upload writes nothing and leaves the deck's previous video alone. The upload
  cannot be aborted (the storage client takes no signal), so the start of `save` is the point of no
  return: once it has begun the run finishes it.
*/

/** What the pipeline needs to know about a piece of audio. A Web Audio `AudioBuffer` fits. */
export interface Clip {
  readonly duration: number
  readonly numberOfChannels: number
}

export interface Progress {
  stage: VideoStage
  done: number
  total: number
}

export interface VideoEncoderPort<A extends Clip> {
  start(): Promise<void>
  addAudio(clip: A): Promise<void>
  addFrame(timestamp: number, duration: number): Promise<void>
  /** Completes the file. After it resolves there is nothing left to cancel. */
  finish(): Promise<Blob>
  cancel(): Promise<void>
}

export interface PipelineDeps<A extends Clip> {
  narrate(text: string, signal: AbortSignal): Promise<A>
  silence(seconds: number, channels: number): A
  /** Draws slide `index` into the encoder's canvas. */
  drawSlide(index: number, signal: AbortSignal): Promise<void>
  encoder: VideoEncoderPort<A>
  /** Stores the file and points the deck at it. Throws `VideoError('uploading', ...)`. */
  save(blob: Blob, durationSeconds: number): Promise<VideoRecord>
}

export interface PipelineInput {
  /** Each slide's script, in deck order. Blank means a silent slide. */
  texts: readonly string[]
  signal: AbortSignal
  onProgress?: (p: Progress) => void
}

export type PipelineResult = { status: 'done'; record: VideoRecord } | { status: 'cancelled' }

/**
 * A narration shorter than this is not narration: the service returned nothing, or silence. It is
 * refused rather than trusted, because a slide's hold time comes from its audio and a zero-length
 * clip would leave the picture and the sound out of step for the rest of the video.
 */
export const MIN_NARRATION_SECONDS = 0.1

/** Thrown internally to unwind to the top on a cancel; never escapes `generateVideo`. */
class Cancelled extends Error {}

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'unknown error'
}

export async function generateVideo<A extends Clip>(
  input: PipelineInput,
  deps: PipelineDeps<A>,
): Promise<PipelineResult> {
  const { texts, signal } = input
  const total = texts.length
  const report = (stage: VideoStage, done: number, of: number) => input.onProgress?.({ stage, done, total: of })
  const check = () => {
    if (signal.aborted) throw new Cancelled()
  }
  /** Runs one step, turning its failure into a `VideoError` for `stage` (or a cancel, if cancelled). */
  async function step<T>(stage: VideoStage, what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (signal.aborted) throw new Cancelled()
      if (err instanceof VideoError) throw err
      throw new VideoError(stage, `${what}: ${messageOf(err)}`)
    }
  }

  if (total === 0) throw new VideoError('narrating', 'This deck has no slides.')

  // True from the moment the encoder is asked to start until its file is finished; while true, any
  // exit (failure or cancel) calls `cancel()` so nothing it allocated is left behind.
  let encoderRunning = false
  try {
    /* ---- narrate ---- */
    const narrated: (A | null)[] = []
    for (let i = 0; i < total; i++) {
      check()
      report('narrating', i, total)
      const text = texts[i].trim()
      if (text === '') {
        narrated.push(null)
        continue
      }
      const clip = await step('narrating', `Narrating slide ${i + 1} failed`, () => deps.narrate(text, signal))
      check()
      if (!(clip.duration >= MIN_NARRATION_SECONDS)) {
        throw new VideoError('narrating', `Narrating slide ${i + 1} failed: no audio came back.`)
      }
      narrated.push(clip)
    }
    report('narrating', total, total)

    // Silence takes the channel count of the real narration so every buffer in the track matches.
    const channels = narrated.find((c) => c !== null)?.numberOfChannels ?? 1
    const audio = narrated.map((c) => c ?? deps.silence(SILENT_SLIDE_SECONDS, channels))
    const timeline = planTimeline(audio.map((c) => c.duration))

    /* ---- draw and encode ---- */
    // Set before the call: a start that fails part-way may already hold an audio or video encoder.
    encoderRunning = true
    await step('encoding', 'Could not start the video', () => deps.encoder.start())
    for (const slide of timeline.slides) {
      check()
      report('rendering', slide.index, total)
      await step('rendering', `Could not draw slide ${slide.index + 1}`, () => deps.drawSlide(slide.index, signal))
      check()
      await step('encoding', `Could not encode slide ${slide.index + 1}`, async () => {
        await deps.encoder.addAudio(audio[slide.index])
        for (const slot of frameSlots(slide)) await deps.encoder.addFrame(slot.timestamp, slot.duration)
      })
    }
    report('rendering', total, total)

    /* ---- finish ---- */
    check()
    report('encoding', 0, 1)
    const blob = await step('encoding', 'Could not finish the video', () => deps.encoder.finish())
    // The file is complete: nothing is left to cancel, whatever happens next.
    encoderRunning = false
    report('encoding', 1, 1)

    // The last chance to cancel. Past here the upload runs to the end.
    check()

    /* ---- save ---- */
    report('uploading', 0, 1)
    let record: VideoRecord
    try {
      record = await deps.save(blob, timeline.totalSeconds)
    } catch (err) {
      throw err instanceof VideoError ? err : new VideoError('uploading', 'The video could not be saved. Try again.')
    }
    report('uploading', 1, 1)
    return { status: 'done', record }
  } catch (err) {
    if (err instanceof Cancelled) return { status: 'cancelled' }
    throw err
  } finally {
    if (encoderRunning) {
      try {
        await deps.encoder.cancel()
      } catch {
        // Already stopped, or a start that never got far enough to hold anything; nothing to release.
      }
    }
  }
}
