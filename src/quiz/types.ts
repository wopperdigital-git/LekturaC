/*
  Pure quiz vocabulary. Nothing here imports React, Supabase or `@/ai`: the
  provider layer imports *this*, never the reverse.
*/

export const MIN_QUIZ_ITEMS = 1
export const MAX_QUIZ_ITEMS = 20

export function clampItemCount(n: number): number {
  if (!Number.isFinite(n)) return MIN_QUIZ_ITEMS
  return Math.min(MAX_QUIZ_ITEMS, Math.max(MIN_QUIZ_ITEMS, Math.floor(n)))
}

export type QuizType = 'multiple_choice' | 'fill_blank' | 'true_false'

/** The type plus its one sub-option. The sub-option only changes presentation; scoring ignores it. */
export type QuizConfig =
  | { type: 'multiple_choice'; choiceCount: 3 | 4 }
  | { type: 'fill_blank'; wordBox: boolean }
  | { type: 'true_false'; notation: 'word' | 'letter' }

export const DEFAULT_CONFIGS: Record<QuizType, QuizConfig> = {
  multiple_choice: { type: 'multiple_choice', choiceCount: 4 },
  fill_blank: { type: 'fill_blank', wordBox: false },
  true_false: { type: 'true_false', notation: 'word' },
}

/** How a config is stored on `quizzes` (`quiz_type` column + `settings` jsonb). */
export function toDbConfig(config: QuizConfig): { quiz_type: QuizType; settings: Record<string, unknown> } {
  switch (config.type) {
    case 'multiple_choice':
      return { quiz_type: config.type, settings: { choiceCount: config.choiceCount } }
    case 'fill_blank':
      return { quiz_type: config.type, settings: { wordBox: config.wordBox } }
    case 'true_false':
      return { quiz_type: config.type, settings: { notation: config.notation } }
  }
}

export function fromDbConfig(quizType: string, settings: unknown): QuizConfig {
  const s = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {}
  switch (quizType) {
    case 'fill_blank':
      return { type: 'fill_blank', wordBox: s.wordBox === true }
    case 'true_false':
      return { type: 'true_false', notation: s.notation === 'letter' ? 'letter' : 'word' }
    default:
      return { type: 'multiple_choice', choiceCount: s.choiceCount === 3 ? 3 : 4 }
  }
}

/** One slide as the quiz model sees it. `slide` is the 1-based position. */
export interface QuizSlide {
  slide: number
  heading: string
  lines: string[]
}

export interface QuizRequest {
  title: string
  slides: QuizSlide[]
  count: number
  config: QuizConfig
}

/**
 * How an answer is stored in `quiz_questions.answer` (jsonb):
 * multiple choice → the correct index; fill in the blank → the term plus
 * accepted alternates; true/false → a boolean.
 */
export type QuizAnswer = number | { text: string; accepted: string[] } | boolean

/** A `quiz_questions` row minus its id, quiz id and order (the position in the array is the order). */
export interface QuizQuestionDraft {
  slideNumber: number
  slideHeading: string
  cardId: string | null
  prompt: string
  choices: string[]
  answer: QuizAnswer
}

/** How a quiz type reads to a person. */
export const QUIZ_TYPE_LABELS: Record<QuizType, string> = {
  multiple_choice: 'Multiple choice',
  fill_blank: 'Fill in the blank',
  true_false: 'True or false',
}
