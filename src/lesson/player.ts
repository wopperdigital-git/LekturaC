import type { VideoSlideTiming } from '@/video/videoRecord'

import { videoEnd, type Stop } from './checkpoints'

/** A stop is due this long before its exact time, so the pause never lands a frame late. */
export const STOP_EPSILON_SECONDS = 0.25

/** Where a seek may land: no later than what the server has counted as watched. */
export function clampSeek(target: number, watchedUntil: number): number {
  return Math.max(0, Math.min(target, watchedUntil))
}

/** The first stop, in asking order, that has not been answered. */
export function firstUnanswered(stops: readonly Stop[], answered: ReadonlySet<string>): Stop | null {
  return stops.find((stop) => !answered.has(stop.questionId)) ?? null
}

/**
 * The stop to ask now: the first unanswered one, once playback is at or near
 * its time (or the video ended). Overshooting a stop still returns it, so the
 * questions are asked in order.
 */
export function dueStop(
  time: number,
  ended: boolean,
  stops: readonly Stop[],
  answered: ReadonlySet<string>,
): Stop | null {
  const next = firstUnanswered(stops, answered)
  if (!next) return null
  return ended || time >= next.atSeconds - STOP_EPSILON_SECONDS ? next : null
}

/**
 * Where playback resumes: 0 with nothing answered, else the start of the slide
 * after the latest answered stop (the one last in `stops` order); the end of the
 * video if that stop is unplaced or on the last slide.
 */
export function resumeTime(
  stops: readonly Stop[],
  answered: ReadonlySet<string>,
  slides: readonly VideoSlideTiming[],
): number {
  let latest: Stop | null = null
  for (const stop of stops) if (answered.has(stop.questionId)) latest = stop
  if (!latest) return 0
  const next = latest.slideIndex === null ? undefined : slides[latest.slideIndex + 1]
  return next ? next.startSeconds : videoEnd(slides)
}

export type LessonStatus = 'not_started' | 'in_progress' | 'finished'

export function lessonStatus(answeredCount: number, finished: boolean): LessonStatus {
  if (finished) return 'finished'
  return answeredCount > 0 ? 'in_progress' : 'not_started'
}
