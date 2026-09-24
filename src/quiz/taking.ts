import type { SubmittedAnswers } from './api'

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
