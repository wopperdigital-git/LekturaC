import type { VideoSlideTiming } from '@/video/videoRecord'

import type { CheckpointQuestion } from './checkpoints'

/**
 * Shared test data for checkpoint placement. Task 5's SQL test copies this
 * verbatim (same ids, order indexes and timings), so keep it simple.
 *
 * Slides c1..c4 have durations 5/4/6/3 and contiguous starts 0/5/9/15, so
 * the video ends at 18. Questions: q1 and q4 share slide c3, q2 is on c1,
 * q6 on c4, q3 has no slide (null) and q5 names a slide that no longer
 * exists ('gone'); both of those are asked at the end.
 *
 * Expected placement: q2 at 5, q1 at 15, q4 at 15, q6 at 18, q3 at 18, q5 at 18.
 */
export const LESSON_FIXTURE: {
  slides: VideoSlideTiming[]
  questions: CheckpointQuestion[]
} = {
  slides: [
    { cardId: 'c1', startSeconds: 0, durationSeconds: 5 },
    { cardId: 'c2', startSeconds: 5, durationSeconds: 4 },
    { cardId: 'c3', startSeconds: 9, durationSeconds: 6 },
    { cardId: 'c4', startSeconds: 15, durationSeconds: 3 },
  ],
  questions: [
    { id: 'q1', orderIndex: 0, cardId: 'c3' },
    { id: 'q2', orderIndex: 1, cardId: 'c1' },
    { id: 'q3', orderIndex: 2, cardId: null },
    { id: 'q4', orderIndex: 3, cardId: 'c3' },
    { id: 'q5', orderIndex: 4, cardId: 'gone' },
    { id: 'q6', orderIndex: 5, cardId: 'c4' },
  ],
}
