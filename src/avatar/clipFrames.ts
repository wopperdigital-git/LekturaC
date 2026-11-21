/*
  Where a talking clip's pictures go in the video. The clip is shorter or longer than its narration by
  a little (seen live: 2.92 s of picture for 3.0 s of sound), and the track has to match the sound
  exactly: frames past the segment are dropped and the last picture is held to the segment end, so
  picture and sound stay in step and every slide after it keeps its timing. Pure, so the rule is
  tested; drawClip.ts applies it as frames stream in.
*/

export interface ClipFrame {
  timestamp: number
  duration: number
}

export interface ClipSlot {
  /** The frame's index in the source clip. */
  index: number
  /** Where the picture starts in the whole video, in seconds. */
  timestamp: number
  duration: number
}

/**
 * The slot for one source frame. `isLast` marks the last frame that starts inside the segment: it is
 * stretched (or clamped) so it ends exactly at the segment end; any other frame is only clamped.
 */
export function clipSlot(
  frame: ClipFrame,
  index: number,
  segmentStart: number,
  segmentSeconds: number,
  isLast: boolean,
): ClipSlot {
  const room = segmentSeconds - frame.timestamp
  return {
    index,
    timestamp: segmentStart + frame.timestamp,
    duration: isLast ? room : Math.min(frame.duration, room),
  }
}

/** Every picture of a clip, placed in a segment of `segmentSeconds` starting at `segmentStart`. */
export function clipFrameSlots(
  frames: readonly ClipFrame[],
  segmentStart: number,
  segmentSeconds: number,
): ClipSlot[] {
  const kept: number[] = []
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].timestamp < segmentSeconds) kept.push(i)
  }
  return kept.map((index, n) => clipSlot(frames[index], index, segmentStart, segmentSeconds, n === kept.length - 1))
}
