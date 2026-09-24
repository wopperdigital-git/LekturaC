import type { QuizResponse } from './schema'
import type { QuizConfig, QuizQuestionDraft } from './types'

/*
  Everything the model returns is checked here, because the model cannot be
  trusted for structure: it miscounts choices, cites slides that don't exist and
  favours one answer position. Invalid questions are dropped (never repaired
  with a second call) and show up as a shortfall.
*/

/** FNV-1a: a small, stable string → 32-bit seed. */
function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates over a copy; the same seed always gives the same order. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items]
  const rand = mulberry32(hashSeed(seed))
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface BuildInput {
  response: QuizResponse
  config: QuizConfig
  count: number
  /** Cards in `orderIndex` order; `slide` N in the reply is `cards[N - 1]`. */
  cards: { id: string; heading: string }[]
  /** Makes the choice shuffle reproducible (a fresh id per generation in the app). */
  seed: string
}

export interface BuildResult {
  questions: QuizQuestionDraft[]
  /** How many fewer than `count` survived validation. */
  shortfall: number
}

type ModelQuestion = QuizResponse['questions'][number]

const BLANK = /_{3,}/
/** An answer with no letter or digit ("!!!") can never match: the database strips punctuation first. */
const SCORABLE = /[\p{L}\p{N}]/u

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'true' || v === 't') return true
  if (v === 'false' || v === 'f') return false
  return null
}

function buildOne(
  q: ModelQuestion,
  config: QuizConfig,
  cards: BuildInput['cards'],
  seed: string,
  position: number,
): QuizQuestionDraft | null {
  const card = cards[q.slide - 1]
  if (!card) return null
  const prompt = q.prompt.trim()
  if (!prompt) return null
  const base = { slideNumber: q.slide, slideHeading: card.heading, cardId: card.id, prompt }

  switch (config.type) {
    case 'multiple_choice': {
      const choices = (q.choices ?? []).map((c) => c.trim())
      if (choices.length !== config.choiceCount || choices.some((c) => !c)) return null
      if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) return null
      const index = q.answerIndex
      if (index === undefined || index < 0 || index >= choices.length) return null
      const shuffled = seededShuffle(
        choices.map((text, i) => ({ text, correct: i === index })),
        `${seed}:${position}`,
      )
      return {
        ...base,
        choices: shuffled.map((c) => c.text),
        answer: shuffled.findIndex((c) => c.correct),
      }
    }
    case 'fill_blank': {
      if (!BLANK.test(prompt)) return null
      if (typeof q.answer !== 'string') return null
      const text = q.answer.trim()
      if (!SCORABLE.test(text)) return null
      const seen = new Set([text.toLowerCase()])
      const accepted: string[] = []
      for (const raw of q.accepted ?? []) {
        const alt = raw.trim()
        if (!SCORABLE.test(alt) || seen.has(alt.toLowerCase())) continue
        seen.add(alt.toLowerCase())
        accepted.push(alt)
        if (accepted.length === 3) break
      }
      return { ...base, choices: [], answer: { text, accepted } }
    }
    case 'true_false': {
      const value = parseBoolean(q.answer)
      if (value === null) return null
      return { ...base, choices: [], answer: value }
    }
  }
}

export function buildQuestions({ response, config, count, cards, seed }: BuildInput): BuildResult {
  const questions: QuizQuestionDraft[] = []
  for (const q of response.questions) {
    if (questions.length === count) break
    const built = buildOne(q, config, cards, seed, questions.length)
    if (built) questions.push(built)
  }
  return { questions, shortfall: Math.max(0, count - questions.length) }
}
