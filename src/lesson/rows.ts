import { parseVideo, type VideoRecord } from '@/video/videoRecord'
import {
  takeQuestionFrom,
  wordBoxesFrom,
  type PostingMode,
  type TakeQuestion,
  type TakeQuestionJson,
} from '@/quiz/rows'
import { fromDbSections, type QuizSection } from '@/quiz/types'

export type { PostingMode }

/*
  The lesson RPCs' JSON and the pairs read from `quiz_classes` / `lesson_progress`,
  mapped to app types. Pure, so the shapes the SQL promises are pinned by tests
  (supabase/migrations/0018_lessons.sql, `get_lesson_for_taking`).
*/

export interface LessonQuestion extends TakeQuestion {
  orderIndex: number
  /** The slide the question was written about; null when it has none (asked at the end). */
  cardId: string | null
}

export interface TakeLesson {
  quizId: string
  title: string
  className: string
  sections: QuizSection[]
  questions: LessonQuestion[]
  wordBoxes: Record<number, string[]>
  /** Null when the deck's video was removed or never made. */
  video: VideoRecord | null
  /** Question id to whether the student got it right. Never the answer itself. */
  answered: Map<string, boolean>
  watchedUntil: number
  /** Set once every checkpoint is answered and the attempt is scored. */
  finishedScore: number | null
}

interface LessonQuestionJson extends TakeQuestionJson {
  card_id?: string | null
}

interface LessonJson {
  id: string
  title: string
  quiz_type: string
  settings: unknown
  class_name?: string | null
  questions: LessonQuestionJson[]
  word_boxes?: unknown
  video?: unknown
  answers?: unknown
  watched_until?: unknown
  score?: unknown
}

/** PostgREST can hand a `numeric` back as a string. */
function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function answersFrom(raw: unknown): Map<string, boolean> {
  const out = new Map<string, boolean>()
  if (!Array.isArray(raw)) return out
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const a = item as { question_id?: unknown; correct?: unknown }
    if (typeof a.question_id === 'string' && typeof a.correct === 'boolean') out.set(a.question_id, a.correct)
  }
  return out
}

export function takeLessonFromJson(json: LessonJson): TakeLesson {
  const sections = fromDbSections(json.quiz_type, json.settings)
  return {
    quizId: json.id,
    title: json.title,
    className: json.class_name ?? '',
    sections,
    questions: [...json.questions]
      .sort((a, b) => a.order_index - b.order_index)
      .map((q) => ({
        ...takeQuestionFrom(q, sections),
        orderIndex: q.order_index,
        cardId: typeof q.card_id === 'string' ? q.card_id : null,
      })),
    wordBoxes: wordBoxesFrom(json, sections.length),
    video: parseVideo(json.video),
    answered: answersFrom(json.answers),
    watchedUntil: finiteNumber(json.watched_until) ?? 0,
    finishedScore: finiteNumber(json.score),
  }
}

/** A quiz posted to a class, as one set member. */
export function postingKey(quizId: string, classId: string): string {
  return `${quizId}|${classId}`
}

/**
 * The (quiz, class) pairs from a best-effort read: the lesson postings, or a student's started
 * lessons. An error reads as none, because before migration 0018 the column and tables are not
 * there and every posting is a quiz.
 */
export function lessonModesFrom(result: {
  data: { quiz_id: string; class_id: string }[] | null
  error: unknown
}): Set<string> {
  if (result.error || !result.data) return new Set()
  return new Set(result.data.map((r) => postingKey(r.quiz_id, r.class_id)))
}
