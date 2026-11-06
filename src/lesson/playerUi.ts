import type { VideoRecord } from '@/video/videoRecord'
import { groupBySection, type TakeQuestion } from '@/quiz/rows'
import type { QuizConfig } from '@/quiz/types'
import { clampSeek } from './player'
import type { TakeLesson } from './rows'

/*
  The small decisions behind the student's lesson player, kept out of the JSX so they are
  tested: whether there is a video to play, which refusals mean "watch more", where a seek
  lands, and what the checkpoint card needs for a question.
*/

/** The player reports where it is this often while the video plays (the server's cadence). */
export const HEARTBEAT_MS = 5000

/** The back button's jump. */
export const BACK_SECONDS = 10

/** A video the lesson can be played from: timings to place the stops, and a link to the file. */
export function hasUsableVideo(video: VideoRecord | null, url: string | null): boolean {
  return video !== null && (video.slides?.length ?? 0) > 0 && url !== null
}

/** The two sentences `answer_lesson_checkpoint` refuses with when the student is ahead of the video. */
const WATCH_REFUSALS = ['Watch up to this question first.', 'Answer the questions in order.']

export function isWatchRefusal(message: string): boolean {
  return WATCH_REFUSALS.includes(message.trim())
}

/** A click on the progress bar at `fraction` of its length, held to what has been watched. */
export function seekFromFraction(fraction: number, duration: number, watchedUntil: number): number {
  return clampSeek(fraction * duration, watchedUntil)
}

export function backTarget(time: number, watchedUntil: number): number {
  return clampSeek(time - BACK_SECONDS, watchedUntil)
}

export function progressFraction(time: number, duration: number): number {
  if (!(duration > 0) || !Number.isFinite(time)) return 0
  return Math.min(1, Math.max(0, time / duration))
}

/** m:ss */
export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export interface CheckpointContext {
  question: TakeQuestion
  config: QuizConfig
  /** Position within the question's own test (numbering restarts in each). */
  index: number
  words?: string[]
}

/** What the checkpoint card needs for one question: its test's config, word box and numbering. */
export function checkpointContext(lesson: TakeLesson, questionId: string): CheckpointContext | null {
  for (const { section, index: sectionIndex, questions } of groupBySection(lesson.sections, lesson.questions)) {
    const index = questions.findIndex((q) => q.id === questionId)
    if (index < 0) continue
    const words = lesson.wordBoxes[sectionIndex]
    return {
      question: questions[index],
      config: section.config,
      index,
      ...(words && words.length > 0 ? { words } : {}),
    }
  }
  return null
}
