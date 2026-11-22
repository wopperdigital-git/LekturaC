import { VideoError, type VideoStage } from './errors'
import { encodeQualityFor, tooLongMessage, type EncodeQuality } from './sizeGuard'
import { SILENT_SLIDE_SECONDS, frameSlots, planTimeline, type SlideTiming } from './timeline'
import type { VideoRecord, VideoSlideTiming } from './videoRecord'

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
  /** Begins the file at this quality (chosen from the video's length so it fits the bucket). */
  start(quality: EncodeQuality): Promise<void>
  addAudio(clip: A): Promise<void>
  addFrame(timestamp: number, duration: number): Promise<void>
  /** Completes the file. After it resolves there is nothing left to cancel. */
  finish(): Promise<Blob>
  cancel(): Promise<void>
}

/**
 * What the face intro and outro need. `T` is whatever a finished talking clip is (the browser glue
 * decides); the pipeline only hands it back to `encodeTalk`.
 */
export interface BookendDeps<A extends Clip, T> {
  /** Narrates the text, returning the audio to put in the track and the same speech as a file to animate. */
  narrateWithFile(text: string, signal: AbortSignal): Promise<{ audio: A; file: Blob }>
  /** Animates the face to the speech. `null` is a failure that is not a cancel; a cancel rejects with an AbortError. */
  talk(file: Blob, signal: AbortSignal): Promise<T | null>
  /** Adds every picture for the segment through the encoder, sound excluded (the narration's audio is used). */
  encodeTalk(clip: T, startSeconds: number, durationSeconds: number, signal: AbortSignal): Promise<void>
  /** Draws the fallback picture, used when the clip failed, into the encoder's canvas. */
  drawTitleCard(signal: AbortSignal): Promise<void>
}

export interface PipelineDeps<A extends Clip, T = never> {
  narrate(text: string, signal: AbortSignal): Promise<A>
  silence(seconds: number, channels: number): A
  /** Draws slide `index` into the encoder's canvas. */
  drawSlide(index: number, signal: AbortSignal): Promise<void>
  encoder: VideoEncoderPort<A>
  /** Stores the file and points the deck at it. Throws `VideoError('uploading', ...)`. */
  save(blob: Blob, durationSeconds: number, slides: VideoSlideTiming[]): Promise<VideoRecord>
  /** Required whenever `input.bookends` has text. */
  bookends?: BookendDeps<A, T>
}

/** The spoken intro and outro, trimmed. `''` means no clip at that end. */
export interface PipelineBookends {
  intro: string
  outro: string
}

export interface PipelineInput {
  /** Each slide's script, in deck order. Blank means a silent slide. */
  texts: readonly string[]
  /** Each slide's card id, in the same order and number as `texts`. */
  cardIds: readonly string[]
  signal: AbortSignal
  onProgress?: (p: Progress) => void
  bookends?: PipelineBookends
}

export type PipelineResult =
  | { status: 'done'; record: VideoRecord; faceFailed: boolean }
  | { status: 'cancelled' }

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

type Bookend = 'intro' | 'outro'

interface Narrated<A> {
  audio: A
  file: Blob
}

export async function generateVideo<A extends Clip, T = never>(
  input: PipelineInput,
  deps: PipelineDeps<A, T>,
): Promise<PipelineResult> {
  const { texts, cardIds, signal } = input
  if (cardIds.length !== texts.length) {
    throw new RangeError(`Expected ${texts.length} card ids, got ${cardIds.length}.`)
  }
  const bookendTexts: Record<Bookend, string> = {
    intro: input.bookends?.intro.trim() ?? '',
    outro: input.bookends?.outro.trim() ?? '',
  }
  const wanted = (['intro', 'outro'] as const).filter((b) => bookendTexts[b] !== '')
  const bookendDeps = deps.bookends
  if (wanted.length > 0 && !bookendDeps) {
    throw new RangeError('An intro or outro was asked for, but no way to make one was given.')
  }
  const slideCount = texts.length
  const narratingTotal = wanted.length + slideCount
  const report = (stage: VideoStage, done: number, of: number) => input.onProgress?.({ stage, done, total: of })
  const check = () => {
    if (signal.aborted) throw new Cancelled()
  }
  /** Runs one step, turning its failure into a `VideoError` for `stage` (or a cancel, if cancelled). */
  async function step<R>(stage: VideoStage, what: string, fn: () => Promise<R>): Promise<R> {
    try {
      return await fn()
    } catch (err) {
      if (signal.aborted) throw new Cancelled()
      if (err instanceof VideoError) throw err
      throw new VideoError(stage, `${what}: ${messageOf(err)}`)
    }
  }

  if (slideCount === 0) throw new VideoError('narrating', 'This deck has no slides.')

  // The clips are made while the slides are narrated, and any early exit must stop them: this
  // signal follows the caller's and is also aborted when the run ends, so a clip nobody is waiting
  // for any more stops polling.
  const talkController = new AbortController()
  const onAbort = () => talkController.abort()
  signal.addEventListener('abort', onAbort)

  // True from the moment the encoder is asked to start until its file is finished; while true, any
  // exit (failure or cancel) calls `cancel()` so nothing it allocated is left behind.
  let encoderRunning = false
  try {
    /* ---- narrate: intro and outro first, so their clips can start while the slides are narrated ---- */
    let narratedCount = 0
    const bookendAudio: Partial<Record<Bookend, Narrated<A>>> = {}
    for (const which of wanted) {
      check()
      report('narrating', narratedCount, narratingTotal)
      const made = await step('narrating', `Narrating the ${which} failed`, () =>
        bookendDeps!.narrateWithFile(bookendTexts[which], signal),
      )
      check()
      if (!(made.audio.duration >= MIN_NARRATION_SECONDS)) {
        throw new VideoError('narrating', `Narrating the ${which} failed: no audio came back.`)
      }
      bookendAudio[which] = made
      narratedCount++
    }

    // Each clip starts now and is awaited later. The no-op handler sits on a separate branch of the
    // promise: it keeps an early exit (a failed slide, a cancel) from leaving an unhandled rejection,
    // while the original promise is still the one that is awaited.
    const talks: Partial<Record<Bookend, Promise<T | null>>> = {}
    for (const which of wanted) {
      const started = (async () => bookendDeps!.talk(bookendAudio[which]!.file, talkController.signal))()
      started.catch(() => {})
      talks[which] = started
    }

    const narrated: (A | null)[] = []
    for (let i = 0; i < slideCount; i++) {
      check()
      report('narrating', narratedCount + i, narratingTotal)
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
    report('narrating', narratingTotal, narratingTotal)

    /* ---- animate: wait for the clips ---- */
    const clips: Partial<Record<Bookend, T | null>> = {}
    if (wanted.length > 0) {
      for (let i = 0; i < wanted.length; i++) {
        check()
        report('animating', i, wanted.length)
        const which = wanted[i]
        try {
          clips[which] = await talks[which]!
        } catch {
          // A cancel unwinds; anything else is a failed clip, which falls back to a title card.
          check()
          clips[which] = null
        }
        check()
      }
      report('animating', wanted.length, wanted.length)
    }
    const faceFailed = wanted.some((b) => clips[b] === null)

    // Silence takes the channel count of the real narration so every buffer in the track matches.
    const channels =
      narrated.find((c) => c !== null)?.numberOfChannels ??
      bookendAudio.intro?.audio.numberOfChannels ??
      bookendAudio.outro?.audio.numberOfChannels ??
      1
    const slideAudio = narrated.map((c) => c ?? deps.silence(SILENT_SLIDE_SECONDS, channels))
    const timeline = planTimeline([
      ...(bookendAudio.intro ? [bookendAudio.intro.audio.duration] : []),
      ...slideAudio.map((c) => c.duration),
      ...(bookendAudio.outro ? [bookendAudio.outro.audio.duration] : []),
    ])
    const slideOffset = bookendAudio.intro ? 1 : 0
    const slideTimings = timeline.slides.slice(slideOffset, slideOffset + slideCount)

    // Before the encoder exists: a video too long for the bucket is refused with nothing to cancel.
    const quality = encodeQualityFor(timeline.totalSeconds)
    if (quality === null) throw new VideoError('encoding', tooLongMessage(timeline.totalSeconds))

    /* ---- draw and encode ---- */
    // Set before the call: a start that fails part-way may already hold an audio or video encoder.
    encoderRunning = true
    await step('encoding', 'Could not start the video', () => deps.encoder.start(quality))

    const encodeBookend = async (which: Bookend, at: SlideTiming) => {
      check()
      const audio = bookendAudio[which]!.audio
      const talk = clips[which] ?? null
      if (talk === null) {
        await step('rendering', `Could not draw the ${which} title card`, () => bookendDeps!.drawTitleCard(signal))
        check()
        await step('encoding', `Could not encode the ${which}`, async () => {
          await deps.encoder.addAudio(audio)
          for (const slot of frameSlots(at)) await deps.encoder.addFrame(slot.timestamp, slot.duration)
        })
      } else {
        // The clip's own sound is ignored: the narration's audio is what goes in the track.
        await step('encoding', `Could not encode the ${which}`, async () => {
          await deps.encoder.addAudio(audio)
          await bookendDeps!.encodeTalk(talk, at.startSeconds, at.durationSeconds, signal)
        })
      }
    }

    if (bookendAudio.intro) await encodeBookend('intro', timeline.slides[0])
    for (const slide of slideTimings) {
      const index = slide.index - slideOffset
      check()
      report('rendering', index, slideCount)
      await step('rendering', `Could not draw slide ${index + 1}`, () => deps.drawSlide(index, signal))
      check()
      await step('encoding', `Could not encode slide ${index + 1}`, async () => {
        await deps.encoder.addAudio(slideAudio[index])
        for (const slot of frameSlots(slide)) await deps.encoder.addFrame(slot.timestamp, slot.duration)
      })
    }
    report('rendering', slideCount, slideCount)
    if (bookendAudio.outro) await encodeBookend('outro', timeline.slides[timeline.slides.length - 1])

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
      // Only the slides are listed, offset by the intro: a lesson places its checkpoints from these.
      record = await deps.save(
        blob,
        timeline.totalSeconds,
        slideTimings.map((s) => ({
          cardId: cardIds[s.index - slideOffset],
          startSeconds: s.startSeconds,
          durationSeconds: s.durationSeconds,
        })),
      )
    } catch (err) {
      throw err instanceof VideoError ? err : new VideoError('uploading', 'The video could not be saved. Try again.')
    }
    report('uploading', 1, 1)
    return { status: 'done', record, faceFailed }
  } catch (err) {
    if (err instanceof Cancelled) return { status: 'cancelled' }
    throw err
  } finally {
    signal.removeEventListener('abort', onAbort)
    // A clip still being made is no use once the run is over.
    talkController.abort()
    if (encoderRunning) {
      try {
        await deps.encoder.cancel()
      } catch {
        // Already stopped, or a start that never got far enough to hold anything; nothing to release.
      }
    }
  }
}
