import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import { frameScale } from '@/video/timeline'
import { clipSlot, type ClipFrame } from './clipFrames'

/*
  Browser-only: decodes a talking clip with mediabunny and draws its pictures into the encoder's canvas,
  and draws the title card that stands in when a clip could not be made. Reached only through
  `import('@/video/generate')`, so none of it is in the entry bundle. The placement rules are in
  clipFrames.ts (tested); this file only applies them as frames stream in.
*/

export interface DecodedFrame extends ClipFrame {
  canvas: HTMLCanvasElement | OffscreenCanvas
}

export interface DecodedClip {
  /** Length of the picture, in seconds. */
  duration: number
  frames(): AsyncIterable<DecodedFrame>
  /** Frees the decoder. Safe to call more than once. */
  dispose(): void
}

/** The clip, ready to read, or `null` when it has no usable picture (nothing to decode, or too short to show). */
export async function openClip(blob: Blob): Promise<DecodedClip | null> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track || !(await track.canDecode())) {
      input.dispose()
      return null
    }
    const duration = await track.computeDuration()
    if (!(duration > 0)) {
      input.dispose()
      return null
    }
    const sink = new CanvasSink(track)
    return { duration, frames: () => sink.canvases(), dispose: () => input.dispose() }
  } catch (err) {
    console.warn('[avatar] the clip could not be read:', err)
    input.dispose()
    return null
  }
}

/**
 * Adds every picture of `clip` to the video, letterboxed on `background` (fit, never crop), so the
 * segment [startSeconds, startSeconds + durationSeconds) is covered whatever the clip's own length.
 * The encoder captures `target` at each `addFrame`, so a frame is drawn just before it is added.
 * Frames are streamed with one held back: only the last frame that starts inside the segment is
 * stretched to its end, and that is not known until the next frame (or the end) arrives.
 */
export async function encodeClip(o: {
  clip: DecodedClip
  target: HTMLCanvasElement
  background: string
  startSeconds: number
  durationSeconds: number
  addFrame(timestamp: number, duration: number): Promise<void>
  signal: AbortSignal
}): Promise<void> {
  const { clip, target, durationSeconds } = o
  const ctx = target.getContext('2d')
  if (!ctx) throw new Error('could not draw the talking clip')

  const emit = async (frame: DecodedFrame, index: number, isLast: boolean) => {
    const slot = clipSlot(frame, index, o.startSeconds, durationSeconds, isLast)
    const { width: sw, height: sh } = frame.canvas
    const scale = frameScale(sw, sh, target.width, target.height)
    const w = sw * scale
    const h = sh * scale
    ctx.fillStyle = o.background
    ctx.fillRect(0, 0, target.width, target.height)
    ctx.drawImage(frame.canvas, (target.width - w) / 2, (target.height - h) / 2, w, h)
    await o.addFrame(slot.timestamp, slot.duration)
  }

  let pending: { frame: DecodedFrame; index: number } | null = null
  let index = 0
  for await (const frame of clip.frames()) {
    if (o.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const here = index++
    if (frame.timestamp >= durationSeconds) break // the rest is past the segment
    if (pending) await emit(pending.frame, pending.index, false)
    pending = { frame, index: here }
  }
  if (!pending) throw new Error('the talking clip had no pictures')
  await emit(pending.frame, pending.index, true)
}

const TITLE_SIZE_PX = 64
const TITLE_MAX_LINES = 3
const TITLE_WIDTH_SHARE = 0.8

/** Breaks `text` into at most `maxLines` lines no wider than `maxWidth`, ending the last with an ellipsis if it was cut. */
function wrapTitle(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const fits = (s: string) => ctx.measureText(s).width <= maxWidth
  const clip = (s: string) => {
    if (fits(s)) return s
    let cut = s
    while (cut.length > 1 && !fits(`${cut}…`)) cut = cut.slice(0, -1)
    return `${cut.trimEnd()}…`
  }
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (fits(next) || !line) {
      line = next
      continue
    }
    lines.push(line)
    line = words[i]
    if (lines.length === maxLines - 1) {
      // The last line takes everything left, cut with an ellipsis if it is too long.
      return [...lines, clip([line, ...words.slice(i + 1)].join(' '))]
    }
  }
  if (line) lines.push(clip(line))
  return lines
}

/**
 * Draws the stand-in for a clip that could not be made: the deck title centred on the deep ground.
 * Synchronous: the caller loads the font first (`document.fonts.load`), or the first draw would use
 * the fallback face.
 */
export function drawTitleCard(
  target: HTMLCanvasElement,
  o: { title: string; background: string; foreground: string; font: string },
): void {
  const ctx = target.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = o.background
  ctx.fillRect(0, 0, target.width, target.height)
  ctx.fillStyle = o.foreground
  ctx.font = `${TITLE_SIZE_PX}px ${o.font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = wrapTitle(ctx, o.title.trim(), target.width * TITLE_WIDTH_SHARE, TITLE_MAX_LINES)
  const lineHeight = TITLE_SIZE_PX * 1.25
  const top = target.height / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, i) => ctx.fillText(line, target.width / 2, top + i * lineHeight))
}
