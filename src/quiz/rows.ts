import { fromDbConfig, type QuizAnswer, type QuizConfig } from './types'

/*
  Row shapes as PostgREST / the RPCs return them, and the mapping to app types.
  Kept together so a column cannot be selected under one name and read under
  another (the same rule `classroom/rows.ts` follows).
*/

export const DECK_QUIZ_COLUMNS = 'id, code, title, created_at, quiz_type, settings, quiz_questions(count)'
export const OWNER_QUIZ_COLUMNS = 'id, code, title, deck_title, created_at, quiz_type, settings'
export const OWNER_QUESTION_COLUMNS = 'id, order_index, slide_number, slide_heading, prompt, choices, answer'

export interface DeckQuizRow {
  id: string
  code: string
  title: string
  created_at: string
  quiz_type: string
  settings: unknown
  quiz_questions?: { count: number }[] | null
}

export interface OwnerQuizRow {
  id: string
  code: string
  title: string
  deck_title: string
  created_at: string
  quiz_type: string
  settings: unknown
}

export interface OwnerQuestionRow {
  id: string
  order_index: number
  slide_number: number
  slide_heading: string
  prompt: string
  choices: unknown
  answer: unknown
}

export interface DeckQuizSummary {
  id: string
  code: string
  title: string
  createdAt: string
  config: QuizConfig
  itemCount: number
}

export interface OwnerQuestion {
  id: string
  slideNumber: number
  slideHeading: string
  prompt: string
  choices: string[]
  answer: QuizAnswer
}

export interface OwnerQuiz {
  id: string
  code: string
  title: string
  deckTitle: string
  createdAt: string
  config: QuizConfig
  questions: OwnerQuestion[]
}

export interface TakeQuestion {
  id: string
  slideNumber: number
  prompt: string
  choices: string[]
}

export interface TakeQuiz {
  id: string
  title: string
  deckTitle: string
  config: QuizConfig
  classes: { id: string; name: string; attempted: boolean }[]
  questions: TakeQuestion[]
  /** Shuffled answers to offer above the blanks, or `null` when the quiz has no word box. */
  wordBox: string[] | null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function asAnswer(value: unknown): QuizAnswer {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value && typeof value === 'object') {
    const v = value as { text?: unknown; accepted?: unknown }
    return { text: typeof v.text === 'string' ? v.text : '', accepted: strings(v.accepted) }
  }
  return false
}

export function deckQuizFromRow(row: DeckQuizRow): DeckQuizSummary {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    createdAt: row.created_at,
    config: fromDbConfig(row.quiz_type, row.settings),
    itemCount: row.quiz_questions?.[0]?.count ?? 0,
  }
}

export function ownerQuizFromRows(row: OwnerQuizRow, questions: OwnerQuestionRow[]): OwnerQuiz {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    deckTitle: row.deck_title,
    createdAt: row.created_at,
    config: fromDbConfig(row.quiz_type, row.settings),
    questions: [...questions]
      .sort((a, b) => a.order_index - b.order_index)
      .map((q) => ({
        id: q.id,
        slideNumber: q.slide_number,
        slideHeading: q.slide_heading,
        prompt: q.prompt,
        choices: strings(q.choices),
        answer: asAnswer(q.answer),
      })),
  }
}

interface TakeJson {
  id: string
  title: string
  deck_title: string
  quiz_type: string
  settings: unknown
  classes: { id: string; name: string; attempted: boolean }[]
  questions: { id: string; order_index: number; slide_number: number; prompt: string; choices: unknown }[]
  word_box: unknown
}

export function takeQuizFromJson(json: TakeJson): TakeQuiz {
  return {
    id: json.id,
    title: json.title,
    deckTitle: json.deck_title,
    config: fromDbConfig(json.quiz_type, json.settings),
    classes: json.classes,
    questions: [...json.questions]
      .sort((a, b) => a.order_index - b.order_index)
      .map((q) => ({ id: q.id, slideNumber: q.slide_number, prompt: q.prompt, choices: strings(q.choices) })),
    wordBox: Array.isArray(json.word_box) ? strings(json.word_box) : null,
  }
}
