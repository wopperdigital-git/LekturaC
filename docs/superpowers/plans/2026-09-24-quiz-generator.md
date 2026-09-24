# Quiz Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Quiz button in the editor generates a multiple-choice, fill-in-the-blank or true/false quiz from a deck with the free Groq model, gives it a share code that students in a posted class answer (scores reach the teacher dashboard), and lets the deck's owner export it as a PDF.

**Architecture:** Pure quiz logic in `src/quiz/` (types, tolerant schema, `buildQuestions`), a Groq-only provider chain for generation, one migration (`0012`) with three RPCs (`create_quiz`, `get_quiz_for_taking`, `submit_quiz_attempt`) that keep answers server-side, and UI in the editor (modal), the Quizzes page (post to class), a `/quiz/:code` taking page, and a lazily loaded jsPDF export.

**Tech Stack:** React 19, TypeScript 6, Vite 8, zustand, Supabase (Postgres RLS + RPCs), zod 4, Vitest 4, Groq chat-completions, jsPDF (new).

**Spec:** `docs/superpowers/specs/2026-09-24-quiz-generator-design.md`

## Global Constraints

- Items: 1–20 (`MAX_QUIZ_ITEMS = 20`). Question types: `multiple_choice` (3 or 4 choices, A–C / A–D), `fill_blank` (word box on/off), `true_false` (notation `word` = TRUE/FALSE, `letter` = T/F). One type per quiz.
- **Groq only, free.** Chain is `openai/gpt-oss-120b` then `groq/compound`. Never Anthropic (billed) or Gemini for quizzes. **Only `capacity` failures hand off; cancellation never does; every call honours the `AbortSignal` in `fetch` and backoff `sleep`.**
- Groq output budget `quizMaxTokens(n) = clamp(n*110 + 3800, 5200, 7000)`. Input is capped: 600 characters per slide, ~6,000 total (Groq's 8,000 TPM counts input + requested output).
- The model is not trusted for structure: bad slide numbers / wrong shapes are dropped, MC choices are shuffled client-side, fewer than `count` is accepted and reported.
- **Answers never reach a student.** `quiz_questions` stays owner-only under RLS; `get_quiz_for_taking` never returns answers; scoring happens in `submit_quiz_attempt`. The PDF answer key is owner-only because only the owner can read `quiz_questions`.
- Account rules: any deck owner can generate; sharing/posting/results need a **Teacher** account (General accounts get no code). A student with a code who is not in a posted class is refused ("join the class first") — **no auto-join**.
- The quiz never touches `cards`. It is not precedent for regenerating slides (CLAUDE.md "generate once").
- Code style: `@/` alias, `import type` for type-only imports (`verbatimModuleSyntax`), no constructor parameter properties (`erasableSyntaxOnly`). Tests are colocated `*.test.ts`, pure logic only, **no jsdom**. Match the surrounding comment density and naming.
- Quiz codes: 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (same alphabet as class join codes).
- Commit trailer for every commit: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Verification commands: `npx vitest run <file>` per task; `npm run build`, `npm run lint`, `npm run test` at the end.

## File Structure

New:
- `src/quiz/types.ts` — `QuizConfig`, `QuizType`, `QuizSlide`, `QuizRequest`, `QuizQuestionDraft`, limits, DB config mapping.
- `src/quiz/schema.ts` — tolerant zod schema for the model's reply.
- `src/quiz/build.ts` — `buildQuestions`, `seededShuffle`.
- `src/quiz/quizCode.ts` — alphabet/length/normalise/validate for codes.
- `src/quiz/api.ts` — all quiz I/O against Supabase.
- `src/quiz/pdf/quizPdfLayout.ts` — pure wrapping/pagination; `src/quiz/pdf/quizPdf.ts` — jsPDF drawing.
- `src/ai/quizPrompt.ts` — slide extraction, prompts, `quizMaxTokens`.
- `src/components/quiz/QuizModal.tsx`, `src/components/quiz/QuizPreview.tsx`.
- `src/pages/QuizPage.tsx` — student taking page.
- `supabase/migrations/0012_quizzes.sql`, `supabase/tests/0012_quiz_rls.sql`.
- `public/fonts/NotoSans-Regular.ttf`, `public/fonts/NotoSans-Bold.ttf`.

Modified: `src/ai/provider.ts`, `src/ai/groqProvider.ts`, `src/ai/fallbackProvider.ts`, `src/classroom/api.ts` (export helpers), `src/classroom/rows.ts` + `types.ts` (quiz code/type), `src/components/editor/TopBar.tsx`, `src/pages/EditorPage.tsx`, `src/pages/classroom/QuizzesPage.tsx`, `src/components/classroom/QuizRow.tsx`, `src/pages/classroom/MyClassesPage.tsx`, `src/App.tsx`, `package.json`, `CLAUDE.md`.

---

### Task 1: Quiz domain types and the tolerant reply schema

**Files:**
- Create: `src/quiz/types.ts`
- Create: `src/quiz/schema.ts`
- Test: `src/quiz/schema.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - `MIN_QUIZ_ITEMS = 1`, `MAX_QUIZ_ITEMS = 20`, `clampItemCount(n: number): number`
  - `type QuizType = 'multiple_choice' | 'fill_blank' | 'true_false'`
  - `type QuizConfig = { type: 'multiple_choice'; choiceCount: 3 | 4 } | { type: 'fill_blank'; wordBox: boolean } | { type: 'true_false'; notation: 'word' | 'letter' }`
  - `DEFAULT_CONFIGS: Record<QuizType, QuizConfig>`
  - `toDbConfig(config): { quiz_type: QuizType; settings: Record<string, unknown> }`, `fromDbConfig(quizType: string, settings: unknown): QuizConfig`
  - `interface QuizSlide { slide: number; heading: string; lines: string[] }`
  - `interface QuizRequest { title: string; slides: QuizSlide[]; count: number; config: QuizConfig }`
  - `type QuizAnswer = number | { text: string; accepted: string[] } | boolean`
  - `interface QuizQuestionDraft { slideNumber: number; slideHeading: string; cardId: string | null; prompt: string; choices: string[]; answer: QuizAnswer }`
  - `quizResponseSchema` (zod), `type QuizResponse`

- [ ] **Step 1: Write the failing test**

Create `src/quiz/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { quizResponseSchema } from './schema'
import { MAX_QUIZ_ITEMS, clampItemCount, fromDbConfig, toDbConfig } from './types'

describe('quizResponseSchema', () => {
  it('accepts each of the three reply shapes', () => {
    const parsed = quizResponseSchema.safeParse({
      questions: [
        { slide: 2, prompt: 'Q?', choices: ['a', 'b', 'c'], answerIndex: 1 },
        { slide: 3, prompt: 'The ___ is big.', answer: 'sun', accepted: ['the sun'] },
        { slide: 4, prompt: 'Water is wet.', answer: true },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('is lenient about per-question shape (build.ts drops bad ones)', () => {
    expect(quizResponseSchema.safeParse({ questions: [{ slide: 1, prompt: 'x' }] }).success).toBe(true)
  })

  it('rejects a reply with no questions array or an empty one', () => {
    expect(quizResponseSchema.safeParse({}).success).toBe(false)
    expect(quizResponseSchema.safeParse({ questions: [] }).success).toBe(false)
  })

  it('rejects a question with no slide or prompt', () => {
    expect(quizResponseSchema.safeParse({ questions: [{ prompt: 'x' }] }).success).toBe(false)
    expect(quizResponseSchema.safeParse({ questions: [{ slide: 1 }] }).success).toBe(false)
  })
})

describe('clampItemCount', () => {
  it('clamps to 1..20 and floors fractions', () => {
    expect(clampItemCount(0)).toBe(1)
    expect(clampItemCount(-5)).toBe(1)
    expect(clampItemCount(7.9)).toBe(7)
    expect(clampItemCount(999)).toBe(MAX_QUIZ_ITEMS)
    expect(clampItemCount(Number.NaN)).toBe(1)
  })
})

describe('db config mapping', () => {
  it('round-trips every config', () => {
    const configs = [
      { type: 'multiple_choice', choiceCount: 3 },
      { type: 'multiple_choice', choiceCount: 4 },
      { type: 'fill_blank', wordBox: true },
      { type: 'fill_blank', wordBox: false },
      { type: 'true_false', notation: 'word' },
      { type: 'true_false', notation: 'letter' },
    ] as const
    for (const config of configs) {
      const { quiz_type, settings } = toDbConfig(config)
      expect(fromDbConfig(quiz_type, settings)).toEqual(config)
    }
  })

  it('falls back to defaults for missing or junk settings', () => {
    expect(fromDbConfig('multiple_choice', {})).toEqual({ type: 'multiple_choice', choiceCount: 4 })
    expect(fromDbConfig('fill_blank', null)).toEqual({ type: 'fill_blank', wordBox: false })
    expect(fromDbConfig('true_false', 'x')).toEqual({ type: 'true_false', notation: 'word' })
    expect(fromDbConfig('nonsense', {})).toEqual({ type: 'multiple_choice', choiceCount: 4 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/quiz/schema.test.ts`
Expected: FAIL — cannot resolve `./schema` / `./types`.

- [ ] **Step 3: Write the implementation**

Create `src/quiz/types.ts`:

```ts
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
```

Create `src/quiz/schema.ts`:

```ts
import { z } from 'zod'

/**
 * What the model returns, deliberately loose per question.
 *
 * A strict schema would fail the whole reply (and spend the one retry) over a
 * single malformed question. Only the envelope is strict here — `slide` and
 * `prompt` must exist because nothing can be salvaged without them. Whether
 * the rest suits the requested type is `build.ts`'s call, and a question that
 * doesn't is dropped and reported as a shortfall.
 */
export const quizResponseSchema = z.object({
  questions: z
    .array(
      z.object({
        slide: z.number().int(),
        prompt: z.string(),
        choices: z.array(z.string()).optional(),
        answerIndex: z.number().int().optional(),
        answer: z.union([z.string(), z.boolean()]).optional(),
        accepted: z.array(z.string()).optional(),
      }),
    )
    .min(1),
})

export type QuizResponse = z.infer<typeof quizResponseSchema>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/quiz/schema.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/quiz/types.ts src/quiz/schema.ts src/quiz/schema.test.ts
git commit -m "feat(quiz): quiz domain types and tolerant reply schema

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `buildQuestions` — turn the model's reply into storable questions

**Files:**
- Create: `src/quiz/build.ts`
- Test: `src/quiz/build.test.ts`

**Interfaces:**
- Consumes: `QuizConfig`, `QuizQuestionDraft`, `MAX_QUIZ_ITEMS` from `./types`; `QuizResponse` from `./schema`.
- Produces:
  - `seededShuffle<T>(items: readonly T[], seed: string): T[]` (pure; same seed → same order)
  - `interface BuildInput { response: QuizResponse; config: QuizConfig; count: number; cards: { id: string; heading: string }[]; seed: string }`
  - `interface BuildResult { questions: QuizQuestionDraft[]; shortfall: number }` where `shortfall = max(0, count - questions.length)`
  - `buildQuestions(input: BuildInput): BuildResult`

- [ ] **Step 1: Write the failing test**

Create `src/quiz/build.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildQuestions, seededShuffle } from './build'
import type { QuizResponse } from './schema'
import type { QuizConfig } from './types'

const CARDS = [
  { id: 'c1', heading: 'Intro' },
  { id: 'c2', heading: 'Cells' },
  { id: 'c3', heading: 'Energy' },
]
const MC4: QuizConfig = { type: 'multiple_choice', choiceCount: 4 }
const MC3: QuizConfig = { type: 'multiple_choice', choiceCount: 3 }
const FILL: QuizConfig = { type: 'fill_blank', wordBox: true }
const TF: QuizConfig = { type: 'true_false', notation: 'word' }

function run(response: QuizResponse, config: QuizConfig, count = 5) {
  return buildQuestions({ response, config, count, cards: CARDS, seed: 'seed' })
}

describe('seededShuffle', () => {
  it('is deterministic per seed and is a permutation', () => {
    const items = [1, 2, 3, 4, 5, 6]
    expect(seededShuffle(items, 'a')).toEqual(seededShuffle(items, 'a'))
    expect([...seededShuffle(items, 'a')].sort()).toEqual(items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6]) // input untouched
  })

  it('differs across seeds for at least one of several seeds', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const orders = new Set(['a', 'b', 'c', 'd', 'e'].map((s) => seededShuffle(items, s).join()))
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe('buildQuestions — multiple choice', () => {
  it('keeps the correct choice correct after shuffling, for every answer position', () => {
    for (let answerIndex = 0; answerIndex < 4; answerIndex++) {
      const choices = ['alpha', 'beta', 'gamma', 'delta']
      const res = run({ questions: [{ slide: 2, prompt: 'Which?', choices, answerIndex }] }, MC4)
      expect(res.questions).toHaveLength(1)
      const q = res.questions[0]
      expect([...q.choices].sort()).toEqual([...choices].sort())
      expect(q.choices[q.answer as number]).toBe(choices[answerIndex])
    }
  })

  it('maps slide → cardId and heading, and trims the prompt', () => {
    const res = run({ questions: [{ slide: 2, prompt: '  Which?  ', choices: ['a', 'b', 'c'], answerIndex: 0 }] }, MC3)
    expect(res.questions[0]).toMatchObject({ slideNumber: 2, slideHeading: 'Cells', cardId: 'c2', prompt: 'Which?' })
  })

  it('drops wrong choice counts, out-of-range answers, duplicate choices and out-of-range slides', () => {
    const res = run(
      {
        questions: [
          { slide: 1, prompt: 'few', choices: ['a', 'b'], answerIndex: 0 },
          { slide: 1, prompt: 'bad index', choices: ['a', 'b', 'c', 'd'], answerIndex: 4 },
          { slide: 1, prompt: 'dupes', choices: ['a', 'A', 'c', 'd'], answerIndex: 0 },
          { slide: 9, prompt: 'no such slide', choices: ['a', 'b', 'c', 'd'], answerIndex: 0 },
          { slide: 0, prompt: 'slide zero', choices: ['a', 'b', 'c', 'd'], answerIndex: 0 },
          { slide: 3, prompt: 'good', choices: ['a', 'b', 'c', 'd'], answerIndex: 2 },
        ],
      },
      MC4,
    )
    expect(res.questions.map((q) => q.prompt)).toEqual(['good'])
    expect(res.shortfall).toBe(4)
  })
})

describe('buildQuestions — fill in the blank', () => {
  it('requires a blank marker and a non-empty answer, and cleans accepted alternates', () => {
    const res = run(
      {
        questions: [
          { slide: 2, prompt: 'The ___ makes energy.', answer: ' Mitochondria ', accepted: ['mitochondrion', 'Mitochondria', '', 'mito', 'a', 'b'] },
          { slide: 2, prompt: 'No blank here.', answer: 'x' },
          { slide: 2, prompt: 'Empty ____ answer.', answer: '   ' },
          { slide: 2, prompt: 'Boolean ___ answer.', answer: true },
        ],
      },
      FILL,
    )
    expect(res.questions).toHaveLength(1)
    const q = res.questions[0]
    expect(q.choices).toEqual([])
    expect(q.answer).toEqual({ text: 'Mitochondria', accepted: ['mitochondrion', 'mito', 'a'] })
  })
})

describe('buildQuestions — true/false', () => {
  it('accepts booleans and true/false/T/F strings, drops anything else', () => {
    const res = run(
      {
        questions: [
          { slide: 1, prompt: 's1', answer: true },
          { slide: 1, prompt: 's2', answer: 'False' },
          { slide: 1, prompt: 's3', answer: 'T' },
          { slide: 1, prompt: 's4', answer: 'maybe' },
          { slide: 1, prompt: 's5' },
        ],
      },
      TF,
    )
    expect(res.questions.map((q) => q.answer)).toEqual([true, false, true])
    expect(res.questions.every((q) => q.choices.length === 0)).toBe(true)
  })
})

describe('buildQuestions — count', () => {
  it('trims to count and reports no shortfall', () => {
    const questions = Array.from({ length: 8 }, (_, i) => ({ slide: 1, prompt: `s${i}`, answer: true }))
    const res = run({ questions }, TF, 5)
    expect(res.questions).toHaveLength(5)
    expect(res.shortfall).toBe(0)
  })

  it('reports a shortfall when fewer valid questions than requested come back', () => {
    const res = run({ questions: [{ slide: 1, prompt: 'only', answer: false }] }, TF, 4)
    expect(res.questions).toHaveLength(1)
    expect(res.shortfall).toBe(3)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/quiz/build.test.ts`
Expected: FAIL — cannot resolve `./build`.

- [ ] **Step 3: Write the implementation**

Create `src/quiz/build.ts`:

```ts
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
      if (!text) return null
      const seen = new Set([text.toLowerCase()])
      const accepted: string[] = []
      for (const raw of q.accepted ?? []) {
        const alt = raw.trim()
        if (!alt || seen.has(alt.toLowerCase())) continue
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/quiz/build.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation check**

Temporarily change `answer: shuffled.findIndex((c) => c.correct)` to `answer: index`, run `npx vitest run src/quiz/build.test.ts`, confirm the "keeps the correct choice correct" test FAILS, then revert.

- [ ] **Step 6: Commit**

```bash
git add src/quiz/build.ts src/quiz/build.test.ts
git commit -m "feat(quiz): validate and shuffle model questions (buildQuestions)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: The quiz prompt

**Files:**
- Create: `src/ai/quizPrompt.ts`
- Test: `src/ai/quizPrompt.test.ts`

**Interfaces:**
- Consumes: `QuizConfig`, `QuizRequest`, `QuizSlide` from `@/quiz/types`; `Card`, `headingTextOf` from `@/engine/contentBlocks`; `contentLines` from `@/engine/cardTemplates`.
- Produces:
  - `MAX_SLIDE_CHARS = 600`, `MAX_TOTAL_CHARS = 6000`
  - `quizSlides(cards: Card[]): QuizSlide[]` (cards MUST be sorted by `orderIndex`; `slide` is 1-based)
  - `hasQuizContent(cards: Card[]): boolean`
  - `QUIZ_SYSTEM_PROMPT: string`
  - `buildQuizUserPrompt(request: QuizRequest): string`
  - `quizMaxTokens(count: number): number`

- [ ] **Step 1: Write the failing test**

Create `src/ai/quizPrompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Card } from '@/engine/contentBlocks'
import {
  MAX_SLIDE_CHARS,
  MAX_TOTAL_CHARS,
  QUIZ_SYSTEM_PROMPT,
  buildQuizUserPrompt,
  hasQuizContent,
  quizMaxTokens,
  quizSlides,
} from './quizPrompt'

function card(orderIndex: number, heading: string, bullets: string[]): Card {
  return {
    id: `c${orderIndex}`,
    orderIndex,
    layout: 'auto',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: heading },
      ...(bullets.length ? [{ type: 'bulletList' as const, items: bullets }] : []),
    ],
  } as Card
}

describe('quizSlides', () => {
  it('numbers slides from 1 and separates the heading from its lines', () => {
    const slides = quizSlides([card(0, 'Intro', ['a', 'b']), card(1, 'Cells', ['c'])])
    expect(slides).toEqual([
      { slide: 1, heading: 'Intro', lines: ['a', 'b'] },
      { slide: 2, heading: 'Cells', lines: ['c'] },
    ])
  })

  it('keeps whole lines under the per-slide budget and cuts the rest', () => {
    const long = 'x'.repeat(400)
    const [s] = quizSlides([card(0, 'H', [long, long, long])])
    expect(s.lines).toHaveLength(1)
    expect(s.lines.join('').length).toBeLessThanOrEqual(MAX_SLIDE_CHARS)
  })

  it('truncates a single over-long line with an ellipsis', () => {
    const [s] = quizSlides([card(0, 'H', ['y'.repeat(2000)])])
    expect(s.lines[0].length).toBeLessThanOrEqual(MAX_SLIDE_CHARS)
    expect(s.lines[0].endsWith('…')).toBe(true)
  })

  it('shares the total budget across many slides', () => {
    const cards = Array.from({ length: 20 }, (_, i) => card(i, `S${i}`, ['z'.repeat(590)]))
    const slides = quizSlides(cards)
    expect(slides).toHaveLength(20)
    const total = slides.reduce((n, s) => n + s.lines.join('').length, 0)
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_CHARS)
  })
})

describe('hasQuizContent', () => {
  it('needs at least one card with body text beyond its heading', () => {
    expect(hasQuizContent([])).toBe(false)
    expect(hasQuizContent([card(0, 'Only a heading', [])])).toBe(false)
    expect(hasQuizContent([card(0, 'H', ['a point'])])).toBe(true)
  })
})

describe('buildQuizUserPrompt', () => {
  const slides = [{ slide: 1, heading: 'Intro', lines: ['Cells are small'] }]

  it('states the exact count, the title and each slide', () => {
    const p = buildQuizUserPrompt({ title: 'Biology', slides, count: 7, config: { type: 'true_false', notation: 'word' } })
    expect(p).toContain('Biology')
    expect(p).toContain('exactly 7')
    expect(p).toContain('Slide 1: Intro')
    expect(p).toContain('- Cells are small')
  })

  it('gives multiple choice the right choice count and reply shape', () => {
    const three = buildQuizUserPrompt({ title: 'T', slides, count: 3, config: { type: 'multiple_choice', choiceCount: 3 } })
    expect(three).toContain('exactly 3 choices')
    expect(three).toContain('answerIndex')
    const four = buildQuizUserPrompt({ title: 'T', slides, count: 3, config: { type: 'multiple_choice', choiceCount: 4 } })
    expect(four).toContain('exactly 4 choices')
  })

  it('gives fill in the blank its blank marker and accepted alternates', () => {
    const p = buildQuizUserPrompt({ title: 'T', slides, count: 3, config: { type: 'fill_blank', wordBox: true } })
    expect(p).toContain('_____')
    expect(p).toContain('"accepted"')
  })

  it('asks true/false for a balanced mix', () => {
    const p = buildQuizUserPrompt({ title: 'T', slides, count: 4, config: { type: 'true_false', notation: 'letter' } })
    expect(p).toContain('half')
    expect(p).toContain('"answer":true')
  })

  it('always asks for JSON only and for slide citations', () => {
    expect(QUIZ_SYSTEM_PROMPT).toContain('ONLY a JSON object')
    expect(QUIZ_SYSTEM_PROMPT).toContain('"slide"')
  })
})

describe('quizMaxTokens', () => {
  it('stays inside the reasoning floor and the Groq TPM ceiling', () => {
    expect(quizMaxTokens(1)).toBe(5200)
    expect(quizMaxTokens(10)).toBe(5200) // 10*110 + 3800 = 4900, below the floor
    expect(quizMaxTokens(20)).toBe(6000)
    expect(quizMaxTokens(500)).toBe(7000)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ai/quizPrompt.test.ts`
Expected: FAIL — cannot resolve `./quizPrompt`.

- [ ] **Step 3: Write the implementation**

Create `src/ai/quizPrompt.ts`:

```ts
import { headingTextOf, type Card } from '@/engine/contentBlocks'
import { contentLines } from '@/engine/cardTemplates'
import type { QuizConfig, QuizRequest, QuizSlide } from '@/quiz/types'

/*
  Groq's free tier counts *input plus requested output* against an ~8,000
  tokens-per-minute window, so the deck text sent to the model is capped: the
  output budget below already takes 5,200–7,000 of it.
*/
export const MAX_SLIDE_CHARS = 600
export const MAX_TOTAL_CHARS = 6000

/** Whole lines while they fit; a lone over-long first line is cut with an ellipsis. */
function takeLines(lines: string[], budget: number): string[] {
  const out: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length > budget) {
      if (out.length === 0 && budget > 1) out.push(`${line.slice(0, budget - 1).trimEnd()}…`)
      break
    }
    out.push(line)
    used += line.length
  }
  return out
}

/**
 * The deck as slides for the prompt. Every slide keeps its heading (so slide
 * numbers stay meaningful); body text is shared out of the total budget.
 * `cards` MUST be sorted by `orderIndex` — `slide` is the 1-based position and
 * is what `buildQuestions` maps back to a card.
 */
export function quizSlides(cards: Card[]): QuizSlide[] {
  const perSlide = Math.min(MAX_SLIDE_CHARS, Math.floor(MAX_TOTAL_CHARS / Math.max(1, cards.length)))
  return cards.map((card, i) => ({
    slide: i + 1,
    heading: headingTextOf(card, i),
    lines: takeLines(contentLines(card.blocks), perSlide),
  }))
}

/** A deck with only headings has nothing to ask about. */
export function hasQuizContent(cards: Card[]): boolean {
  return cards.some((card) => contentLines(card.blocks).length > 0)
}

export const QUIZ_SYSTEM_PROMPT = `You write quizzes from presentation slides.

RULES
- Every question must be answerable from the slides you are given. Never use outside facts, and never invent numbers, names or dates that are not on a slide.
- Every question cites the slide it came from with "slide" (the slide number shown).
- Spread the questions across the slides; do not ask about one slide over and over.
- Ask about ideas and facts, not about the slides themselves ("what does slide 3 say" is not a question).
- Write exactly the number of questions asked for. Return fewer ONLY if the slides cannot support that many distinct questions — never pad with near-duplicates.

OUTPUT
Return ONLY a JSON object, no other text, in the exact shape the request shows.`

function typeRules(config: QuizConfig): string {
  switch (config.type) {
    case 'multiple_choice':
      return `QUESTION TYPE: multiple choice.
- Each question has exactly ${config.choiceCount} choices and exactly one correct choice.
- Distractors must be plausible and drawn from the same slides. Never use "all of the above" or "none of the above".
- "answerIndex" is the 0-based index of the correct choice.
Reply shape: {"questions":[{"slide":2,"prompt":"...","choices":[${Array.from({ length: config.choiceCount }, () => '"..."').join(',')}],"answerIndex":0}]}`
    case 'fill_blank':
      return `QUESTION TYPE: fill in the blank.
- Each prompt is one sentence with exactly one blank written as _____ (five underscores).
- The blank hides a key term stated on the slide, one to three words. "answer" is that term.
- "accepted" lists up to three other spellings or forms that should also count (for example an abbreviation or a plural). Use [] if there are none.
Reply shape: {"questions":[{"slide":3,"prompt":"The _____ produces most of the cell's energy.","answer":"mitochondria","accepted":["mitochondrion"]}]}`
    case 'true_false':
      return `QUESTION TYPE: true or false.
- Each prompt is a single statement. About half should be true and half false.
- False statements must be plausible, changing one fact from the slide, not obviously absurd.
- "answer" is true or false as a JSON boolean.
Reply shape: {"questions":[{"slide":4,"prompt":"A statement about the slide.","answer":true}]}`
  }
}

export function buildQuizUserPrompt(request: QuizRequest): string {
  const body = request.slides
    .map((s) => {
      const lines = s.lines.length > 0 ? `\n${s.lines.map((l) => `- ${l}`).join('\n')}` : ''
      return `Slide ${s.slide}: ${s.heading}${lines}`
    })
    .join('\n\n')

  return `Presentation title: ${request.title}

${body}

Write exactly ${request.count} questions.

${typeRules(request.config)}`
}

/**
 * Output budget for one quiz call. The 5,200 floor is the same reasoning-token
 * floor `narrationMaxTokens` documents (`gpt-oss-120b` spends ~3,400 tokens
 * thinking before any JSON); the 7,000 ceiling keeps requested output inside
 * Groq's 8,000 TPM window. 20 items lands at 6,000.
 */
export function quizMaxTokens(count: number): number {
  return Math.min(7000, Math.max(5200, count * 110 + 3800))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ai/quizPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/quizPrompt.ts src/ai/quizPrompt.test.ts
git commit -m "feat(quiz): quiz prompt, slide extraction and token budget

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `QuizProvider` and `GroqProvider.generateQuiz`

**Files:**
- Modify: `src/ai/provider.ts` (add `QuizProvider`)
- Modify: `src/ai/groqProvider.ts` (add `generateQuiz`, `tryParseQuiz`)
- Test: `src/ai/groqQuiz.test.ts`

**Interfaces:**
- Consumes: `quizResponseSchema`, `QuizResponse` from `@/quiz/schema`; `QuizRequest` from `@/quiz/types`; `QUIZ_SYSTEM_PROMPT`, `buildQuizUserPrompt`, `quizMaxTokens` from `./quizPrompt`.
- Produces: `interface QuizProvider { generateQuiz(request: QuizRequest, signal?: AbortSignal): Promise<QuizResponse> }` exported from `@/ai/provider`; `GroqProvider implements AIProvider, QuizProvider`.

- [ ] **Step 1: Write the failing test**

Create `src/ai/groqQuiz.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPOUND_DECK_MODEL, DECK_MODEL, GroqProvider } from './groqProvider'
import { quizMaxTokens } from './quizPrompt'
import type { QuizRequest } from '@/quiz/types'

const REQUEST: QuizRequest = {
  title: 'Biology',
  slides: [{ slide: 1, heading: 'Cells', lines: ['Cells are small'] }],
  count: 3,
  config: { type: 'true_false', notation: 'word' },
}

const GOOD = JSON.stringify({ questions: [{ slide: 1, prompt: 'Cells are small.', answer: true }] })

function ok(content: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null },
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => '',
  } as unknown as Response
}

function failure(status: number, message: string): Response {
  return {
    ok: false,
    status,
    statusText: 'err',
    headers: { get: () => null },
    json: async () => ({ error: { message } }),
    text: async () => '',
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GroqProvider.generateQuiz', () => {
  it('returns the parsed reply on the first try, in JSON mode on the deck model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(GOOD))
    vi.stubGlobal('fetch', fetchMock)

    const res = await new GroqProvider('key').generateQuiz(REQUEST)

    expect(res.questions).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.model).toBe(DECK_MODEL)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.max_tokens).toBe(quizMaxTokens(3))
    expect(body.messages[1].content).toContain('exactly 3')
  })

  it('uses the model the instance was built with (the compound link)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(GOOD))
    vi.stubGlobal('fetch', fetchMock)
    await new GroqProvider('key', { deckModel: COMPOUND_DECK_MODEL }).generateQuiz(REQUEST)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe(COMPOUND_DECK_MODEL)
  })

  it('tolerates a fenced reply (groq/compound wraps its JSON)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok('**Quiz**\n```json\n' + GOOD + '\n```')))
    const res = await new GroqProvider('key').generateQuiz(REQUEST)
    expect(res.questions).toHaveLength(1)
  })

  it('retries once with the validation errors, then succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('{"questions":[]}')).mockResolvedValueOnce(ok(GOOD))
    vi.stubGlobal('fetch', fetchMock)

    const res = await new GroqProvider('key').generateQuiz(REQUEST)

    expect(res.questions).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(retryBody.messages).toHaveLength(4)
    expect(retryBody.messages[3].content).toContain('failed schema validation')
  })

  it('throws a response-kind error when the retry is also unusable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok('not json at all')))
    await expect(new GroqProvider('key').generateQuiz(REQUEST)).rejects.toMatchObject({
      name: 'AIProviderError',
      kind: 'response',
    })
  })

  it('surfaces an auth failure after one call and does not retry it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(failure(401, 'bad key'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new GroqProvider('key').generateQuiz(REQUEST)).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('threads the AbortSignal into fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(GOOD))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await new GroqProvider('key').generateQuiz(REQUEST, controller.signal)
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('refuses to call the network with a blank key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(new GroqProvider('  ').generateQuiz(REQUEST)).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ai/groqQuiz.test.ts`
Expected: FAIL — `generateQuiz is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/ai/provider.ts`, add these imports near the top (after the existing `@/generation/schemas` import):

```ts
import type { QuizRequest } from '@/quiz/types'
import type { QuizResponse } from '@/quiz/schema'
```

and add, directly after the `AIProvider` interface (before the `AIFailureKind` doc comment):

```ts
/**
 * Quiz generation is a separate, narrower contract than `AIProvider` on
 * purpose: only Groq (the free model) writes quizzes, and forcing stubs onto
 * the Anthropic and Gemini providers would only add code that must never run.
 * The quiz never touches a deck's cards — it is not a second deck generation.
 */
export interface QuizProvider {
  generateQuiz(request: QuizRequest, signal?: AbortSignal): Promise<QuizResponse>
}
```

In `src/ai/groqProvider.ts`:

1. Add to the imports at the top:

```ts
import { quizResponseSchema, type QuizResponse } from '@/quiz/schema'
import type { QuizRequest } from '@/quiz/types'
import { QUIZ_SYSTEM_PROMPT, buildQuizUserPrompt, quizMaxTokens } from './quizPrompt'
```

and add `type QuizProvider,` to the existing `from './provider'` import list.

2. Add after `tryParseNarration`:

```ts
function tryParseQuiz(raw: string): { data: QuizResponse } | { error: string } {
  const extracted = extractJsonObject(raw)
  if (extracted === null) return { error: 'Invalid JSON: no JSON object found in the response' }
  let json: unknown
  try {
    json = JSON.parse(extracted)
  } catch (err) {
    return { error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
  const result = quizResponseSchema.safeParse(json)
  if (result.success) return { data: result.data }
  return { error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}
```

3. Change the class declaration to `export class GroqProvider implements AIProvider, QuizProvider {` and add this method after `generateNarration`:

```ts
  async generateQuiz(request: QuizRequest, signal?: AbortSignal): Promise<QuizResponse> {
    if (!this.apiKey.trim()) throw noKeyError()

    const messages: GroqMessage[] = [
      { role: 'system', content: QUIZ_SYSTEM_PROMPT },
      { role: 'user', content: buildQuizUserPrompt(request) },
    ]
    // Full retry policy (like deck and narration): there is no quiz without this call.
    const options: CallGroqOptions = {
      model: this.deckModel,
      maxTokens: quizMaxTokens(request.count),
      jsonMode: true,
      temperature: 0.7,
    }

    const first = await callGroq(this.apiKey, messages, options, signal)
    const firstResult = tryParseQuiz(first)
    if ('data' in firstResult) return firstResult.data

    // One retry with the exact validation errors, as the deck path does.
    const retryMessages: GroqMessage[] = [
      ...messages,
      { role: 'assistant', content: first },
      {
        role: 'user',
        content: `That response failed schema validation with these errors: ${firstResult.error}. Reply again with ONLY the corrected JSON object, no other text.`,
      },
    ]
    const second = await callGroq(this.apiKey, retryMessages, options, signal)
    const secondResult = tryParseQuiz(second)
    if ('data' in secondResult) return secondResult.data

    throw new AIProviderError('The AI returned a quiz that could not be read. Try again.', {
      kind: 'response',
    })
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/ai/groqQuiz.test.ts src/ai/groqProvider.test.ts`
Expected: PASS for both (the existing Groq tests must still pass).

- [ ] **Step 5: Commit**

```bash
git add src/ai/provider.ts src/ai/groqProvider.ts src/ai/groqQuiz.test.ts
git commit -m "feat(quiz): GroqProvider.generateQuiz behind a narrow QuizProvider contract

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Failover for quizzes — `runWithFailover`, `QUIZ_CHAIN`

**Files:**
- Modify: `src/ai/fallbackProvider.ts`
- Test: `src/ai/quizFallback.test.ts`

**Interfaces:**
- Consumes: `QuizProvider`, `AIProviderError` from `./provider`; `QuizRequest` from `@/quiz/types`; `QuizResponse` from `@/quiz/schema`.
- Produces (exported from `@/ai/fallbackProvider`):
  - `interface Named<P> { name: string; provider: P }` and `NamedProvider = Named<AIProvider>` (existing name kept)
  - `runWithFailover<P, T>(chain: Named<P>[], label: string, call: (provider: P) => Promise<T>, signal?: AbortSignal): Promise<T>`
  - `type NamedQuizProvider = Named<QuizProvider>`
  - `QUIZ_CHAIN: NamedQuizProvider[]` (empty without `VITE_GROQ_API_KEY`)
  - `generateQuizWithFallback(chain: NamedQuizProvider[], request: QuizRequest, signal?: AbortSignal): Promise<QuizResponse>`

- [ ] **Step 1: Write the failing test**

Create `src/ai/quizFallback.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { generateQuizWithFallback, type NamedQuizProvider } from './fallbackProvider'
import { AIProviderError, type QuizProvider } from './provider'
import type { QuizResponse } from '@/quiz/schema'
import type { QuizRequest } from '@/quiz/types'

const REQUEST: QuizRequest = {
  title: 'Deck',
  slides: [{ slide: 1, heading: 'Intro', lines: ['A point'] }],
  count: 2,
  config: { type: 'true_false', notation: 'word' },
}
const RESPONSE: QuizResponse = { questions: [{ slide: 1, prompt: 'Statement', answer: true }] }

function stub(behavior: () => Promise<QuizResponse>): QuizProvider & { calls: () => number } {
  let calls = 0
  return {
    calls: () => calls,
    generateQuiz: async () => {
      calls++
      return behavior()
    },
  }
}

function chainOf(...providers: QuizProvider[]): NamedQuizProvider[] {
  return providers.map((provider, i) => ({ name: `P${i}`, provider }))
}

describe('generateQuizWithFallback', () => {
  it('returns the first provider’s quiz without touching the second', async () => {
    const a = stub(async () => RESPONSE)
    const b = stub(async () => RESPONSE)
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST)).resolves.toEqual(RESPONSE)
    expect(b.calls()).toBe(0)
  })

  it('falls over when the first is out of capacity', async () => {
    const a = stub(async () => {
      throw new AIProviderError('busy', { kind: 'capacity', status: 429 })
    })
    const b = stub(async () => RESPONSE)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST)).resolves.toEqual(RESPONSE)
    expect(b.calls()).toBe(1)
  })

  /* Load-bearing: a mistyped key must surface, not be hidden by the backup. */
  it('does not fall over on an auth failure', async () => {
    const a = stub(async () => {
      throw new AIProviderError('bad key', { kind: 'auth', status: 401 })
    })
    const b = stub(async () => RESPONSE)
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST)).rejects.toThrow('bad key')
    expect(b.calls()).toBe(0)
  })

  it.each(['request', 'response', 'unknown'] as const)('does not fall over on a %s failure', async (kind) => {
    const a = stub(async () => {
      throw new AIProviderError('nope', { kind })
    })
    const b = stub(async () => RESPONSE)
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST)).rejects.toThrow('nope')
    expect(b.calls()).toBe(0)
  })

  it('never hands off after the user cancelled', async () => {
    const controller = new AbortController()
    const a = stub(async () => {
      controller.abort()
      throw new AIProviderError('busy', { kind: 'capacity', status: 429 })
    })
    const b = stub(async () => RESPONSE)
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST, controller.signal)).rejects.toThrow('busy')
    expect(b.calls()).toBe(0)
  })

  it('never hands off on a bare AbortError', async () => {
    const a = stub(async () => {
      throw new DOMException('Aborted', 'AbortError')
    })
    const b = stub(async () => RESPONSE)
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST)).rejects.toThrow('Aborted')
    expect(b.calls()).toBe(0)
  })

  it('rethrows the last provider’s capacity failure', async () => {
    const busy = () =>
      stub(async () => {
        throw new AIProviderError('busy', { kind: 'capacity', status: 429 })
      })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(generateQuizWithFallback(chainOf(busy(), busy()), REQUEST)).rejects.toThrow('busy')
  })

  it('reports a missing key when the chain is empty', async () => {
    await expect(generateQuizWithFallback([], REQUEST)).rejects.toMatchObject({ kind: 'auth' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ai/quizFallback.test.ts`
Expected: FAIL — `generateQuizWithFallback` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/ai/fallbackProvider.ts`:

1. Add `type QuizProvider,` to the `from './provider'` import list, and add:

```ts
import type { QuizRequest } from '@/quiz/types'
import type { QuizResponse } from '@/quiz/schema'
```

2. Replace the `NamedProvider` interface with a generic one:

```ts
/** A provider plus a human-readable name, used only for the console breadcrumb. */
export interface Named<P> {
  name: string
  provider: P
}
export type NamedProvider = Named<AIProvider>
export type NamedQuizProvider = Named<QuizProvider>
```

3. Move the failover loop out of the class. Add this exported function directly after `isAbort` (the body is the existing `run` body, generalised over the provider type; keep its comment):

```ts
/**
 * The one failover loop: try links in order, move on only when the current one
 * is out of capacity, never after a cancel. `label` is used only for the
 * console breadcrumb; `'deck'` is omitted from the breadcrumb to keep its
 * original wording, since it was the only method before this helper existed.
 * Shared by `FallbackProvider` and the quiz chain, so the two cannot drift.
 */
export async function runWithFailover<P, T>(
  chain: Named<P>[],
  label: string,
  call: (provider: P) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  for (let i = 0; i < chain.length; i++) {
    const { name, provider } = chain[i]
    const isLast = i === chain.length - 1
    try {
      return await call(provider)
    } catch (err) {
      if (isLast || isAbort(err, signal) || !isFailoverable(err)) throw err
      console.warn(
        `[ai] ${name} is out of capacity (${err instanceof AIProviderError ? err.status : '?'}); falling back to ${chain[i + 1].name}${label === 'deck' ? '' : ` for ${label}`}`,
      )
    }
  }
  // Unreachable for a non-empty chain: the loop either returns or rethrows on the last link.
  throw new AIProviderError(`No AI provider was able to complete ${label}.`)
}
```

4. Replace the body of `FallbackProvider`'s private `run` with a delegation (keep the method so the four public methods stay unchanged):

```ts
  private run<T>(
    label: string,
    call: (provider: AIProvider) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return runWithFailover(this.chain, label, call, signal)
  }
```

5. After `PROVIDER_CHAIN`, add:

```ts
/**
 * Quizzes use the FREE model only, so this chain is the two Groq links and
 * nothing else — never Anthropic (billed per token) or Gemini. Empty without
 * `VITE_GROQ_API_KEY`; the editor disables the Quiz button in that case.
 */
export const QUIZ_CHAIN: NamedQuizProvider[] = GROQ_API_KEY
  ? [
      { name: 'Groq', provider: new GroqProvider(GROQ_API_KEY) },
      {
        name: 'Groq compound',
        provider: new GroqProvider(GROQ_API_KEY, { deckModel: COMPOUND_DECK_MODEL, supportsResearch: false }),
      },
    ]
  : []

export function generateQuizWithFallback(
  chain: NamedQuizProvider[],
  request: QuizRequest,
  signal?: AbortSignal,
): Promise<QuizResponse> {
  if (chain.length === 0) {
    return Promise.reject(
      new AIProviderError('Quiz generation needs VITE_GROQ_API_KEY in your .env file.', { kind: 'auth' }),
    )
  }
  return runWithFailover(chain, 'quiz', (provider) => provider.generateQuiz(request, signal), signal)
}
```

- [ ] **Step 4: Run all AI tests**

Run: `npx vitest run src/ai`
Expected: PASS — the new file and every existing fallback/narration/research test (the extraction must not change behaviour).

- [ ] **Step 5: Mutation check**

Temporarily change `isFailoverable` to `return err instanceof AIProviderError && (err.kind === 'capacity' || err.kind === 'auth')`, run `npx vitest run src/ai/quizFallback.test.ts`, confirm "does not fall over on an auth failure" FAILS, then revert.

- [ ] **Step 6: Commit**

```bash
git add src/ai/fallbackProvider.ts src/ai/quizFallback.test.ts
git commit -m "feat(quiz): Groq-only quiz chain sharing the capacity-only failover loop

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Migration 0012 and its hand-run SQL checks

**Files:**
- Create: `supabase/migrations/0012_quizzes.sql`
- Create: `supabase/tests/0012_quiz_rls.sql`

**Interfaces:**
- Produces (SQL, used by Task 7's `quiz/api.ts`):
  - columns `quizzes.code text not null unique`, `quizzes.quiz_type text`, `quizzes.settings jsonb`
  - `create_quiz(p_presentation_id uuid, p_title text, p_deck_title text, p_quiz_type text, p_settings jsonb, p_questions jsonb) returns jsonb` → `{"id": uuid, "code": text}`. Each element of `p_questions`: `{slide_number:int, slide_heading:text, card_id:uuid|null, prompt:text, choices:[text], answer:jsonb}`.
  - `get_quiz_for_taking(p_code text) returns jsonb` → `{id, title, deck_title, quiz_type, settings, classes:[{id,name,attempted}], questions:[{id,order_index,slide_number,prompt,choices}], word_box: [text]|null}`
  - `submit_quiz_attempt(p_code text, p_class_id uuid, p_answers jsonb) returns jsonb` → `{score, correct, total, results:[bool]}`; `p_answers` is an object mapping question id → value (number for MC index, string for a blank, boolean for T/F).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_quizzes.sql`:

```sql
-- 0012_quizzes.sql
-- Quiz generation, sharing and taking. Builds on 0009's quiz tables.
--
--   * quizzes gain a share code, a type and its presentation settings.
--   * create_quiz saves a quiz and its questions atomically (security INVOKER,
--     so RLS still decides who may save it).
--   * get_quiz_for_taking / submit_quiz_attempt are the ONLY way a student
--     touches a quiz. quiz_questions stays owner-only: answers never leave the
--     database except to the deck's owner, and scoring happens here.
-- No RLS policy selects from another RLS table; cross-table checks live in
-- security definer functions (the 0009 rule).

-- ─── share codes ────────────────────────────────────────────────────────────

-- 8 characters from the same alphabet as generate_join_code() (no 0/O/1/I/L).
-- Keep in step with src/quiz/quizCode.ts.
create or replace function generate_quiz_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from quizzes where code = candidate);
  end loop;
  return candidate;
end;
$$;

alter table quizzes add column if not exists quiz_type text not null default 'multiple_choice'
  check (quiz_type in ('multiple_choice', 'fill_blank', 'true_false'));
alter table quizzes add column if not exists settings jsonb not null default '{}';
alter table quizzes add column if not exists code text;
update quizzes set code = generate_quiz_code() where code is null;
alter table quizzes alter column code set not null;
alter table quizzes alter column code set default generate_quiz_code();
create unique index if not exists quizzes_code_key on quizzes (code);

-- ─── helpers ────────────────────────────────────────────────────────────────

-- Blank answers compare after lower-casing, dropping punctuation and collapsing
-- whitespace, so "The Mitochondria." matches "mitochondria".
create or replace function normalize_answer(t text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(t, '')), '[^[:alnum:][:space:]]', '', 'g'), '\s+', ' ', 'g'));
$$;

-- Refuses a question whose shape doesn't match the quiz type, so a tampered
-- client cannot store garbage that would break taking or scoring.
create or replace function assert_quiz_question(p_type text, q jsonb)
returns void
language plpgsql
immutable
as $$
declare
  n integer;
begin
  -- `is distinct from` throughout: a MISSING field makes jsonb_typeof() NULL, and
  -- `NULL <> 'x'` is NULL, which `if` treats as false — the check would silently
  -- pass. `is distinct from` treats NULL as different, so absence is refused.
  if jsonb_typeof(q) is distinct from 'object' then raise exception 'Each question must be an object.'; end if;
  if trim(coalesce(q->>'prompt', '')) = '' then raise exception 'Every question needs a prompt.'; end if;
  if jsonb_typeof(q->'slide_number') is distinct from 'number' or (q->>'slide_number')::numeric < 1 then
    raise exception 'Every question needs a slide number.';
  end if;

  if p_type = 'multiple_choice' then
    if jsonb_typeof(q->'choices') is distinct from 'array' then raise exception 'A multiple-choice question needs choices.'; end if;
    n := jsonb_array_length(q->'choices');
    if n < 3 or n > 4 then raise exception 'A multiple-choice question has 3 or 4 choices.'; end if;
    if exists (select 1 from jsonb_array_elements(q->'choices') c where jsonb_typeof(c) <> 'string' or trim(c #>> '{}') = '') then
      raise exception 'Choices cannot be blank.';
    end if;
    if jsonb_typeof(q->'answer') is distinct from 'number' then
      raise exception 'The answer must be the index of a choice.';
    end if;
    if (q->>'answer')::numeric < 0 or (q->>'answer')::numeric >= n
       or (q->>'answer')::numeric <> floor((q->>'answer')::numeric) then
      raise exception 'The answer must be the index of a choice.';
    end if;
  elsif p_type = 'fill_blank' then
    if position('___' in q->>'prompt') = 0 then raise exception 'A fill-in-the-blank prompt needs a blank (_____).'; end if;
    if jsonb_typeof(q->'answer') is distinct from 'object' or jsonb_typeof(q->'answer'->'text') is distinct from 'string' then
      raise exception 'A fill-in-the-blank question needs an answer.';
    end if;
    if trim(q->'answer'->>'text') = '' then
      raise exception 'A fill-in-the-blank question needs an answer.';
    end if;
    if jsonb_exists(q->'answer', 'accepted') and jsonb_typeof(q->'answer'->'accepted') is distinct from 'array' then
      raise exception 'Accepted answers must be a list.';
    end if;
  elsif p_type = 'true_false' then
    if jsonb_typeof(q->'answer') is distinct from 'boolean' then raise exception 'A true/false question needs a true or false answer.'; end if;
  else
    raise exception 'Unknown quiz type.';
  end if;
end;
$$;

-- ─── create_quiz ────────────────────────────────────────────────────────────

create or replace function create_quiz(
  p_presentation_id uuid,
  p_title text,
  p_deck_title text,
  p_quiz_type text,
  p_settings jsonb,
  p_questions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
  q jsonb;
  new_id uuid;
  new_code text;
begin
  if auth.uid() is null then raise exception 'Log in to create a quiz.'; end if;
  if trim(coalesce(p_title, '')) = '' then raise exception 'A quiz needs a title.'; end if;
  if jsonb_typeof(p_questions) is distinct from 'array' then raise exception 'Questions must be a list.'; end if;
  n := jsonb_array_length(p_questions);
  if n < 1 or n > 20 then raise exception 'A quiz has between 1 and 20 questions.'; end if;
  -- Under invoker rights, presentations' owner-only RLS decides visibility.
  if not exists (select 1 from presentations where id = p_presentation_id) then
    raise exception 'That deck isn''t available.';
  end if;

  for q in select value from jsonb_array_elements(p_questions) loop
    perform assert_quiz_question(p_quiz_type, q);
  end loop;

  insert into quizzes (presentation_id, title, deck_title, quiz_type, settings)
  values (p_presentation_id, trim(p_title), coalesce(nullif(trim(p_deck_title), ''), trim(p_title)), p_quiz_type, coalesce(p_settings, '{}'))
  returning id, code into new_id, new_code;

  insert into quiz_questions (quiz_id, order_index, card_id, slide_number, slide_heading, prompt, choices, answer)
  select
    new_id,
    (t.ord - 1)::int,
    nullif(t.elem->>'card_id', '')::uuid,
    (t.elem->>'slide_number')::int,
    coalesce(t.elem->>'slide_heading', ''),
    trim(t.elem->>'prompt'),
    coalesce(t.elem->'choices', '[]'::jsonb),
    t.elem->'answer'
  from jsonb_array_elements(p_questions) with ordinality as t(elem, ord);

  return jsonb_build_object('id', new_id, 'code', new_code);
end;
$$;

-- ─── get_quiz_for_taking ────────────────────────────────────────────────────

create or replace function get_quiz_for_taking(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quiz quizzes%rowtype;
  eligible jsonb;
  question_list jsonb;
  words jsonb := null;
begin
  if auth.uid() is null then raise exception 'Log in to take a quiz.'; end if;

  select * into quiz from quizzes where code = upper(trim(p_code));
  if not found then raise exception 'No quiz with that code.'; end if;
  if not exists (select 1 from quiz_classes where quiz_id = quiz.id) then
    raise exception 'This quiz isn''t available yet.';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', c.id,
             'name', c.name,
             'attempted', exists (
               select 1 from quiz_attempts a
               where a.quiz_id = quiz.id and a.class_id = c.id and a.student_id = auth.uid())
           ) order by qc.posted_at), '[]'::jsonb)
    into eligible
    from quiz_classes qc
    join classes c on c.id = qc.class_id
    join class_members m on m.class_id = c.id and m.student_id = auth.uid()
    where qc.quiz_id = quiz.id;

  if jsonb_array_length(eligible) = 0 then
    raise exception 'This quiz is posted to a class you haven''t joined. Join the class with its class code first.';
  end if;

  -- Deliberately no `answer` column here.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', qq.id,
             'order_index', qq.order_index,
             'slide_number', qq.slide_number,
             'prompt', qq.prompt,
             'choices', qq.choices
           ) order by qq.order_index), '[]'::jsonb)
    into question_list
    from quiz_questions qq
    where qq.quiz_id = quiz.id;

  -- The word box is every answer, shuffled stably (same on every load). It
  -- reveals the set of answers but not which blank each one fills.
  if quiz.quiz_type = 'fill_blank' and coalesce((quiz.settings->>'wordBox')::boolean, false) then
    select coalesce(jsonb_agg(s.w order by md5(s.w || quiz.id::text)), '[]'::jsonb)
      into words
      from (select distinct (qq.answer->>'text') as w from quiz_questions qq where qq.quiz_id = quiz.id) s;
  end if;

  return jsonb_build_object(
    'id', quiz.id,
    'title', quiz.title,
    'deck_title', quiz.deck_title,
    'quiz_type', quiz.quiz_type,
    'settings', quiz.settings,
    'classes', eligible,
    'questions', question_list,
    'word_box', words
  );
end;
$$;

-- ─── submit_quiz_attempt ────────────────────────────────────────────────────

create or replace function submit_quiz_attempt(p_code text, p_class_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quiz quizzes%rowtype;
  rec record;
  given jsonb;
  ok boolean;
  norm text;
  total integer := 0;
  correct integer := 0;
  results jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Log in to take a quiz.'; end if;

  select * into quiz from quizzes where code = upper(trim(p_code));
  if not found then raise exception 'No quiz with that code.'; end if;
  if not exists (select 1 from class_members where class_id = p_class_id and student_id = auth.uid()) then
    raise exception 'You''re not in that class.';
  end if;
  if not exists (select 1 from quiz_classes where quiz_id = quiz.id and class_id = p_class_id) then
    raise exception 'This quiz isn''t posted to that class.';
  end if;
  if exists (select 1 from quiz_attempts where quiz_id = quiz.id and class_id = p_class_id and student_id = auth.uid()) then
    raise exception 'You''ve already submitted this quiz for this class.';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'Answer every question before submitting.';
  end if;

  for rec in select qq.id, qq.answer from quiz_questions qq where qq.quiz_id = quiz.id order by qq.order_index loop
    total := total + 1;
    given := p_answers -> (rec.id::text);
    ok := false;

    if given is not null and jsonb_typeof(given) <> 'null' then
      if quiz.quiz_type = 'multiple_choice' then
        ok := jsonb_typeof(given) = 'number' and given = rec.answer;
      elsif quiz.quiz_type = 'true_false' then
        ok := jsonb_typeof(given) = 'boolean' and given = rec.answer;
      elsif quiz.quiz_type = 'fill_blank' then
        if jsonb_typeof(given) = 'string' then
          norm := normalize_answer(given #>> '{}');
          ok := norm <> '' and (
            norm = normalize_answer(rec.answer->>'text')
            or exists (
              select 1 from jsonb_array_elements_text(coalesce(rec.answer->'accepted', '[]'::jsonb)) a
              where normalize_answer(a) = norm)
          );
        end if;
      end if;
    end if;

    if ok then correct := correct + 1; end if;
    results := results || to_jsonb(ok);
  end loop;

  if total = 0 then raise exception 'This quiz has no questions.'; end if;

  begin
    insert into quiz_attempts (quiz_id, class_id, student_id, score)
    values (quiz.id, p_class_id, auth.uid(), correct::numeric / total);
  exception when unique_violation then
    raise exception 'You''ve already submitted this quiz for this class.';
  end;

  return jsonb_build_object(
    'score', correct::numeric / total,
    'correct', correct,
    'total', total,
    'results', results
  );
end;
$$;

-- ─── grants ─────────────────────────────────────────────────────────────────
-- generate_quiz_code is the column default and runs as the inserting user, so
-- (like generate_join_code) it keeps its default execute grant.

revoke execute on function normalize_answer(text) from public, anon;
grant execute on function normalize_answer(text) to authenticated;
revoke execute on function assert_quiz_question(text, jsonb) from public, anon;
grant execute on function assert_quiz_question(text, jsonb) to authenticated;
revoke execute on function create_quiz(uuid, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function create_quiz(uuid, text, text, text, jsonb, jsonb) to authenticated;
revoke execute on function get_quiz_for_taking(text) from public, anon;
grant execute on function get_quiz_for_taking(text) to authenticated;
revoke execute on function submit_quiz_attempt(text, uuid, jsonb) from public, anon;
grant execute on function submit_quiz_attempt(text, uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Write the hand-run checks**

Create `supabase/tests/0012_quiz_rls.sql`. Follow the structure of `supabase/tests/0009_classroom_rls.sql` (one transaction that rolls back; fixtures as `postgres`; `set local role authenticated`; `select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)` to switch user; `do $$ ... raise exception '<who>: <what>' ... $$` for each check; ends with `rollback;` and a passing notice). Use these fixtures (new uuids, distinct from 0009's):

```sql
-- Hand-run checks for 0012_quizzes.sql. Paste into the Supabase SQL editor
-- (runs as postgres) after applying 0009–0012. One transaction that rolls back;
-- any failed check raises with a message naming it; a clean run prints
-- "quiz RLS checks passed".

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000000101', 'q-teacher@example.test',  '{"role":"teacher","display_name":"Quinn Teacher"}'),
  ('00000000-0000-4000-a000-000000000102', 'q-student@example.test',  '{"role":"student","display_name":"Sasha Student"}'),
  ('00000000-0000-4000-a000-000000000103', 'q-outsider@example.test', '{"role":"student","display_name":"Otto Outsider"}'),
  ('00000000-0000-4000-a000-000000000104', 'q-general@example.test',  '{"display_name":"Gina General"}');

insert into presentations (id, owner_id, title, theme)
values ('00000000-0000-4000-e000-000000000101', '00000000-0000-4000-a000-000000000101', 'Cells', '{}'),
       ('00000000-0000-4000-e000-000000000104', '00000000-0000-4000-a000-000000000104', 'General deck', '{}');

insert into classes (id, teacher_id, name, join_code)
values ('00000000-0000-4000-b000-000000000101', '00000000-0000-4000-a000-000000000101', 'Quiz Biology', 'QZBIO2');
insert into class_members (class_id, student_id)
values ('00000000-0000-4000-b000-000000000101', '00000000-0000-4000-a000-000000000102');

set local role authenticated;
```

Then the following checks, each as its own `do $$` block (the executing engineer writes them out in the 0009 style; each bullet is one block and its expected outcome):

1. **As teacher (`...101`)**: `create_quiz('…e000-…101', 'Cells quiz', 'Cells', 'multiple_choice', '{"choiceCount":4}', <2 valid MC questions>)` returns an object whose `code` matches `^[A-HJKMNP-Z2-9]{8}$` and `id` is not null; the quiz and both questions then exist and are readable by the teacher (`select count(*) from quiz_questions` = 2).
2. **As teacher**: `create_quiz` raises for each of: 0 questions; 21 questions; `p_questions` of `null`; a question with 2 choices; an MC question with **no `choices` key at all**; an MC answer of `4` with 4 choices; an MC question with **no `answer` key**; a fill-blank prompt with no `___`; a fill-blank whose `answer` is a bare string instead of `{text, accepted}`; a true/false `answer` of `"yes"`; a question missing `slide_number`; an unknown type `'essay'`. The "missing key" cases matter: a missing field yields a NULL comparison, and the migration must refuse it rather than let `if NULL` fall through. (One `begin … exception when others then failed := true; end` per case, raising if it did not fail — same pattern as 0009's account-type check.)
3. **As teacher**: post the quiz — `insert into quiz_classes (quiz_id, class_id)` for the class succeeds.
4. **As general (`...104`)**: `create_quiz('…e000-…104', 'General quiz', 'General deck', 'true_false', '{"notation":"word"}', <1 valid T/F question>)` **succeeds**; `create_quiz` for the *teacher's* presentation (`…e000-…101`) **raises** ("That deck isn't available."); inserting into `quiz_classes` for the teacher's class **fails** (0 rows visible / policy refusal).
5. **As student (`...102`)**: `select count(*) from quiz_questions` = 0 (answers unreadable); `get_quiz_for_taking(<code>)` succeeds, returns `questions` of length 2, and **no element of `questions` has an `answer` key** (`jsonb_path_exists(result, '$.questions[*].answer')` is false); `classes` has exactly the one class with `attempted = false`.
6. **As outsider (`...103`)**: `get_quiz_for_taking(<code>)` raises; the message contains "haven't joined". `submit_quiz_attempt(<code>, <class>, '{}')` raises "You're not in that class."
7. **Unknown / unposted**: as the student, `get_quiz_for_taking('ZZZZZZZZ')` raises "No quiz with that code."; the general user's quiz code raises "This quiz isn't available yet." (it is not posted anywhere).
8. **Scoring, multiple choice** (as student): with questions whose stored answers are indices 1 and 2, `submit_quiz_attempt(code, class, {"<q1 id>":1,"<q2 id>":0})` returns `correct = 1`, `total = 2`, `score = 0.5`, `results = [true,false]`, and one `quiz_attempts` row exists for the student. (Read question ids as `postgres`-side fixtures by inserting the quiz and questions as `postgres` *before* `set local role`, with fixed ids, rather than reading them back as the student.)
9. **Second attempt refused**: calling `submit_quiz_attempt` again for the same class raises "already submitted".
10. **Scoring, fill in the blank** (separate quiz inserted as `postgres`, posted to the class, `settings {"wordBox":true}`, answers `{"text":"Mitochondria","accepted":["mitochondrion"]}`): as the student, a submission of `"  the MITOCHONDRIA. "` scores **wrong** (extra word), `"mitochondria!"` scores right, `"Mitochondrion"` scores right, `""` scores wrong. Use one fresh student per case (insert extra `auth.users` students + `class_members` rows as `postgres`) because of the one-attempt rule. `get_quiz_for_taking` for this quiz returns a non-null `word_box` containing `"Mitochondria"`.
11. **Scoring, true/false**: a boolean matching the stored answer scores right; the string `"true"` (wrong JSON type) scores wrong.
12. **Teacher sees results**: as the teacher, `select count(*) from quiz_attempts` equals the number of attempts written above.

End with:

```sql
rollback;
do $$ begin raise notice 'quiz RLS checks passed'; end $$;
```

(If `rollback` and a trailing `do` conflict in the Supabase editor, mirror exactly how the last lines of `0009_classroom_rls.sql` do it.)

- [ ] **Step 3: Apply and run**

Apply `0012_quizzes.sql` to the project's Supabase database (SQL editor), then paste and run `supabase/tests/0012_quiz_rls.sql`.
Expected: a clean run ending with "quiz RLS checks passed". Also re-run `supabase/tests/0009_classroom_rls.sql` and `0010_account_type_lock.sql` to confirm the migration broke neither (the 0009 fixtures insert `quizzes` without a code — the new default must fill it).

If no database is available to the implementer, stop after Step 1–2, say so explicitly in the report, and do not claim the SQL is verified.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_quizzes.sql supabase/tests/0012_quiz_rls.sql
git commit -m "feat(quiz): migration 0012 — share codes, create/take/submit RPCs, RLS checks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Client data layer — quiz codes and `quiz/api.ts`

**Files:**
- Create: `src/quiz/quizCode.ts`, `src/quiz/quizCode.test.ts`
- Create: `src/quiz/api.ts`
- Create: `src/quiz/rows.ts`, `src/quiz/rows.test.ts`
- Modify: `src/classroom/api.ts` (export `db`, `many`, `changed`, `rpcValue`)
- Modify: `src/classroom/types.ts`, `src/classroom/rows.ts` (quiz code/type on `QuizSummary`)

**Interfaces:**
- Consumes: `QuizConfig`, `QuizQuestionDraft`, `toDbConfig`, `fromDbConfig` from `@/quiz/types`; `db`, `many`, `changed`, `rpcValue` from `@/classroom/api`.
- Produces:
  - `QUIZ_CODE_ALPHABET`, `QUIZ_CODE_LENGTH = 8`, `normalizeQuizCode(input): string`, `quizCodeProblem(input): string | null`
  - `QuizSummary` gains `code: string; quizType: QuizType; settings: QuizConfig` (settings holds the full config)
  - `interface OwnerQuiz { id: string; code: string; title: string; deckTitle: string; createdAt: string; config: QuizConfig; questions: OwnerQuestion[] }`, `interface OwnerQuestion { id: string; slideNumber: number; slideHeading: string; prompt: string; choices: string[]; answer: QuizAnswer }`
  - `interface DeckQuizSummary { id: string; code: string; title: string; createdAt: string; config: QuizConfig; itemCount: number }`
  - `interface TakeQuiz { id: string; title: string; deckTitle: string; config: QuizConfig; classes: { id: string; name: string; attempted: boolean }[]; questions: TakeQuestion[]; wordBox: string[] | null }`, `interface TakeQuestion { id: string; slideNumber: number; prompt: string; choices: string[] }`
  - `type SubmittedAnswers = Record<string, number | string | boolean>`; `interface AttemptResult { score: number; correct: number; total: number; results: boolean[] }`
  - `createQuiz(input: { presentationId: string; title: string; deckTitle: string; config: QuizConfig; questions: QuizQuestionDraft[] }): Promise<{ id: string; code: string }>`
  - `listQuizzesForDeck(presentationId: string): Promise<DeckQuizSummary[]>`
  - `loadOwnerQuiz(quizId: string): Promise<OwnerQuiz>`
  - `postQuiz(quizId: string, classId: string): Promise<void>`, `unpostQuiz(quizId: string, classId: string): Promise<void>`
  - `getQuizForTaking(code: string): Promise<TakeQuiz>`, `submitQuizAttempt(code: string, classId: string, answers: SubmittedAnswers): Promise<AttemptResult>`

- [ ] **Step 1: Write the failing tests**

Create `src/quiz/quizCode.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { JOIN_CODE_ALPHABET } from '@/classroom/joinCode'
import { QUIZ_CODE_ALPHABET, QUIZ_CODE_LENGTH, normalizeQuizCode, quizCodeProblem } from './quizCode'

describe('quiz codes', () => {
  it('uses the class-code alphabet (must match generate_quiz_code() in migration 0012)', () => {
    expect(QUIZ_CODE_ALPHABET).toBe(JOIN_CODE_ALPHABET)
    expect(QUIZ_CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
    expect(QUIZ_CODE_LENGTH).toBe(8)
  })

  it('normalises whitespace and case', () => {
    expect(normalizeQuizCode(' ab cd 23 xy ')).toBe('ABCD23XY')
  })

  it('explains why a code cannot be right', () => {
    expect(quizCodeProblem('')).toMatch(/enter/i)
    expect(quizCodeProblem('ABC')).toMatch(/8 characters/)
    expect(quizCodeProblem('ABCD23X0')).toMatch(/lookalike/)
    expect(quizCodeProblem('ABCD23XY')).toBeNull()
  })
})
```

Create `src/quiz/rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deckQuizFromRow, ownerQuizFromRows, takeQuizFromJson } from './rows'

describe('deckQuizFromRow', () => {
  it('maps a quizzes row with a question count', () => {
    expect(
      deckQuizFromRow({
        id: 'q1',
        code: 'ABCD23XY',
        title: 'Cells quiz',
        created_at: '2026-09-24T00:00:00Z',
        quiz_type: 'fill_blank',
        settings: { wordBox: true },
        quiz_questions: [{ count: 5 }],
      }),
    ).toEqual({
      id: 'q1',
      code: 'ABCD23XY',
      title: 'Cells quiz',
      createdAt: '2026-09-24T00:00:00Z',
      config: { type: 'fill_blank', wordBox: true },
      itemCount: 5,
    })
  })

  it('defaults the count to 0 when the aggregate is missing', () => {
    expect(
      deckQuizFromRow({ id: 'q', code: 'C', title: 'T', created_at: 'x', quiz_type: 'true_false', settings: {} }).itemCount,
    ).toBe(0)
  })
})

describe('ownerQuizFromRows', () => {
  it('orders questions and keeps the answers', () => {
    const quiz = ownerQuizFromRows(
      { id: 'q', code: 'C', title: 'T', deck_title: 'D', created_at: 'x', quiz_type: 'true_false', settings: { notation: 'letter' } },
      [
        { id: 'b', order_index: 1, slide_number: 2, slide_heading: 'H2', prompt: 'P2', choices: [], answer: false },
        { id: 'a', order_index: 0, slide_number: 1, slide_heading: 'H1', prompt: 'P1', choices: [], answer: true },
      ],
    )
    expect(quiz.config).toEqual({ type: 'true_false', notation: 'letter' })
    expect(quiz.questions.map((q) => q.id)).toEqual(['a', 'b'])
    expect(quiz.questions[0].answer).toBe(true)
  })
})

describe('takeQuizFromJson', () => {
  it('maps the RPC payload and never expects an answer', () => {
    const quiz = takeQuizFromJson({
      id: 'q',
      title: 'T',
      deck_title: 'D',
      quiz_type: 'multiple_choice',
      settings: { choiceCount: 3 },
      classes: [{ id: 'c', name: 'Bio', attempted: false }],
      questions: [{ id: 'x', order_index: 0, slide_number: 2, prompt: 'P', choices: ['a', 'b', 'c'] }],
      word_box: null,
    })
    expect(quiz.config).toEqual({ type: 'multiple_choice', choiceCount: 3 })
    expect(quiz.questions[0]).toEqual({ id: 'x', slideNumber: 2, prompt: 'P', choices: ['a', 'b', 'c'] })
    expect(quiz.wordBox).toBeNull()
    expect('answer' in quiz.questions[0]).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/quiz/quizCode.test.ts src/quiz/rows.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `src/quiz/quizCode.ts`:

```ts
import { JOIN_CODE_ALPHABET } from '@/classroom/joinCode'

/*
  Must match generate_quiz_code() in migration 0012. Same alphabet as class
  join codes (no 0/O, 1/I, L) because codes are read off a projector and typed
  by hand; longer (8) because a quiz code, unlike a class code, is not
  re-issued and is worth being harder to guess.
*/
export const QUIZ_CODE_ALPHABET = JOIN_CODE_ALPHABET
export const QUIZ_CODE_LENGTH = 8

export function normalizeQuizCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}

/** Why a typed code cannot be right, checked before asking the server. `null` when it could be. */
export function quizCodeProblem(input: string): string | null {
  const code = normalizeQuizCode(input)
  if (!code) return 'Enter the quiz code your teacher gave you.'
  if (code.length !== QUIZ_CODE_LENGTH) return `Quiz codes are ${QUIZ_CODE_LENGTH} characters.`
  if ([...code].some((ch) => !QUIZ_CODE_ALPHABET.includes(ch))) {
    return "That isn't a valid quiz code. Codes never use 0, O, 1, I or L — check for a lookalike."
  }
  return null
}
```

Create `src/quiz/rows.ts`:

```ts
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
```

In `src/classroom/api.ts`, change the four helper declarations to exported: `export async function db()`, `export function many<T>(...)`, `export function changed(...)`, `export function rpcValue<T>(...)`.

Extend the classroom quiz list. In `src/classroom/types.ts` add to `QuizSummary`:

```ts
  /** The share code students use at `/quiz/:code`. */
  code: string
  quizType: import('@/quiz/types').QuizType
```

(Prefer a top-level `import type { QuizType } from '@/quiz/types'` and use `quizType: QuizType`.) In `src/classroom/rows.ts` change `QUIZ_COLUMNS` to `'id, title, deck_title, presentation_id, created_at, code, quiz_type, quiz_questions(slide_number)'`, add `code: string; quiz_type: string` to `QuizRow`, and in `quizFromRow` add `code: row.code, quizType: fromDbConfig(row.quiz_type, {}).type,` (import `fromDbConfig` from `@/quiz/types`). Update `src/classroom/rows.test.ts` and `select.test.ts` fixtures that build a `QuizSummary`/`QuizRow` so they include `code` and `quizType`/`code`/`quiz_type` (run the tests to find each).

Create `src/quiz/api.ts`:

```ts
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
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/quiz src/classroom` then `npx tsc -b`
Expected: PASS and no type errors (fix any `QuizSummary`/`QuizRow` fixtures the compiler points at).

- [ ] **Step 5: Commit**

```bash
git add src/quiz src/classroom
git commit -m "feat(quiz): client data layer (codes, row mapping, quiz api)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: PDF layout and export

**Files:**
- Modify: `package.json` (add `jspdf`)
- Create: `public/fonts/NotoSans-Regular.ttf`, `public/fonts/NotoSans-Bold.ttf`
- Create: `src/quiz/pdf/quizPdfLayout.ts`, `src/quiz/pdf/quizPdfLayout.test.ts`
- Create: `src/quiz/pdf/quizPdf.ts`

**Interfaces:**
- Consumes: `OwnerQuiz`, `OwnerQuestion` from `@/quiz/rows`; `QuizConfig` from `@/quiz/types`.
- Produces:
  - `type PdfItem = { kind: 'title' | 'subtitle' | 'instruction' | 'heading' | 'question' | 'choice' | 'answerLine' | 'wordBox' | 'keyLine' | 'blank'; text: string }`
  - `buildQuizItems(quiz: OwnerQuiz): { sheet: PdfItem[]; key: PdfItem[] }` (pure content, no geometry)
  - `wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[]`
  - `paginate(lines: { height: number; keepWithNext?: boolean }[], pageHeight: number): number[]` — page index per line
  - `exportQuizPdf(quiz: OwnerQuiz): Promise<{ unicodeFont: boolean }>` — loads jsPDF lazily, downloads `<title>.pdf`; `unicodeFont` is false when the Noto font could not be fetched and Helvetica was used

- [ ] **Step 1: Add the dependency and fonts**

Run: `npm install jspdf`
Download Noto Sans Regular and Bold (SIL Open Font License) into `public/fonts/` as `NotoSans-Regular.ttf` and `NotoSans-Bold.ttf` (for example from the `notofonts/latin-greek-cyrillic` release or `fonts.google.com/noto/specimen/Noto+Sans`). Confirm each file is a real TTF (starts with the bytes `00 01 00 00` or `true`) and under ~600 KB. Add `public/fonts/OFL.txt` with the Noto license text.

- [ ] **Step 2: Write the failing test**

Create `src/quiz/pdf/quizPdfLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { OwnerQuiz } from '@/quiz/rows'
import { buildQuizItems, paginate, wrapText } from './quizPdfLayout'

const measure = (s: string) => s.length * 10 // 10 units per character

function quiz(over: Partial<OwnerQuiz>): OwnerQuiz {
  return {
    id: 'q',
    code: 'ABCD23XY',
    title: 'Cells quiz',
    deckTitle: 'Cells',
    createdAt: '2026-09-24T00:00:00Z',
    config: { type: 'multiple_choice', choiceCount: 4 },
    questions: [],
    ...over,
  }
}

describe('wrapText', () => {
  it('wraps on spaces without exceeding the width', () => {
    const lines = wrapText('one two three four five', 90, measure)
    expect(lines).toEqual(['one two', 'three', 'four five']) // 'four five' is exactly 90 wide
    expect(lines.every((l) => measure(l) <= 90)).toBe(true)
  })

  it('breaks a single word that is too long', () => {
    const lines = wrapText('abcdefghijkl', 50, measure)
    expect(lines.every((l) => measure(l) <= 50)).toBe(true)
    expect(lines.join('')).toBe('abcdefghijkl')
  })

  it('returns one empty line for empty text', () => {
    expect(wrapText('', 100, measure)).toEqual([''])
  })
})

describe('paginate', () => {
  it('starts a new page when a line would overflow', () => {
    expect(paginate([{ height: 40 }, { height: 40 }, { height: 40 }], 100)).toEqual([0, 0, 1])
  })

  it('moves a keep-with-next line to the next page with the line it heads', () => {
    // 40 + 40 + 30 (the question) + 30 (its choice) = 140: the question and its
    // choice must land on the same page.
    const pages = paginate([{ height: 40 }, { height: 40 }, { height: 30, keepWithNext: true }, { height: 30 }], 100)
    expect(pages).toEqual([0, 0, 1, 1])
  })

  it('keeps a header with its follower when only the header would fit', () => {
    const pages = paginate([{ height: 60 }, { height: 30, keepWithNext: true }, { height: 30 }], 100)
    expect(pages).toEqual([0, 1, 1])
  })
})

describe('buildQuizItems', () => {
  it('lays out multiple choice with lettered choices and a key', () => {
    const { sheet, key } = buildQuizItems(
      quiz({
        questions: [
          { id: '1', slideNumber: 2, slideHeading: 'Cells', prompt: 'Which?', choices: ['a', 'b', 'c', 'd'], answer: 2 },
        ],
      }),
    )
    expect(sheet.map((i) => i.kind)).toContain('question')
    const choices = sheet.filter((i) => i.kind === 'choice').map((i) => i.text)
    expect(choices).toEqual(['A. a', 'B. b', 'C. c', 'D. d'])
    expect(key.some((i) => i.kind === 'keyLine' && i.text === '1. C')).toBe(true)
  })

  it('uses A–C for three choices', () => {
    const { sheet } = buildQuizItems(
      quiz({
        config: { type: 'multiple_choice', choiceCount: 3 },
        questions: [{ id: '1', slideNumber: 1, slideHeading: 'H', prompt: 'P', choices: ['x', 'y', 'z'], answer: 0 }],
      }),
    )
    expect(sheet.filter((i) => i.kind === 'choice').map((i) => i.text)).toEqual(['A. x', 'B. y', 'C. z'])
  })

  it('shows the word box only when the quiz has one, sorted, and puts accepted answers in the key', () => {
    const questions = [
      { id: '1', slideNumber: 1, slideHeading: 'H', prompt: 'The ___ is big.', choices: [], answer: { text: 'sun', accepted: ['the sun'] } },
      { id: '2', slideNumber: 1, slideHeading: 'H', prompt: 'A ___ is small.', choices: [], answer: { text: 'ant', accepted: [] } },
    ]
    const withBox = buildQuizItems(quiz({ config: { type: 'fill_blank', wordBox: true }, questions }))
    expect(withBox.sheet.find((i) => i.kind === 'wordBox')?.text).toBe('ant   ·   sun')
    expect(withBox.key.map((i) => i.text)).toContain('1. sun (also accepted: the sun)')
    const without = buildQuizItems(quiz({ config: { type: 'fill_blank', wordBox: false }, questions }))
    expect(without.sheet.some((i) => i.kind === 'wordBox')).toBe(false)
  })

  it('uses the chosen true/false notation on the answer line and in the key', () => {
    const questions = [{ id: '1', slideNumber: 1, slideHeading: 'H', prompt: 'S', choices: [], answer: true }]
    const word = buildQuizItems(quiz({ config: { type: 'true_false', notation: 'word' }, questions }))
    expect(word.sheet.find((i) => i.kind === 'answerLine')?.text).toBe('TRUE / FALSE')
    expect(word.key.map((i) => i.text)).toContain('1. TRUE')
    const letter = buildQuizItems(quiz({ config: { type: 'true_false', notation: 'letter' }, questions }))
    expect(letter.sheet.find((i) => i.kind === 'answerLine')?.text).toBe('T / F')
    expect(letter.key.map((i) => i.text)).toContain('1. T')
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/quiz/pdf/quizPdfLayout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the pure layout**

Create `src/quiz/pdf/quizPdfLayout.ts`:

```ts
import type { OwnerQuiz } from '@/quiz/rows'

/*
  The PDF's content and pagination, with no drawing. Geometry (fonts, margins,
  the jsPDF calls) lives in quizPdf.ts; everything decidable without a canvas
  is decided here so it can be tested.
*/

export type PdfItemKind =
  | 'title'
  | 'subtitle'
  | 'instruction'
  | 'heading'
  | 'question'
  | 'choice'
  | 'answerLine'
  | 'wordBox'
  | 'keyLine'
  | 'blank'

export interface PdfItem {
  kind: PdfItemKind
  text: string
}

const LETTERS = ['A', 'B', 'C', 'D']

function instruction(config: OwnerQuiz['config']): string {
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

/** The quiz sheet and its answer key as flat, geometry-free items. */
export function buildQuizItems(quiz: OwnerQuiz): { sheet: PdfItem[]; key: PdfItem[] } {
  const { config } = quiz
  const sheet: PdfItem[] = [
    { kind: 'title', text: quiz.title },
    { kind: 'subtitle', text: `From: ${quiz.deckTitle}` },
    { kind: 'subtitle', text: 'Name: ____________________________     Date: ______________' },
    { kind: 'instruction', text: instruction(config) },
  ]

  if (config.type === 'fill_blank' && config.wordBox) {
    const words = [
      ...new Set(quiz.questions.map((q) => (typeof q.answer === 'object' ? q.answer.text : '')).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b))
    sheet.push({ kind: 'wordBox', text: words.join('   ·   ') })
  }

  const key: PdfItem[] = [{ kind: 'title', text: 'Answer key' }, { kind: 'subtitle', text: quiz.title }]

  quiz.questions.forEach((q, i) => {
    const n = i + 1
    sheet.push({ kind: 'question', text: `${n}. ${q.prompt}` })

    if (config.type === 'multiple_choice') {
      q.choices.forEach((c, ci) => sheet.push({ kind: 'choice', text: `${LETTERS[ci]}. ${c}` }))
      key.push({ kind: 'keyLine', text: `${n}. ${LETTERS[typeof q.answer === 'number' ? q.answer : 0]}` })
    } else if (config.type === 'fill_blank') {
      const a = typeof q.answer === 'object' ? q.answer : { text: '', accepted: [] as string[] }
      const also = a.accepted.length > 0 ? ` (also accepted: ${a.accepted.join(', ')})` : ''
      key.push({ kind: 'keyLine', text: `${n}. ${a.text}${also}` })
    } else {
      const value = q.answer === true
      sheet.push({ kind: 'answerLine', text: config.notation === 'letter' ? 'T / F' : 'TRUE / FALSE' })
      key.push({
        kind: 'keyLine',
        text: `${n}. ${config.notation === 'letter' ? (value ? 'T' : 'F') : value ? 'TRUE' : 'FALSE'}`,
      })
    }
    sheet.push({ kind: 'blank', text: '' })
  })

  return { sheet, key }
}

/**
 * Greedy word wrap against a measuring function (jsPDF's `getTextWidth` in the
 * app). A word wider than the line is broken by characters so nothing is ever
 * clipped off the page.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  if (text === '') return ['']
  const lines: string[] = []
  let line = ''

  const flushWord = (word: string) => {
    let rest = word
    while (measure(rest) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1
      while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    line = rest
  }

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate) <= maxWidth) {
      line = candidate
    } else {
      if (line) lines.push(line)
      line = ''
      flushWord(word)
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : ['']
}

export interface PaginateLine {
  height: number
  /** Stay on the same page as the line after this one (a question with its choices, a heading with its body). */
  keepWithNext?: boolean
}

/**
 * The page index of every line. A line that would overflow starts a new page;
 * a `keepWithNext` line moves to the next page too if the line it heads would
 * not fit beside it, so a question number is never stranded at a page bottom.
 */
export function paginate(lines: PaginateLine[], pageHeight: number): number[] {
  const pages: number[] = []
  let page = 0
  let used = 0
  lines.forEach((line, i) => {
    const follower = line.keepWithNext ? (lines[i + 1]?.height ?? 0) : 0
    if (used > 0 && used + line.height + follower > pageHeight) {
      page++
      used = 0
    }
    pages.push(page)
    used += line.height
  })
  return pages
}
```

- [ ] **Step 5: Run the layout tests**

Run: `npx vitest run src/quiz/pdf/quizPdfLayout.test.ts`
Expected: PASS. (If the "keeps a header with its follower" or the keep-with-next test disagrees with the implementation's arithmetic, fix the *implementation* so the documented behaviour holds — a `keepWithNext` line moves to the next page whenever `used + line.height + follower.height > pageHeight`; do not weaken the tests.)

- [ ] **Step 6: Implement the drawing**

Create `src/quiz/pdf/quizPdf.ts`:

```ts
import type { OwnerQuiz } from '@/quiz/rows'
import { buildQuizItems, paginate, wrapText, type PdfItem, type PdfItemKind } from './quizPdfLayout'

/*
  The drawing half of the PDF export. jsPDF is `import()`ed here, at export
  time, so it never enters the main bundle. Owner-only by construction: an
  `OwnerQuiz` (with answers) can only be loaded through the owner's own read of
  `quiz_questions`, which RLS refuses to anyone else.
*/

const PAGE_W = 595.28 // A4 in points
const PAGE_H = 841.89
const MARGIN = 54
const CONTENT_W = PAGE_W - MARGIN * 2
const CONTENT_H = PAGE_H - MARGIN * 2

interface Style {
  size: number
  bold: boolean
  indent: number
  gapAfter: number
  keepWithNext?: boolean
}

const STYLES: Record<PdfItemKind, Style> = {
  title: { size: 20, bold: true, indent: 0, gapAfter: 6 },
  subtitle: { size: 11, bold: false, indent: 0, gapAfter: 4 },
  instruction: { size: 11, bold: false, indent: 0, gapAfter: 12 },
  heading: { size: 14, bold: true, indent: 0, gapAfter: 6, keepWithNext: true },
  question: { size: 12, bold: true, indent: 0, gapAfter: 4, keepWithNext: true },
  choice: { size: 12, bold: false, indent: 18, gapAfter: 2 },
  answerLine: { size: 11, bold: false, indent: 18, gapAfter: 2 },
  wordBox: { size: 12, bold: false, indent: 8, gapAfter: 14 },
  keyLine: { size: 12, bold: false, indent: 0, gapAfter: 5 },
  blank: { size: 6, bold: false, indent: 0, gapAfter: 0 },
}

const FONT = 'NotoSans'

async function loadFont(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(binary)
  } catch {
    return null
  }
}

export interface ExportQuizPdfResult {
  /** False when the Unicode font could not be loaded and Helvetica was used instead. */
  unicodeFont: boolean
}

export async function exportQuizPdf(quiz: OwnerQuiz): Promise<ExportQuizPdfResult> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const [regular, bold] = await Promise.all([
    loadFont('/fonts/NotoSans-Regular.ttf'),
    loadFont('/fonts/NotoSans-Bold.ttf'),
  ])
  const unicodeFont = regular !== null && bold !== null
  if (regular && bold) {
    doc.addFileToVFS('NotoSans-Regular.ttf', regular)
    doc.addFont('NotoSans-Regular.ttf', FONT, 'normal')
    doc.addFileToVFS('NotoSans-Bold.ttf', bold)
    doc.addFont('NotoSans-Bold.ttf', FONT, 'bold')
  }
  const family = unicodeFont ? FONT : 'helvetica'

  interface Line {
    text: string
    style: Style
    height: number
    keepWithNext?: boolean
  }

  function toLines(items: PdfItem[]): Line[] {
    const lines: Line[] = []
    for (const item of items) {
      const style = STYLES[item.kind]
      doc.setFont(family, style.bold ? 'bold' : 'normal')
      doc.setFontSize(style.size)
      const wrapped = wrapText(item.text, CONTENT_W - style.indent, (s) => doc.getTextWidth(s))
      wrapped.forEach((text, i) => {
        const last = i === wrapped.length - 1
        lines.push({
          text,
          style,
          height: style.size * 1.35 + (last ? style.gapAfter : 0),
          // Only the last wrapped line of a heading/question binds to what follows.
          keepWithNext: last ? style.keepWithNext : true,
        })
      })
    }
    return lines
  }

  function draw(lines: Line[], firstPage: boolean) {
    const pages = paginate(lines, CONTENT_H)
    let currentPage = 0
    let y = MARGIN
    if (!firstPage) doc.addPage()
    lines.forEach((line, i) => {
      while (currentPage < pages[i]) {
        doc.addPage()
        currentPage++
        y = MARGIN
      }
      doc.setFont(family, line.style.bold ? 'bold' : 'normal')
      doc.setFontSize(line.style.size)
      if (line.style.size > 6 && line.text) {
        doc.text(line.text, MARGIN + line.style.indent, y + line.style.size)
      }
      y += line.height
    })
  }

  const { sheet, key } = buildQuizItems(quiz)
  draw(toLines(sheet), true)
  draw(toLines(key), false)

  const safe = quiz.title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'quiz'
  doc.save(`${safe}.pdf`)
  return { unicodeFont }
}
```

Note: the word box is drawn as ordinary wrapped text with an indent; a bordered rectangle is a nice-to-have and is **not** required by the spec's tests — keep it simple. The blank spacer style uses `size: 6`, which `draw` skips drawing (`size > 6`), leaving vertical space only.

- [ ] **Step 7: Typecheck and smoke-test the export**

Run: `npx tsc -b` — expected: no errors.
Manual (after Task 9 wires the button): generate a quiz, click Download PDF, open the file, and confirm the sheet, the word box (if on) and the answer-key page render, including accented characters.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json public/fonts src/quiz/pdf
git commit -m "feat(quiz): PDF export with answer key (pure layout + lazy jsPDF)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: The Quiz button and modal in the editor

**Files:**
- Create: `src/components/quiz/QuizPreview.tsx`
- Create: `src/components/quiz/QuizModal.tsx`
- Modify: `src/components/editor/TopBar.tsx`
- Modify: `src/pages/EditorPage.tsx`

**Interfaces:**
- Consumes: `QUIZ_CHAIN`, `generateQuizWithFallback` (`@/ai/fallbackProvider`); `hasQuizContent`, `quizSlides` (`@/ai/quizPrompt`); `buildQuestions` (`@/quiz/build`); `createQuiz`, `listQuizzesForDeck`, `loadOwnerQuiz` (`@/quiz/api`); `exportQuizPdf` (`@/quiz/pdf/quizPdf`); `DEFAULT_CONFIGS`, `MAX_QUIZ_ITEMS`, `clampItemCount`, types (`@/quiz/types`); `Modal`, `Button`, `Input`; `useAuthStore`; `describeError`; `AIProviderError`.
- Produces: `<QuizModal presentationId title cards onClose />` and `<QuizPreview quiz canDownload />`; `TopBar` props `onQuiz: () => void`, `quizDisabledReason: string | null`.

- [ ] **Step 1: Write `QuizPreview`**

Create `src/components/quiz/QuizPreview.tsx`:

```tsx
import type { OwnerQuiz } from '@/quiz/rows'

const LETTERS = ['A', 'B', 'C', 'D']

function answerLabel(quiz: OwnerQuiz, index: number): string {
  const q = quiz.questions[index]
  if (quiz.config.type === 'multiple_choice' && typeof q.answer === 'number') return LETTERS[q.answer]
  if (quiz.config.type === 'true_false') {
    const letter = quiz.config.notation === 'letter'
    return q.answer === true ? (letter ? 'T' : 'TRUE') : letter ? 'F' : 'FALSE'
  }
  if (typeof q.answer === 'object') {
    return q.answer.accepted.length > 0 ? `${q.answer.text} (also: ${q.answer.accepted.join(', ')})` : q.answer.text
  }
  return ''
}

/** The generated quiz with its answers marked. Owner-only: it is fed by `loadOwnerQuiz`. */
export function QuizPreview({ quiz }: { quiz: OwnerQuiz }) {
  return (
    <ol className="scrollbar-subtle max-h-72 space-y-3 overflow-y-auto rounded-app border border-app-border p-3 text-sm">
      {quiz.questions.map((q, i) => (
        <li key={q.id}>
          <p className="font-medium text-app-foreground">
            {i + 1}. {q.prompt}
          </p>
          {quiz.config.type === 'multiple_choice' && (
            <ul className="mt-1 space-y-0.5 pl-4 text-app-muted">
              {q.choices.map((c, ci) => (
                <li key={ci} className={q.answer === ci ? 'font-medium text-app-accent-text' : undefined}>
                  {LETTERS[ci]}. {c}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-app-muted">
            Answer: <span className="font-medium text-app-accent-text">{answerLabel(quiz, i)}</span> · slide {q.slideNumber}
          </p>
        </li>
      ))}
    </ol>
  )
}
```

- [ ] **Step 2: Write `QuizModal`**

Create `src/components/quiz/QuizModal.tsx`. Behaviour (implement exactly):

State: `count` (number, default 10, clamped 1–20 via `clampItemCount` on blur/Enter; keep a `countText` string for typing, revert non-numbers), `config: QuizConfig` (default `DEFAULT_CONFIGS.multiple_choice`), `phase: 'form' | 'generating' | 'saving' | 'done'`, `error: string | null`, `pending: { questions: QuizQuestionDraft[]; shortfall: number } | null` (kept after a failed save), `result: { quiz: OwnerQuiz; shortfall: number } | null`, `previous: DeckQuizSummary[] | null`, `pdfNotice: string | null`. An `AbortController` ref: abort on unmount and on the Cancel button while generating (cancel returns to `form` silently — a `signal.aborted` catch is not an error).

Props: `{ presentationId: string; title: string; cards: Card[]; onClose: () => void }` where `cards` is sorted by `orderIndex`.

Render:
1. `<Modal title="Generate a quiz" onClose={onClose}>`.
2. **Items** — a labelled number `Input` (`inputMode="numeric"`, hint "1–20"). Commit on Enter/blur; reject non-numbers by reverting; the value shown is always within 1–20.
3. **Type** — three radio-style buttons (`role="radiogroup"`, each `role="radio"` `aria-checked`): "Multiple choice", "Fill in the blank", "True or False". Selecting one sets `config` to that type's `DEFAULT_CONFIGS` entry *but keeps a previously chosen sub-option for that type in local state* so toggling back does not reset it.
4. **Sub-option** for the chosen type, as a second small radiogroup: MC → "A–C" (`choiceCount: 3`) / "A–D" (`4`); fill → "No word box" / "Word box"; T/F → "TRUE / FALSE" (`notation: 'word'`) / "T / F" (`'letter'`).
5. **Generate** button (`variant="primary"`, `loading` while generating/saving). Disabled when `QUIZ_CHAIN.length === 0` (show the muted line "Quiz generation needs VITE_GROQ_API_KEY.") or `!hasQuizContent(cards)` ("Add some slide content first."). A **Cancel** button while generating aborts.
6. On Generate:
   - `phase = 'generating'`; build `request = { title, slides: quizSlides(cards), count, config }`; `const response = await generateQuizWithFallback(QUIZ_CHAIN, request, signal)`.
   - `const seed = crypto.randomUUID()`; `const built = buildQuestions({ response, config, count, cards: cards.map((c, i) => ({ id: c.id, heading: headingTextOf(c, i) })), seed })`.
   - If `built.questions.length === 0`: show error "The AI couldn't write questions from this deck. Try again or add more content." and return to `form`.
   - `phase = 'saving'`; `const { id } = await createQuiz({ presentationId, title: `${title} — quiz`, deckTitle: title, config, questions: built.questions })`; then `const quiz = await loadOwnerQuiz(id)`; set `result = { quiz, shortfall: built.shortfall }`, `phase = 'done'`; refresh `previous`.
   - On any error: if `signal.aborted` → back to `form` with no message; else `error = describeError(err)` (for an `AIProviderError` of kind `capacity` show "The free AI model is busy. Try again in a minute."; for a save error that mentions `create_quiz` (missing function) append "Run migration 0012 in Supabase."). If the failure happened during the save, set `pending = built` so the UI offers **Save again** without regenerating; otherwise `phase = 'form'`.
7. **Done view**: heading "Quiz ready"; if `shortfall > 0` a muted note "Generated N of M — the deck didn't have enough material for more."; `<QuizPreview quiz={result.quiz} />`; for a Teacher (`useAuthStore(s => s.profile?.role) === 'teacher'`): the code in a monospace chip with a **Copy** button (`navigator.clipboard.writeText`, wrapped in try/catch) and the line "Post it to a class from Quizzes to let students answer." with a `Link` to `/classroom/quizzes`; for any other role: "Sharing needs a Teacher account." and **no code**. A **Download PDF** button (`exportQuizPdf(result.quiz)`, loading state; if it returns `unicodeFont: false`, set `pdfNotice` = "The accent-safe font couldn't be loaded, so accented characters may not appear."). A **Make another** button returns to `form`.
8. **Quizzes from this deck** section under the form: on mount `listQuizzesForDeck(presentationId)` (errors silently show nothing); each row shows title, `itemCount` questions, type label, date, a **PDF** button (loads `loadOwnerQuiz(id)` then `exportQuizPdf`) and, for Teachers, the code with Copy.

Use the same button/typography conventions as `GenerateScriptsModal` (`app-*` tokens, `Button` variants). Every icon-free button has visible text. Radios need visible focus (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent`).

- [ ] **Step 3: Wire the TopBar**

In `src/components/editor/TopBar.tsx` add props `onQuiz: () => void` and `quizDisabledReason: string | null` to the props and type, and render, between the Export button and `<ThemeToggle />`:

```tsx
        <Button
          variant="secondary"
          onClick={onQuiz}
          disabled={quizDisabledReason !== null}
          title={quizDisabledReason ?? 'Generate a quiz from this deck'}
        >
          Quiz
        </Button>
```

- [ ] **Step 4: Wire the EditorPage**

In `src/pages/EditorPage.tsx`:

- Add imports: `import { QuizModal } from '@/components/quiz/QuizModal'`, `import { QUIZ_CHAIN } from '@/ai/fallbackProvider'`, `import { hasQuizContent } from '@/ai/quizPrompt'`.
- Add state beside `addSlideOpen`: `const [quizOpen, setQuizOpen] = useState(false)`.
- Add a memoised sorted list: `const sortedCards = useMemo(() => [...cards].sort((a, b) => a.orderIndex - b.orderIndex), [cards])`.
- Compute `const quizDisabledReason = QUIZ_CHAIN.length === 0 ? 'Quiz generation needs VITE_GROQ_API_KEY' : !hasQuizContent(sortedCards) ? 'Add some slide content first' : null`.
- Pass `onQuiz={() => setQuizOpen(true)}` and `quizDisabledReason={quizDisabledReason}` to `<TopBar>`.
- Guard the editor's global key handlers the same way `addSlideOpen` is guarded (search for `activeTextRef || addSlideOpen` at the two sites near lines 299 and 325 and add `|| quizOpen` to each) so typing in the modal's number field is never treated as an editor shortcut.
- Render after the `addSlideOpen` modal: `{quizOpen && <QuizModal presentationId={id} title={store.title} cards={sortedCards} onClose={() => setQuizOpen(false)} />}`.

- [ ] **Step 5: Verify**

Run: `npx tsc -b && npm run lint && npx vitest run`
Expected: no type errors; no *new* lint warnings; all tests pass.
Manual: `npm run dev`, open a deck, click **Quiz**; check the disabled states (unset the Groq key temporarily / open a blank deck), the count clamp (type 99 → 20, "abc" → reverts), each type and sub-option, Generate → preview → Download PDF, Cancel mid-generation, and (as a General account) that no code is shown. Report honestly if any of this could not be exercised (for example no live Groq key or no migration applied).

- [ ] **Step 6: Commit**

```bash
git add src/components/quiz src/components/editor/TopBar.tsx src/pages/EditorPage.tsx
git commit -m "feat(quiz): Quiz button and generation modal in the editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Post to class from the Quizzes page

**Files:**
- Modify: `src/components/classroom/QuizRow.tsx`
- Modify: `src/pages/classroom/QuizzesPage.tsx`

**Interfaces:**
- Consumes: `postQuiz`, `unpostQuiz` (`@/quiz/api`); `QuizSummary.code` (Task 7); `ClassRoom`, `ClassChip`; `describeError`.
- Produces: `QuizRow` props `{ quiz: QuizSummary; postedIn: ClassRoom[]; allClasses: ClassRoom[]; onChanged: () => void }`.

- [ ] **Step 1: Implement `QuizRow`**

Rewrite `src/components/classroom/QuizRow.tsx` so it keeps its current layout and adds:

- The **code** in a monospace chip (`font-mono tracking-[0.2em]`) with **Copy code** and **Copy link** buttons (link = `${window.location.origin}/quiz/${quiz.code}`; clipboard writes in try/catch; a brief "Copied" label).
- A **Post to class** control: a `<select>` listing `allClasses` not already in `postedIn` (first option "Post to class…", disabled/hidden when every class is posted or the teacher has no classes — in that case show the muted text "Create a class to post this quiz."). Choosing a class calls `postQuiz(quiz.id, classId)`, then `onChanged()`; on failure show the message in a small `role="alert"` line via `describeError`.
- Each posted-class chip gets a small "×" button (aria-label `Unpost from <class name>`) calling `unpostQuiz(quiz.id, classId)` then `onChanged()`. Because unposting a quiz students already answered leaves their attempts in place, do not add a confirm; the label says exactly what it does.
- Keep local `busy` state so a double click does not double-post.

- [ ] **Step 2: Pass the new props from `QuizzesPage`**

In `QuizzesPage`, pass `allClasses={state.data.classes}` and `onChanged={reload}` to each `QuizRow`.

- [ ] **Step 3: Verify**

Run: `npx tsc -b && npx vitest run src/classroom`
Expected: PASS. Manual (teacher account with a class and a generated quiz): post to the class, see the chip appear after reload, unpost, copy the code and link.

- [ ] **Step 4: Commit**

```bash
git add src/components/classroom/QuizRow.tsx src/pages/classroom/QuizzesPage.tsx
git commit -m "feat(quiz): post and unpost quizzes to classes from the Quizzes page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Taking a quiz — `/quiz/:code`

**Files:**
- Create: `src/pages/QuizPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/classroom/MyClassesPage.tsx`

**Interfaces:**
- Consumes: `getQuizForTaking`, `submitQuizAttempt`, `SubmittedAnswers`, `AttemptResult` (`@/quiz/api`); `TakeQuiz` (`@/quiz/rows`); `quizCodeProblem`, `normalizeQuizCode`, `QUIZ_CODE_LENGTH` (`@/quiz/quizCode`); `describeError`; `DashboardShell`; `Button`, `Field`, `Input`.
- Produces: route `/quiz/:code` (under `RequireAuth` only); `QuizPage`.

- [ ] **Step 1: Implement `QuizPage`**

Create `src/pages/QuizPage.tsx` (wrap in `DashboardShell` like the other student pages, `title` = the quiz title once loaded, "Quiz" before). Behaviour:

- Read `code` from `useParams`. `useAsync(() => getQuizForTaking(code), code)` for the load. On `error` state show the message (the RPC's sentence) in a `PanelMessage`-style block with a **Go to my classes** button navigating to `/classes` (this is where a non-member enters the class code) and a Retry.
- **Class choice:** if `quiz.classes` has more than one entry, a `<select>` of classes (default: the first with `attempted === false`, else the first). Entries with `attempted` show "(already submitted)". If the chosen class is already attempted, show "You've already submitted this quiz for <class>." and no form.
- **Form by type** (state `answers: SubmittedAnswers` keyed by question id):
  - `multiple_choice`: radio group per question, choices labelled `A.`–`D.`; value is the choice **index** (number).
  - `fill_blank`: a text input per question; if `quiz.wordBox` is non-null render the words in a bordered box above the questions (as inert chips — not buttons). The prompt's `_____` stays visible as text; the input sits below it. Value is the typed string.
  - `true_false`: two buttons per question (`role="radio"`), labelled `TRUE`/`FALSE` or `T`/`F` by `config.notation`; value is a boolean.
- **Submit** disabled until every question has an answer (a blank input counts as unanswered). A line above the form: "You get one attempt." On submit: `submitQuizAttempt(code, classId, answers)`; on success replace the form with the result: `Math.round(score * 100)%`, `correct / total`, and a list of the questions with a ✓/✗ per `results[i]` (question text only — **never show correct answers**). On failure show the message and keep the form.
- Guard against leaving with unsaved answers? Not required; do not add it.

- [ ] **Step 2: Add the route**

In `src/App.tsx` import `QuizPage` and add, before the classroom routes:

```tsx
        <Route
          path="/quiz/:code"
          element={
            <RequireAuth>
              <QuizPage />
            </RequireAuth>
          }
        />
```

- [ ] **Step 3: Add the code field to `MyClassesPage`**

Under the "Join a class" card in `src/pages/classroom/MyClassesPage.tsx`, add a second card with the same styling: heading "Have a quiz code?", a `Field`/`Input` (state `quizCode`, `quizCodeError`; `normalizeQuizCode(...).slice(0, QUIZ_CODE_LENGTH)`; `font-mono tracking-[0.2em]`; placeholder `e.g. K7M2QX9P`) and an **Open quiz** button. On submit run `quizCodeProblem`; if it returns a message, show it; otherwise `navigate(`/quiz/${normalizeQuizCode(quizCode)}`)`.

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npm run lint && npx vitest run`
Expected: pass, no new lint warnings.
Manual, end to end (needs migration 0012 and two accounts): teacher generates a quiz → posts it to a class → student in that class opens `/quiz/<code>` → answers → sees the score → the teacher's dashboard (`/classroom/students`, class page) shows the attempt. Also: a student *outside* the class is refused with the "join the class first" sentence and the button to `/classes`; a second attempt is refused; the network response of `get_quiz_for_taking` contains no `answer`. Report honestly what could not be exercised.

- [ ] **Step 5: Commit**

```bash
git add src/pages/QuizPage.tsx src/App.tsx src/pages/classroom/MyClassesPage.tsx
git commit -m "feat(quiz): student quiz-taking page and quiz-code entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Documentation and final verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-14-teacher-classroom-design.md` (the last "Implementation invariants" bullet)
- Modify: `.env.example` (comment only, if it does not already say Groq is used for quizzes)

- [ ] **Step 1: Update CLAUDE.md**

Add a `## Quizzes (\`src/quiz/\`, \`components/quiz/\`, \`pages/QuizPage.tsx\`)` section (before "PPTX export") stating, in the file's terse style:

- A quiz is a **separate artifact generated from a deck on demand**; it never touches `cards`, and is **not precedent for a "regenerate this slide" button** (alongside the existing narration carve-out in "Core rule: generate once").
- Groq-only free chain (`QUIZ_CHAIN`), sharing `runWithFailover` with `FallbackProvider` (capacity-only failover, cancel never hands off); the model is not trusted — `buildQuestions` drops invalid questions, shuffles MC client-side, reports a shortfall; budgets (`quizMaxTokens`, 600/6,000 character input cap) and why.
- Storage/RLS invariants: migration **0012 required**; `quiz_questions` stays owner-only; students only use `get_quiz_for_taking` (no answers) and `submit_quiz_attempt` (server-side scoring, one attempt per class); `create_quiz` is `security invoker` and atomic; code alphabet/length must match `generate_quiz_code()`.
- Rules: any deck owner can generate, only Teachers see a code and can post; a non-member with a code is refused (no auto-join); PDF is owner-only by data (jsPDF lazy-imported, Noto Sans fetched from `/fonts`); posting is from the Quizzes page.
- Testing: what is pure-tested and that `supabase/tests/0012_quiz_rls.sql` is hand-run.

Also add `0012` to the Persistence section's migration list (`0012` quiz codes/types/RPCs; gates quiz generation only, not card writes).

In the classroom spec's last bullet ("Nothing writes quizzes, questions, postings or attempts yet"), replace it with a pointer: quizzes, questions, postings and attempts are now written by the quiz feature (`docs/superpowers/specs/2026-09-24-quiz-generator-design.md`).

- [ ] **Step 2: Full verification**

Run each and read the output:

```bash
npx tsc -b
npm run lint
npm run test
npm run build
```

Expected: typecheck clean; lint shows only the 10 pre-existing warnings (CreatePage ×8, SelectionLayer ×1, joinCode ×1) and no new ones; every test passes; the build succeeds and `jspdf` appears as its own lazy chunk (not in the main entry chunk). If anything fails, fix the cause; do not skip.

- [ ] **Step 3: Run the app**

Start `npm run dev`, load `http://localhost:5173/`, and confirm the deck editor loads with the Quiz button. Exercise the flows listed in Tasks 9–11 as far as the environment allows, and state plainly which parts (live Groq generation, the two-account student flow, the SQL checks) were or were not run.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs .env.example
git commit -m "docs(quiz): document the quiz feature's invariants

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (spec coverage)

| Spec section | Task |
|---|---|
| §1 Button and modal (items 1–20, three types + sub-options, preview, code, previous quizzes, disabled states) | 9 |
| §2 Provider (`QuizProvider`, `runWithFailover`, `QUIZ_CHAIN`), prompt, budget, validation/retry | 3, 4, 5 |
| §2 After the model (drop, trim, shortfall, shuffle, card mapping) | 2 |
| §3 Storage (columns, encoding, three RPCs, grants, owner-only answers) | 6 |
| §4 Client I/O, Quizzes page post/unpost/copy, stats unchanged | 7, 10 |
| §5 Taking a quiz (`/quiz/:code`, entry field, class pick, per-type UI, result without answers) | 11 |
| §6 PDF (lazy jsPDF, Unicode font, pure layout, answer key, owner-only by data) | 8 |
| §7 Errors (no key, capacity, unparseable, missing migration, save failure keeps preview) | 9 (states), 4/5 (kinds) |
| §8 Testing (prompt, schema/build, fallback mutation check, quiz code, PDF layout, SQL by hand) | 1–8 |
| §9 Files / CLAUDE.md | 12 |

Type names are consistent across tasks: `QuizConfig`, `QuizQuestionDraft`, `QuizRequest`, `QuizResponse`, `OwnerQuiz`, `TakeQuiz`, `DeckQuizSummary`, `SubmittedAnswers`, `AttemptResult`, `Named<P>`/`NamedQuizProvider`, `runWithFailover`, `generateQuizWithFallback`, `quizMaxTokens`, `buildQuestions`, `exportQuizPdf`.
