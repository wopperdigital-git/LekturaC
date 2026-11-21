/** The stages a run reports and can fail in, in order. `animating` only runs with a face intro or outro. */
export type VideoStage = 'narrating' | 'animating' | 'rendering' | 'encoding' | 'uploading'

/**
 * A failure with a message meant for the user. `message` is shown as it is, so every throw site
 * writes it as a sentence ("Narrating slide 3 failed: ...").
 */
export class VideoError extends Error {
  readonly stage: VideoStage

  constructor(stage: VideoStage, message: string) {
    super(message)
    this.name = 'VideoError'
    this.stage = stage
  }
}
