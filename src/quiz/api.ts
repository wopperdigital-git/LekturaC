import { changed, db, many, rpcValue } from '@/classroom/api'
import {
  DECK_QUIZ_COLUMNS,
  OWNER_QUESTION_COLUMNS,
  OWNER_QUIZ_COLUMNS,
  deckQuizFromRow,
  ownerQuizFromRows,
  takeQuizFromJson,
  type DeckQuizRow,
  type DeckQuizSummary,
  type OwnerQuestionRow,
  type OwnerQuiz,
  type OwnerQuizRow,
  type TakeQuiz,
} from './rows'
import { normalizeQuizCode } from './quizCode'
import { toDbConfig, type QuizConfig, type QuizQuestionDraft } from './types'

/*
  Every quiz read and write. Components call these and never build a query —
  the rule `classroom/api.ts` and `briefDrafts.ts` follow — so the RLS and RPC
  assumptions live in one file. Conventions are the classroom ones: RPC refusals
  are rethrown as bare `Error`s (the SQL raises sentences meant for the user),
  and an update/delete that RLS turned into "0 rows" is an error, not success.
*/

export interface AttemptResult {
  score: number
  correct: number
  total: number
  results: boolean[]
}

/** Question id → what the student chose (index), typed (string) or picked (boolean). */
export type SubmittedAnswers = Record<string, number | string | boolean>

/** One `quiz_questions` row in the shape `create_quiz` reads. */
function questionJson(q: QuizQuestionDraft) {
  return {
    slide_number: q.slideNumber,
    slide_heading: q.slideHeading,
    card_id: q.cardId,
    prompt: q.prompt,
    choices: q.choices,
    answer: q.answer,
  }
}

export async function createQuiz(input: {
  presentationId: string
  title: string
  deckTitle: string
  config: QuizConfig
  questions: QuizQuestionDraft[]
}): Promise<{ id: string; code: string }> {
  const client = await db()
  const { quiz_type, settings } = toDbConfig(input.config)
  return rpcValue<{ id: string; code: string }>(
    await client.rpc('create_quiz', {
      p_presentation_id: input.presentationId,
      p_title: input.title,
      p_deck_title: input.deckTitle,
      p_quiz_type: quiz_type,
      p_settings: settings,
      p_questions: input.questions.map(questionJson),
    }),
  )
}

/** The quizzes made from one deck, newest first (RLS: the owner sees their own). */
export async function listQuizzesForDeck(presentationId: string): Promise<DeckQuizSummary[]> {
  const client = await db()
  return many<DeckQuizRow>(
    await client
      .from('quizzes')
      .select(DECK_QUIZ_COLUMNS)
      .eq('presentation_id', presentationId)
      .order('created_at', { ascending: false }),
  ).map(deckQuizFromRow)
}

/** A quiz with its answers, for the owner's preview and PDF. RLS refuses anyone else. */
export async function loadOwnerQuiz(quizId: string): Promise<OwnerQuiz> {
  const client = await db()
  const [quizResult, questionResult] = await Promise.all([
    client.from('quizzes').select(OWNER_QUIZ_COLUMNS).eq('id', quizId),
    client.from('quiz_questions').select(OWNER_QUESTION_COLUMNS).eq('quiz_id', quizId),
  ])
  const [quiz] = many<OwnerQuizRow>(quizResult)
  if (!quiz) throw new Error("That quiz isn't available.")
  return ownerQuizFromRows(quiz, many<OwnerQuestionRow>(questionResult))
}

export async function postQuiz(quizId: string, classId: string): Promise<void> {
  const client = await db()
  many(await client.from('quiz_classes').insert({ quiz_id: quizId, class_id: classId }).select('quiz_id'))
}

export async function unpostQuiz(quizId: string, classId: string): Promise<void> {
  const client = await db()
  changed(await client.from('quiz_classes').delete().eq('quiz_id', quizId).eq('class_id', classId).select('quiz_id'))
}

export async function getQuizForTaking(code: string): Promise<TakeQuiz> {
  const client = await db()
  const json = rpcValue<Parameters<typeof takeQuizFromJson>[0]>(
    await client.rpc('get_quiz_for_taking', { p_code: normalizeQuizCode(code) }),
  )
  return takeQuizFromJson(json)
}

export async function submitQuizAttempt(
  code: string,
  classId: string,
  answers: SubmittedAnswers,
): Promise<AttemptResult> {
  const client = await db()
  const result = rpcValue<{ score: number | string; correct: number; total: number; results: boolean[] }>(
    await client.rpc('submit_quiz_attempt', {
      p_code: normalizeQuizCode(code),
      p_class_id: classId,
      p_answers: answers,
    }),
  )
  return { score: Number(result.score), correct: result.correct, total: result.total, results: result.results }
}
