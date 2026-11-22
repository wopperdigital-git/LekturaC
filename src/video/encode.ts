import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny'
import { AUDIO_SAMPLE_RATE, chooseFormat, type VideoFormat } from './format'
import type { VideoEncoderPort } from './pipeline'
import { FRAME_HEIGHT, FRAME_WIDTH } from './timeline'

/*
  The encoder: pictures from a canvas and narration from AudioBuffers, muxed into one file in
  memory. This is the only file that imports the encoder library, and it is only ever reached
  through `import('./encode')` in generate.ts, so none of it is in the entry bundle.
*/

/** What `detectFormat` probes at; a `low` encode is never a harder ask for a browser than this. */
const PROBE_VIDEO_QUALITY = new Quality('medium')
const AUDIO_QUALITY = new Quality('medium')

/** Which format this browser can actually encode. `null`: none, and the run must not start. */
export async function detectFormat(): Promise<VideoFormat | null> {
  const video = { width: FRAME_WIDTH, height: FRAME_HEIGHT, quality: PROBE_VIDEO_QUALITY }
  const audio = { numberOfChannels: 1, sampleRate: AUDIO_SAMPLE_RATE, quality: AUDIO_QUALITY }
  const [avc, aac, vp9, opus] = await Promise.all([
    canEncodeVideo('avc', video),
    canEncodeAudio('aac', audio),
    canEncodeVideo('vp9', video),
    canEncodeAudio('opus', audio),
  ])
  return chooseFormat({ mp4: avc && aac, webm: vp9 && opus })
}

/** The encoder plus the canvas the slides are drawn into (each `addFrame` captures its current pixels). */
export interface CanvasEncoder extends VideoEncoderPort<AudioBuffer> {
  readonly canvas: HTMLCanvasElement
}

export function createEncoder(format: VideoFormat): CanvasEncoder {
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH
  canvas.height = FRAME_HEIGHT

  // The picture quality depends on the video's length, which is known only at `start`, so the
  // output and its tracks are built there. The canvas exists now: the slides are drawn into it.
  let output: Output<Mp4OutputFormat | WebMOutputFormat, BufferTarget> | null = null
  let video: CanvasSource | null = null
  let audio: AudioBufferSource | null = null
  const started = () => {
    if (!output || !video || !audio) throw new Error('the encoder was not started')
    return { output, video, audio }
  }

  return {
    canvas,
    async start(quality) {
      const out = new Output({
        format: format.container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
        target: new BufferTarget(),
      })
      const v = new CanvasSource(canvas, { codec: format.videoCodec, quality: new Quality(quality) })
      const a = new AudioBufferSource({ codec: format.audioCodec, quality: AUDIO_QUALITY })
      out.addVideoTrack(v)
      out.addAudioTrack(a)
      // Kept before `start` so a start that fails part-way can still be cancelled.
      output = out
      video = v
      audio = a
      await out.start()
    },
    addAudio: (clip) => started().audio.add(clip),
    addFrame: (timestamp, duration) => started().video.add(timestamp, duration),
    async finish() {
      const { output: out } = started()
      await out.finalize()
      const buffer = out.target.buffer
      if (!buffer) throw new Error('the encoder produced no file')
      return new Blob([buffer], { type: format.contentType })
    },
    async cancel() {
      // Nothing to release before `start`.
      await output?.cancel()
    },
  }
}
