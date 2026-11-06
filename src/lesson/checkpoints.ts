import type { VideoSlideTiming } from '@/video/videoRecord'

export interface CheckpointQuestion {
  id: string
  orderIndex: number
  cardId: string | null
}

/** `slideIndex` is null for a question asked at the end of the video. */
export interface Stop {
  questionId: string
  atSeconds: number
  slideIndex: number | null
}

/** When the video ends: the last slide's start plus duration, 0 for none. */
export function videoEnd(slides: readonly VideoSlideTiming[]): number {
  const last = slides[slides.length - 1]
  return last ? last.startSeconds + last.durationSeconds : 0
}

/**
 * Where the video pauses for each question. A question pauses right after the
 * slide its `cardId` names; one with no card, or a card that is no longer in
 * the video, is asked at the end.
 *
 * Order (the SQL in migration 0018 must mirror this exactly): placed stops by
 * (slide position, orderIndex), then unplaced stops by orderIndex. No question
 * is dropped or repeated.
 */
export function placeCheckpoints(
  questions: readonly CheckpointQuestion[],
  slides: readonly VideoSlideTiming[],
): Stop[] {
  const end = videoEnd(slides)
  const slideIndexByCard = new Map<string, number>()
  slides.forEach((slide, index) => {
    if (!slideIndexByCard.has(slide.cardId)) slideIndexByCard.set(slide.cardId, index)
  })

  const placed: Array<Stop & { orderIndex: number }> = []
  const unplaced: Array<Stop & { orderIndex: number }> = []
  for (const q of questions) {
    const slideIndex = q.cardId === null ? undefined : slideIndexByCard.get(q.cardId)
    if (slideIndex === undefined) {
      unplaced.push({ questionId: q.id, atSeconds: end, slideIndex: null, orderIndex: q.orderIndex })
    } else {
      const slide = slides[slideIndex]
      placed.push({
        questionId: q.id,
        atSeconds: slide.startSeconds + slide.durationSeconds,
        slideIndex,
        orderIndex: q.orderIndex,
      })
    }
  }

  placed.sort((a, b) => a.slideIndex! - b.slideIndex! || a.orderIndex - b.orderIndex)
  unplaced.sort((a, b) => a.orderIndex - b.orderIndex)
  return [...placed, ...unplaced].map(({ questionId, atSeconds, slideIndex }) => ({
    questionId,
    atSeconds,
    slideIndex,
  }))
}
