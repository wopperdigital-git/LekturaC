import type { VideoRecord } from '@/video/videoRecord'

export type LessonReadiness = 'ready' | 'no_deck' | 'no_video' | 'no_timings'

/** Whether a quiz can be posted as a lesson: it needs its deck and a video that knows where each slide sits. */
export function lessonReadiness(presentationId: string | null, video: VideoRecord | null): LessonReadiness {
  if (presentationId === null) return 'no_deck'
  if (video === null) return 'no_video'
  if (!video.slides || video.slides.length === 0) return 'no_timings'
  return 'ready'
}

export const READINESS_REASON: Record<Exclude<LessonReadiness, 'ready'>, string> = {
  no_deck: 'The deck for this quiz was deleted.',
  no_video: 'Make the narrated video first.',
  no_timings: 'Make the video again to use it in a lesson.',
}
