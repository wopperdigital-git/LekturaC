/*
  Pure quiz vocabulary. Nothing here imports React, Supabase or `@/ai`: the
  provider layer imports *this*, never the reverse.
*/

export const MIN_QUIZ_ITEMS = 1
/** Items per test (a quiz has up to MAX_QUIZ_SECTIONS tests). */
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
  /** Prompts earlier tests of this quiz already asked; the model is told not to repeat them. */
  avoid?: string[]
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

export const MAX_QUIZ_SECTIONS = 3
export const MAX_SECTION_TITLE = 80
export const MAX_SECTION_INSTRUCTIONS = 300

/** One test of a quiz: its type and sub-option plus what the student reads above it. */
export interface QuizSection {
  config: QuizConfig
  title: string
  instructions: string
}

export function defaultSectionTitle(index: number): string {
  return `Test ${index + 1}`
}

/** The instruction line a test starts with (and what a legacy quiz shows). */
export function defaultInstructions(config: QuizConfig): string {
  switch (config.type) {
    case 'multiple_choice':
      return 'Choose the best answer for each question.'
    case 'fill_blank':
      return config.wordBox
        ? 'Fill in each blank using a word from the word box.'
        : 'Fill in each blank with the missing word or words.'
    case 'true_false':
      return config.notation === 'letter'
        ? 'Write T if the statement is true or F if it is false.'
        : 'Write TRUE if the statement is true or FALSE if it is false.'
  }
}

/** What `quizzes.quiz_type` holds: the type every test shares, or `'mixed'`. */
export type QuizTypeSummary = QuizType | 'mixed'

export function summaryType(sections: readonly { config: QuizConfig }[]): QuizTypeSummary {
  const types = new Set(sections.map((s) => s.config.type))
  return types.size === 1 ? sections[0].config.type : 'mixed'
}

export function parseTypeSummary(value: string): QuizTypeSummary {
  return value === 'mixed' ? 'mixed' : fromDbConfig(value, {}).type
}

export function quizTypeLabel(type: QuizTypeSummary): string {
  return type === 'mixed' ? 'Mixed' : QUIZ_TYPE_LABELS[type]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * A quiz's tests as stored. `settings.sections` (0016) holds one object per
 * test: the old per-type settings plus `title`, `instructions` and `type`. A
 * quiz saved before 0016 has none and reads as one default test built from
 * its `quiz_type` and settings. Malformed entries fall back field by field.
 */
export function fromDbSections(quizType: string, settings: unknown): QuizSection[] {
  const s = asRecord(settings)
  if (Array.isArray(s.sections) && s.sections.length > 0) {
    return s.sections.slice(0, MAX_QUIZ_SECTIONS).map((raw, i) => {
      const r = asRecord(raw)
      const config = fromDbConfig(typeof r.type === 'string' ? r.type : 'multiple_choice', r)
      const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : defaultSectionTitle(i)
      const instructions = typeof r.instructions === 'string' ? r.instructions.trim() : defaultInstructions(config)
      return { config, title, instructions }
    })
  }
  const config = fromDbConfig(quizType, s)
  return [{ config, title: defaultSectionTitle(0), instructions: defaultInstructions(config) }]
}
