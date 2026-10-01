import { fromDbSections, type QuizAnswer, type QuizSection, type QuizType } from './types'

/*
  Row shapes as PostgREST / the RPCs return them, and the mapping to app types.
  Kept together so a column cannot be selected under one name and read under
  another (the same rule `classroom/rows.ts` follows).
*/

export const DECK_QUIZ_COLUMNS = 'id, code, title, created_at, quiz_type, settings, quiz_questions(count)'
export const OWNER_QUIZ_COLUMNS = 'id, code, title, deck_title, created_at, quiz_type, settings'
export const OWNER_QUESTION_COLUMNS =
  'id, order_index, section_index, question_type, slide_number, slide_heading, prompt, choices, answer'

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
  section_index?: number | null
  question_type?: string | null
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
  sections: QuizSection[]
  itemCount: number
}

export interface OwnerQuestion {
  id: string
  sectionIndex: number
  type: QuizType
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
  sections: QuizSection[]
  questions: OwnerQuestion[]
}

export interface TakeQuestion {
  id: string
  slideNumber: number
  prompt: string
  choices: string[]
  sectionIndex: number
  type: QuizType
}

export interface TakeQuiz {
  id: string
  title: string
  deckTitle: string
  sections: QuizSection[]
  classes: { id: string; name: string; attempted: boolean }[]
  questions: TakeQuestion[]
  /** Shuffled answers to offer above a fill-in-the-blank test, keyed by the test's index. */
  wordBoxes: Record<number, string[]>
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

const QUIZ_TYPES: readonly QuizType[] = ['multiple_choice', 'fill_blank', 'true_false']

export function asQuizType(value: unknown, fallback: QuizType): QuizType {
  return QUIZ_TYPES.includes(value as QuizType) ? (value as QuizType) : fallback
}

/** A stored section index, clamped onto the quiz's sections (a legacy row has none: 0). */
function sectionIndexOf(value: unknown, sections: readonly QuizSection[]): number {
  const n = typeof value === 'number' && Number.isInteger(value) ? value : 0
  return Math.min(Math.max(0, n), sections.length - 1)
}

/**
 * Questions under each test, in order, skipping tests with no questions.
 * `index` is the test's position in `sections` (what word boxes are keyed by).
 * Numbering restarts per group, so callers number by position in `questions`.
 */
export function groupBySection<T extends { sectionIndex: number }>(
  sections: readonly QuizSection[],
  questions: readonly T[],
): { section: QuizSection; index: number; questions: T[] }[] {
  return sections
    .map((section, index) => ({ section, index, questions: questions.filter((q) => q.sectionIndex === index) }))
    .filter((g) => g.questions.length > 0)
}

export function deckQuizFromRow(row: DeckQuizRow): DeckQuizSummary {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    createdAt: row.created_at,
    sections: fromDbSections(row.quiz_type, row.settings),
    itemCount: row.quiz_questions?.[0]?.count ?? 0,
  }
}

export function ownerQuizFromRows(row: OwnerQuizRow, questions: OwnerQuestionRow[]): OwnerQuiz {
  const sections = fromDbSections(row.quiz_type, row.settings)
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    deckTitle: row.deck_title,
    createdAt: row.created_at,
    sections,
    questions: [...questions]
      .sort((a, b) => a.order_index - b.order_index)
      .map((q) => {
        const sectionIndex = sectionIndexOf(q.section_index, sections)
        return {
          id: q.id,
          sectionIndex,
          type: asQuizType(q.question_type, sections[sectionIndex].config.type),
          slideNumber: q.slide_number,
          slideHeading: q.slide_heading,
          prompt: q.prompt,
          choices: strings(q.choices),
          answer: asAnswer(q.answer),
        }
      }),
  }
}

interface TakeJson {
  id: string
  title: string
  deck_title: string
  quiz_type: string
  settings: unknown
  classes: { id: string; name: string; attempted: boolean }[]
  questions: {
    id: string
    order_index: number
    section_index?: number | null
    question_type?: string | null
    slide_number: number
    prompt: string
    choices: unknown
  }[]
  /** 0016 and later. */
  word_boxes?: unknown
  /** Before 0016: one box for the whole (single-type) quiz. */
  word_box?: unknown
}

function wordBoxesFrom(json: TakeJson, sectionCount: number): Record<number, string[]> {
  const out: Record<number, string[]> = {}
  if (json.word_boxes && typeof json.word_boxes === 'object' && !Array.isArray(json.word_boxes)) {
    for (const [k, v] of Object.entries(json.word_boxes as Record<string, unknown>)) {
      const index = Number(k)
      if (!/^\d+$/.test(k) || index >= sectionCount || !Array.isArray(v)) continue
      out[index] = strings(v)
    }
  } else if (Array.isArray(json.word_box)) {
    out[0] = strings(json.word_box)
  }
  return out
}

export function takeQuizFromJson(json: TakeJson): TakeQuiz {
  const sections = fromDbSections(json.quiz_type, json.settings)
  return {
    id: json.id,
    title: json.title,
    deckTitle: json.deck_title,
    sections,
    classes: json.classes,
    questions: [...json.questions]
      .sort((a, b) => a.order_index - b.order_index)
      .map((q) => {
        const sectionIndex = sectionIndexOf(q.section_index, sections)
        return {
          id: q.id,
          slideNumber: q.slide_number,
          prompt: q.prompt,
          choices: strings(q.choices),
          sectionIndex,
          type: asQuizType(q.question_type, sections[sectionIndex].config.type),
        }
      }),
    wordBoxes: wordBoxesFrom(json, sections.length),
  }
}
