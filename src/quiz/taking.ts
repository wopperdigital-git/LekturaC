import type { KeyValueStore } from '@/lib/temporaryInk'
import type { SubmittedAnswers } from './api'
import type { QuizType } from './types'

/*
  Pure rules for the student's quiz form. Nothing here knows the correct
  answers (students never receive them); it only decides what counts as
  "answered" and what gets sent.
*/

type Answer = SubmittedAnswers[string]

/** A choice index or a true/false pick is always an answer; typed text must have a non-space character. */
export function isAnswered(answer: Answer | undefined): boolean {
  if (answer === undefined) return false
  if (typeof answer === 'string') return answer.trim().length > 0
  return true
}

export function allAnswered(questions: readonly { id: string }[], answers: SubmittedAnswers): boolean {
  return questions.length > 0 && questions.every((q) => isAnswered(answers[q.id]))
}

/** Only this quiz's questions, in order, so a stale key can never ride along. */
export function buildAnswers(questions: readonly { id: string }[], answers: SubmittedAnswers): SubmittedAnswers {
  const out: SubmittedAnswers = {}
  for (const q of questions) {
    const a = answers[q.id]
    if (a !== undefined) out[q.id] = a
  }
  return out
}

/** The class a student starts on: the first one not yet submitted, else the first. `null` when there are none. */
export function defaultClassId(classes: readonly { id: string; attempted: boolean }[]): string | null {
  return (classes.find((c) => !c.attempted) ?? classes[0])?.id ?? null
}

/** The first question, in order, with no answer yet; `null` when every one has one. */
export function firstUnanswered(questions: readonly { id: string }[], answers: SubmittedAnswers): string | null {
  return questions.find((q) => !isAnswered(answers[q.id]))?.id ?? null
}

/*
  Answers kept in this browser while the student works, so a reload or a stray
  click away does not wipe them; cleared once the quiz is submitted. The rules are
  `briefDrafts`': the key is namespaced by user, because `signOut()` clears only
  the Supabase session and a shared key would hand one student's answers to the
  next on a shared machine, and there is no key at all while the session hydrates
  (no un-namespaced fallback).
*/

/** The storage key, or `null` while the user is unknown. */
export function quizAnswersKey(userId: string | null, quizId: string): string | null {
  return userId ? `lekturac:quiz-answers:${userId}:${quizId}` : null
}

/** Whether `value` is still a possible answer to `question` (the quiz may have changed since it was saved). */
function fits(question: { type: QuizType; choices: readonly string[] }, value: unknown): value is Answer {
  switch (question.type) {
    case 'multiple_choice':
      return Number.isInteger(value) && (value as number) >= 0 && (value as number) < question.choices.length
    case 'true_false':
      return typeof value === 'boolean'
    case 'fill_blank':
      return typeof value === 'string'
  }
}

/** The answers saved for this quiz that still fit its questions; `{}` on any failure. */
export function readSavedAnswers(
  store: KeyValueStore,
  userId: string | null,
  quizId: string,
  questions: readonly { id: string; type: QuizType; choices: readonly string[] }[],
): SubmittedAnswers {
  const key = quizAnswersKey(userId, quizId)
  if (!key) return {}
  try {
    const raw = store.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const saved = parsed as Record<string, unknown>
    const out: SubmittedAnswers = {}
    for (const q of questions) {
      const value = saved[q.id]
      if (fits(q, value)) out[q.id] = value
    }
    return out
  } catch {
    return {}
  }
}

/** Saves the answers (removing the key when there are none). `false` when they are not being kept. */
export function saveAnswers(
  store: KeyValueStore,
  userId: string | null,
  quizId: string,
  answers: SubmittedAnswers,
): boolean {
  const key = quizAnswersKey(userId, quizId)
  if (!key) return false
  try {
    if (Object.keys(answers).length === 0) store.removeItem(key)
    else store.setItem(key, JSON.stringify(answers))
    return true
  } catch {
    return false
  }
}

export function clearSavedAnswers(store: KeyValueStore, userId: string | null, quizId: string): void {
  saveAnswers(store, userId, quizId, {})
}

/**
 * Whether a failed submit is `submit_quiz_attempt`'s one-attempt refusal (migration 0016's wording),
 * which is what a retry meets after a submit whose reply was lost, or one sent from another tab.
 */
export function isAlreadySubmitted(message: string): boolean {
  return message.includes('already submitted')
}

const CHOICE_LETTERS = 'ABCD'

/**
 * What the student answered, in words, for the result review: "B. Jupiter", "True", or the
 * typed text. `null` when there is nothing to show (no answer, blank text, or a value that
 * does not fit the question). Never the correct answer: the page does not have it.
 */
export function answerText(
  question: { type: QuizType; choices: readonly string[] },
  answer: Answer | undefined,
): string | null {
  switch (question.type) {
    case 'multiple_choice': {
      if (typeof answer !== 'number') return null
      const choice = question.choices[answer]
      return choice === undefined ? null : `${CHOICE_LETTERS[answer] ?? answer + 1}. ${choice}`
    }
    case 'true_false':
      return typeof answer === 'boolean' ? (answer ? 'True' : 'False') : null
    case 'fill_blank':
      return typeof answer === 'string' && answer.trim() ? answer.trim() : null
  }
}
