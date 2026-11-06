import { lessonStatus, type LessonStatus } from './player'

/** One graded answer to a checkpoint question. Only `correct` is stored, never the key. */
export interface LessonAnswerRow {
  studentId: string
  questionId: string
  correct: boolean
}

export interface StudentProgress {
  studentId: string
  status: LessonStatus
  answered: number
  total: number
  /** The finished attempt's score, else null. */
  score: number | null
}

/** One row per listed student, in the order given. A student is finished once they have an attempt. */
export function studentProgress(
  studentIds: readonly string[],
  answers: readonly LessonAnswerRow[],
  attempts: readonly { studentId: string; score: number }[],
  total: number,
): StudentProgress[] {
  const answeredBy = new Map<string, number>()
  for (const a of answers) answeredBy.set(a.studentId, (answeredBy.get(a.studentId) ?? 0) + 1)
  const scoreBy = new Map<string, number>()
  for (const a of attempts) scoreBy.set(a.studentId, a.score)

  return studentIds.map((studentId) => {
    const answered = answeredBy.get(studentId) ?? 0
    const score = scoreBy.get(studentId)
    return {
      studentId,
      status: lessonStatus(answered, score !== undefined),
      answered,
      total,
      score: score ?? null,
    }
  })
}

export interface HardCheckpoint {
  questionId: string
  prompt: string
  slideNumber: number
  answered: number
  missed: number
  missRate: number
}

/** Questions that were answered at least once, hardest first; ties go to the earlier slide. */
export function hardestCheckpoints(
  answers: readonly LessonAnswerRow[],
  questions: readonly { id: string; prompt: string; slideNumber: number }[],
): HardCheckpoint[] {
  const tally = new Map<string, { answered: number; missed: number }>()
  for (const a of answers) {
    const t = tally.get(a.questionId) ?? { answered: 0, missed: 0 }
    t.answered += 1
    if (!a.correct) t.missed += 1
    tally.set(a.questionId, t)
  }

  const result: HardCheckpoint[] = []
  for (const q of questions) {
    const t = tally.get(q.id)
    if (!t || t.answered === 0) continue
    result.push({
      questionId: q.id,
      prompt: q.prompt,
      slideNumber: q.slideNumber,
      answered: t.answered,
      missed: t.missed,
      missRate: t.missed / t.answered,
    })
  }
  return result.sort((a, b) => b.missRate - a.missRate || a.slideNumber - b.slideNumber)
}
