import { db, rpcValue } from '@/classroom/api'
import { normalizeQuizCode } from '@/quiz/quizCode'
import { VIDEO_BUCKET } from '@/video/paths'
import { parseVideo, type VideoRecord } from '@/video/videoRecord'
import type { LessonAnswerRow } from './progress'
import { lessonModesFrom, takeLessonFromJson, type TakeLesson } from './rows'

/*
  Every lesson read and write; components never build a query (the rule
  `quiz/api.ts` follows). RPC refusals are rethrown as bare `Error`s carrying the
  SQL's sentence. The `quiz_classes.mode` column and the lesson tables exist only
  after migration 0018, so the plain reads below never throw: without it they
  report "nothing" and every posting is a quiz.
*/

const SIGNED_URL_SECONDS = 3600

const warned = new Set<string>()
/** Once per kind of failure, so a missing migration is not a console flood. */
function warnOnce(what: string, error: unknown): void {
  if (warned.has(what)) return
  warned.add(what)
  console.warn(`Could not read ${what} (is migration 0018 applied?).`, error)
}

export async function getLessonForTaking(code: string, classId: string): Promise<TakeLesson> {
  const client = await db()
  const json = rpcValue<Parameters<typeof takeLessonFromJson>[0]>(
    await client.rpc('get_lesson_for_taking', { p_code: normalizeQuizCode(code), p_class_id: classId }),
  )
  return takeLessonFromJson(json)
}

/** Reports the player's position; resolves to how far the server has credited. */
export async function lessonWatch(code: string, classId: string, position: number): Promise<number> {
  const client = await db()
  const result = rpcValue<{ watched_until: number | string }>(
    await client.rpc('lesson_watch', { p_code: normalizeQuizCode(code), p_class_id: classId, p_position: position }),
  )
  const n = Number(result.watched_until)
  return Number.isFinite(n) ? n : 0
}

export async function answerLessonCheckpoint(
  code: string,
  classId: string,
  questionId: string,
  answer: number | string | boolean,
): Promise<{ correct: boolean; finished: boolean; score: number | null }> {
  const client = await db()
  const result = rpcValue<{ correct: boolean; finished: boolean; score: number | string | null }>(
    await client.rpc('answer_lesson_checkpoint', {
      p_code: normalizeQuizCode(code),
      p_class_id: classId,
      p_question_id: questionId,
      p_answer: answer,
    }),
  )
  const score = result.score === null || result.score === undefined ? NaN : Number(result.score)
  return { correct: result.correct === true, finished: result.finished === true, score: Number.isFinite(score) ? score : null }
}

/** A link to the deck's video that works for an hour, or null when it can't be made. */
export async function lessonVideoUrl(path: string): Promise<string | null> {
  const client = await db()
  const { data, error } = await client.storage.from(VIDEO_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
  if (error) return null
  return data?.signedUrl ?? null
}

/** The postings made as lessons, as `quizId|classId` keys. Empty without 0018. */
export async function loadLessonModes(): Promise<Set<string>> {
  try {
    const client = await db()
    const result = await client.from('quiz_classes').select('quiz_id, class_id').eq('mode', 'lesson')
    if (result.error) warnOnce('lesson postings', result.error)
    return lessonModesFrom({ data: result.data, error: result.error })
  } catch (error) {
    warnOnce('lesson postings', error)
    return new Set()
  }
}

/** The lessons the signed-in student has started, as `quizId|classId` keys. Empty without 0018. */
export async function loadMyLessonStarts(): Promise<Set<string>> {
  try {
    const client = await db()
    const result = await client.from('lesson_progress').select('quiz_id, class_id')
    if (result.error) warnOnce('lesson progress', result.error)
    return lessonModesFrom({ data: result.data, error: result.error })
  } catch (error) {
    warnOnce('lesson progress', error)
    return new Set()
  }
}

/** Every student's answers to one posting, for the teacher's progress view. Empty without 0018. */
export async function loadLessonAnswers(quizId: string, classId: string): Promise<LessonAnswerRow[]> {
  try {
    const client = await db()
    const result = await client
      .from('lesson_answers')
      .select('student_id, question_id, correct')
      .eq('quiz_id', quizId)
      .eq('class_id', classId)
    if (result.error) {
      warnOnce('lesson answers', result.error)
      return []
    }
    return ((result.data ?? []) as { student_id: string; question_id: string; correct: boolean }[]).map((r) => ({
      studentId: r.student_id,
      questionId: r.question_id,
      correct: r.correct,
    }))
  } catch (error) {
    warnOnce('lesson answers', error)
    return []
  }
}

/** The owner's read of a deck's video record (what readiness is judged on). Null on any failure. */
export async function loadDeckVideo(presentationId: string): Promise<VideoRecord | null> {
  try {
    const client = await db()
    const result = await client.from('presentations').select('video').eq('id', presentationId).maybeSingle()
    if (result.error) {
      warnOnce('the deck video', result.error)
      return null
    }
    return parseVideo((result.data as { video?: unknown } | null)?.video)
  } catch (error) {
    warnOnce('the deck video', error)
    return null
  }
}
