# Quiz Test Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a quiz be built from up to 3 "tests", each with its own type, sub-option, 1–20 items, title and instructions, in a wider quiz modal with "Create new quiz" / "Quizzes from this deck" tabs.

**Architecture:** Tests are stored inside the existing quiz: `quizzes.settings.sections` holds the test list, and each `quiz_questions` row gains `section_index` and `question_type` (migration 0016). Generation is one AI call per test, run in order through the existing free Groq chain, with a pure orchestrator that supports resume-from-failed-test. All readers (owner preview, PDF, student taking page, lists) group questions by test and restart numbering in each test. Quizzes saved before 0016 read as a one-test quiz.

**Tech Stack:** React 19 + TypeScript (Vite), zustand, zod, Vitest (pure tests + SSR render smoke tests via `react-dom/server`, no jsdom), Supabase Postgres (plpgsql RPCs, RLS).

**Spec:** `docs/superpowers/specs/2026-10-01-quiz-test-sections-design.md` — read it before starting any task.

## Global Constraints

- At most **3** tests per quiz (`MAX_QUIZ_SECTIONS = 3`); each test **1–20** items (`MIN_QUIZ_ITEMS = 1`, `MAX_QUIZ_ITEMS = 20`, now meaning *per test*).
- Test title: trimmed, non-empty, ≤ **80** chars (`MAX_SECTION_TITLE`); default `"Test N"` (1-based). Instructions: trimmed, may be empty, ≤ **300** chars (`MAX_SECTION_INSTRUCTIONS`).
- Two tests may share a type.
- Numbering **restarts at 1 in each test** on every surface (owner preview, PDF sheet and key, student page, result review).
- Quizzes stay on the free `QUIZ_CHAIN` (Groq only). Never Anthropic or Gemini.
- Migration **0016** is new; **never edit 0012** (it is applied).
- `create_quiz` must keep: `security invoker`, id and code generated up front, **no `INSERT … RETURNING`**.
- JSON comparisons on client-supplied `settings` use `= 'true'::jsonb`, never casts.
- Imports: `@/` alias; `import type` for type-only imports (`verbatimModuleSyntax`); no constructor parameter properties (`erasableSyntaxOnly`).
- App chrome uses `app-*` tokens only.
- Commands: `npm run test`, `npm run lint`, `npm run build` (runs `tsc -b`). Every task ends green on all three.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Deviation from spec, deliberate:** `QuizQuestionDraft` does **not** gain `sectionIndex`. The section a draft belongs to is carried by nesting (`BuiltSection.questions`, `SectionToSave.questions`), so the field would be unused.

## Review Focus

1. **A legacy quiz (saved before 0016) opened anywhere** — preview, PDF, deck list, taking page — must render as one test titled "Test 1" with that type's default instructions, and its word box (fill-blank, `wordBox: true`) must still appear. Pinned in Task 1 (`fromDbSections` legacy) and Task 6 (`takeQuizFromJson` legacy `word_box`).
2. **Partial failure then an edit**: Test 1 written, Test 2 fails, the user changes a field, then clicks Generate. Expected: generation restarts at Test 1 (kept tests dropped) — but merely tabbing out of an Items box must *not* drop them. Pinned in Task 3 (`changesForm`) and Task 2 (`generateSections` starts at `written.length`); the modal's `edit` wrapper (Task 7) applies it.
3. **Cancel during Test 2**: nothing is saved, no error is shown, written tests are dropped. Pinned in Task 2 (abort between tests throws `AbortError`, not `SectionFailure`).
4. **A test whose model reply yields zero valid questions** must fail *that test* (resume-able), never save an empty test (the SQL would refuse it). Pinned in Task 2 (`EmptySectionError`).
5. **A blank or whitespace title** typed by the user must save as the default `"Test N"`, never be refused by the server. Pinned in Task 3 (`toSectionRequests`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/quiz/types.ts` (modify) | Section vocabulary: `QuizSection`, limits, default title/instructions, DB section mapping, type summary/label |
| `src/quiz/types.test.ts` (create) | Tests for the above |
| `src/ai/quizPrompt.ts` (modify) | `avoid` list in the user prompt (`avoidList`) |
| `src/quiz/sections.ts` (create) | Pure orchestration: run tests in order, resume, errors |
| `src/quiz/sectionForm.ts` (create) | Pure reducer for the modal's test cards; `parseCount`; `toSectionRequests` |
| `supabase/migrations/0016_quiz_sections.sql` (create) | Columns, constraint, trigger, new `create_quiz`, updated taking/scoring RPCs |
| `supabase/tests/0016_quiz_sections.sql` (create) | Hand-run checks (not executed by this work) |
| `src/quiz/rows.ts` (modify) | Row mapping with sections; `groupBySection` |
| `src/quiz/api.ts` (modify) | `createQuiz` with sections; `sectionJson` |
| `src/classroom/types.ts`, `src/classroom/rows.ts`, `src/components/classroom/StudentQuizRow.tsx` (modify) | `'mixed'` type summary |
| `src/components/quiz/QuizPreview.tsx` (modify) | Grouped owner preview |
| `src/quiz/pdf/quizPdfLayout.ts` (modify) | Grouped PDF items |
| `src/pages/QuizPage.tsx` (modify) | Grouped student page, per-test word box |
| `src/components/quiz/Radios.tsx` (create) | Chip radio group moved out of the modal |
| `src/components/quiz/SectionCard.tsx` (create) | One test card + `SectionList` |
| `src/components/quiz/DeckQuizList.tsx` (create) | "Quizzes from this deck" panel + `CodeChip` |
| `src/components/quiz/QuizModal.tsx` (rewrite) | Tabs, wider, sequential generation, resume, save |
| `src/components/quiz/QuizModal.test.tsx` (create) | Render smoke test |
| `CLAUDE.md` (modify) | Quizzes section + migrations list |

---

### Task 1: Section vocabulary in `quiz/types.ts`

**Files:**
- Modify: `src/quiz/types.ts`
- Test: `src/quiz/types.test.ts` (create)

**Interfaces:**
- Consumes: existing `QuizConfig`, `QuizType`, `fromDbConfig`, `toDbConfig`, `QUIZ_TYPE_LABELS`.
- Produces:
  - `MAX_QUIZ_SECTIONS = 3`, `MAX_SECTION_TITLE = 80`, `MAX_SECTION_INSTRUCTIONS = 300`
  - `interface QuizSection { config: QuizConfig; title: string; instructions: string }`
  - `defaultSectionTitle(index: number): string`
  - `defaultInstructions(config: QuizConfig): string`
  - `type QuizTypeSummary = QuizType | 'mixed'`
  - `summaryType(sections: readonly { config: QuizConfig }[]): QuizTypeSummary`
  - `parseTypeSummary(value: string): QuizTypeSummary`
  - `quizTypeLabel(type: QuizTypeSummary): string`
  - `fromDbSections(quizType: string, settings: unknown): QuizSection[]`
  - `QuizRequest` gains `avoid?: string[]`

- [ ] **Step 1: Write the failing test** — create `src/quiz/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  defaultInstructions,
  defaultSectionTitle,
  fromDbSections,
  parseTypeSummary,
  quizTypeLabel,
  summaryType,
  type QuizConfig,
} from './types'

const MC4: QuizConfig = { type: 'multiple_choice', choiceCount: 4 }
const FILL_BOX: QuizConfig = { type: 'fill_blank', wordBox: true }
const TF_LETTER: QuizConfig = { type: 'true_false', notation: 'letter' }

describe('defaultSectionTitle', () => {
  it('numbers tests from 1', () => {
    expect(defaultSectionTitle(0)).toBe('Test 1')
    expect(defaultSectionTitle(2)).toBe('Test 3')
  })
})

describe('defaultInstructions', () => {
  it('has one sentence per type and sub-option', () => {
    expect(defaultInstructions(MC4)).toBe('Choose the best answer for each question.')
    expect(defaultInstructions(FILL_BOX)).toBe('Fill in each blank using a word from the word box.')
    expect(defaultInstructions({ type: 'fill_blank', wordBox: false })).toBe(
      'Fill in each blank with the missing word or words.',
    )
    expect(defaultInstructions(TF_LETTER)).toBe('Write T if the statement is true or F if it is false.')
    expect(defaultInstructions({ type: 'true_false', notation: 'word' })).toBe(
      'Write TRUE if the statement is true or FALSE if it is false.',
    )
  })
})

describe('summaryType / quizTypeLabel / parseTypeSummary', () => {
  it('is the shared type, or mixed', () => {
    expect(summaryType([{ config: MC4 }, { config: { type: 'multiple_choice', choiceCount: 3 } }])).toBe(
      'multiple_choice',
    )
    expect(summaryType([{ config: MC4 }, { config: TF_LETTER }])).toBe('mixed')
  })

  it('labels mixed quizzes', () => {
    expect(quizTypeLabel('mixed')).toBe('Mixed')
    expect(quizTypeLabel('fill_blank')).toBe('Fill in the blank')
  })

  it('parses the stored quiz_type, defaulting unknown values to multiple choice', () => {
    expect(parseTypeSummary('mixed')).toBe('mixed')
    expect(parseTypeSummary('true_false')).toBe('true_false')
    expect(parseTypeSummary('essay')).toBe('multiple_choice')
  })
})

describe('fromDbSections', () => {
  it('reads stored sections in order', () => {
    const sections = fromDbSections('mixed', {
      sections: [
        { title: 'Part A', instructions: 'Pick one.', type: 'multiple_choice', choiceCount: 3 },
        { title: 'Part B', instructions: '', type: 'true_false', notation: 'letter' },
      ],
    })
    expect(sections).toEqual([
      { title: 'Part A', instructions: 'Pick one.', config: { type: 'multiple_choice', choiceCount: 3 } },
      { title: 'Part B', instructions: '', config: TF_LETTER },
    ])
  })

  it('reads a legacy quiz (no sections) as one default test', () => {
    expect(fromDbSections('fill_blank', { wordBox: true })).toEqual([
      { title: 'Test 1', instructions: defaultInstructions(FILL_BOX), config: FILL_BOX },
    ])
  })

  it('falls back per field on malformed entries and never throws', () => {
    const sections = fromDbSections('mixed', { sections: [42, { title: '   ', type: 'essay' }] })
    expect(sections).toEqual([
      { title: 'Test 1', instructions: defaultInstructions(MC4), config: MC4 },
      { title: 'Test 2', instructions: defaultInstructions(MC4), config: MC4 },
    ])
  })

  it('treats an empty or non-array sections value as legacy', () => {
    expect(fromDbSections('true_false', { sections: [] })[0].config).toEqual({ type: 'true_false', notation: 'word' })
    expect(fromDbSections('true_false', null)).toHaveLength(1)
  })

  it('keeps at most three sections', () => {
    const many = Array.from({ length: 5 }, () => ({ title: 'T', type: 'true_false' }))
    expect(fromDbSections('true_false', { sections: many })).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/quiz/types.test.ts`
Expected: FAIL — `defaultInstructions` (and the others) are not exported.

- [ ] **Step 3: Implement** — in `src/quiz/types.ts`:

Change the `MAX_QUIZ_ITEMS` comment line above it (add one):

```ts
/** Items per test (a quiz has up to MAX_QUIZ_SECTIONS tests). */
export const MAX_QUIZ_ITEMS = 20
```

Add `avoid` to `QuizRequest`:

```ts
export interface QuizRequest {
  title: string
  slides: QuizSlide[]
  count: number
  config: QuizConfig
  /** Prompts earlier tests of this quiz already asked; the model is told not to repeat them. */
  avoid?: string[]
}
```

Append at the end of the file:

```ts
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
```

Note: `fromDbConfig`'s switch does not reference `MAX_QUIZ_SECTIONS`, so declaring the new constants after it is fine. `QUIZ_TYPE_LABELS` is declared earlier in the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/quiz/types.test.ts` → PASS. Then `npm run build` → no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/quiz/types.ts src/quiz/types.test.ts
git commit -m "feat(quiz): section vocabulary for multi-test quizzes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Avoid list in the prompt + the test-running orchestrator

**Files:**
- Modify: `src/ai/quizPrompt.ts`, `src/ai/quizPrompt.test.ts`
- Create: `src/quiz/sections.ts`, `src/quiz/sections.test.ts`

**Interfaces:**
- Consumes: `QuizRequest.avoid` (Task 1), `QuizSection` (Task 1), `QuizQuestionDraft`.
- Produces:
  - `MAX_AVOID_PROMPTS = 40`, `MAX_AVOID_CHARS = 2000`, `avoidList(prompts: readonly string[]): string[]` in `ai/quizPrompt.ts`
  - In `quiz/sections.ts`:
    ```ts
    interface SectionRequest { section: QuizSection; count: number }
    interface BuiltSection { section: QuizSection; questions: QuizQuestionDraft[]; shortfall: number; requested: number }
    class EmptySectionError extends Error {}
    class SectionFailure extends Error { index: number; section: QuizSection; written: BuiltSection[]; cause: unknown }
    function generateSections(opts: {
      requests: SectionRequest[]
      written: BuiltSection[]
      write: (request: SectionRequest, index: number, avoid: string[]) => Promise<{ questions: QuizQuestionDraft[]; shortfall: number }>
      onProgress?: (index: number) => void
      signal?: AbortSignal
    }): Promise<BuiltSection[]>
    ```

- [ ] **Step 1: Write failing prompt tests** — append to `src/ai/quizPrompt.test.ts` (add `avoidList`, `MAX_AVOID_CHARS`, `MAX_AVOID_PROMPTS` to its import from `./quizPrompt`):

```ts
describe('avoidList / ALREADY ASKED', () => {
  const base = {
    title: 'Cells',
    slides: [{ slide: 1, heading: 'Intro', lines: ['a'] }],
    count: 5,
    config: { type: 'true_false' as const, notation: 'word' as const },
  }

  it('adds no ALREADY ASKED block when nothing was asked', () => {
    expect(buildQuizUserPrompt(base)).not.toContain('ALREADY ASKED')
    expect(buildQuizUserPrompt({ ...base, avoid: [] })).not.toContain('ALREADY ASKED')
  })

  it('lists earlier prompts when given', () => {
    const prompt = buildQuizUserPrompt({ ...base, avoid: ['What makes ATP?', 'Cells have nuclei.'] })
    expect(prompt).toContain('ALREADY ASKED')
    expect(prompt).toContain('- What makes ATP?')
    expect(prompt).toContain('- Cells have nuclei.')
  })

  it('keeps the most recent prompts within both caps', () => {
    const many = Array.from({ length: 60 }, (_, i) => `Question number ${i}`)
    const kept = avoidList(many)
    expect(kept.length).toBeLessThanOrEqual(MAX_AVOID_PROMPTS)
    expect(kept[kept.length - 1]).toBe('Question number 59')
    const long = Array.from({ length: 10 }, (_, i) => `${i}${'x'.repeat(400)}`)
    expect(avoidList(long).join('').length).toBeLessThanOrEqual(MAX_AVOID_CHARS)
  })

  it('drops blank prompts', () => {
    expect(avoidList(['  ', 'Real'])).toEqual(['Real'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ai/quizPrompt.test.ts` → FAIL (`avoidList` not exported).

- [ ] **Step 3: Implement in `src/ai/quizPrompt.ts`** — add after `quizSlides`/`hasQuizContent`:

```ts
/*
  Prompts earlier tests already asked, so a later test doesn't repeat them.
  Capped because Groq's window counts input too: the most recent prompts are
  kept, up to MAX_AVOID_PROMPTS and MAX_AVOID_CHARS in total.
*/
export const MAX_AVOID_PROMPTS = 40
export const MAX_AVOID_CHARS = 2000

export function avoidList(prompts: readonly string[]): string[] {
  const out: string[] = []
  let used = 0
  for (let i = prompts.length - 1; i >= 0 && out.length < MAX_AVOID_PROMPTS; i--) {
    const p = prompts[i].trim()
    if (!p) continue
    if (used + p.length > MAX_AVOID_CHARS) break
    out.unshift(p)
    used += p.length
  }
  return out
}
```

Replace `buildQuizUserPrompt` with:

```ts
export function buildQuizUserPrompt(request: QuizRequest): string {
  const body = request.slides
    .map((s) => {
      const lines = s.lines.length > 0 ? `\n${s.lines.map((l) => `- ${l}`).join('\n')}` : ''
      return `Slide ${s.slide}: ${s.heading}${lines}`
    })
    .join('\n\n')

  const avoid = avoidList(request.avoid ?? [])
  const asked =
    avoid.length > 0
      ? `\n\nALREADY ASKED (earlier tests of this quiz). Do not ask these again or reword them:\n${avoid.map((p) => `- ${p}`).join('\n')}`
      : ''

  return `Presentation title: ${request.title}

${body}

Write exactly ${request.count} questions.${asked}

${typeRules(request.config)}`
}
```

Run `npx vitest run src/ai/quizPrompt.test.ts src/ai/groqQuiz.test.ts` → PASS (existing prompt tests must still pass; the text with no avoid list is unchanged).

- [ ] **Step 4: Write failing orchestrator tests** — create `src/quiz/sections.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EmptySectionError, SectionFailure, generateSections, type BuiltSection, type SectionRequest } from './sections'
import type { QuizQuestionDraft, QuizSection } from './types'

function section(title: string): QuizSection {
  return { title, instructions: '', config: { type: 'true_false', notation: 'word' } }
}

function draft(prompt: string): QuizQuestionDraft {
  return { slideNumber: 1, slideHeading: 'H', cardId: 'c1', prompt, choices: [], answer: true }
}

const REQUESTS: SectionRequest[] = [
  { section: section('Test 1'), count: 2 },
  { section: section('Test 2'), count: 1 },
  { section: section('Test 3'), count: 1 },
]

describe('generateSections', () => {
  it('writes every test in order, passing earlier prompts to avoid', async () => {
    const calls: { index: number; avoid: string[] }[] = []
    const progress: number[] = []
    const built = await generateSections({
      requests: REQUESTS,
      written: [],
      onProgress: (i) => progress.push(i),
      write: async (req, index, avoid) => {
        calls.push({ index, avoid })
        return { questions: [draft(`${req.section.title} q`)], shortfall: req.count - 1 }
      },
    })
    expect(built.map((b) => b.section.title)).toEqual(['Test 1', 'Test 2', 'Test 3'])
    expect(built.map((b) => [b.requested, b.shortfall])).toEqual([[2, 1], [1, 0], [1, 0]])
    expect(calls.map((c) => c.avoid)).toEqual([[], ['Test 1 q'], ['Test 1 q', 'Test 2 q']])
    expect(progress).toEqual([0, 1, 2])
  })

  it('resumes after the tests already written', async () => {
    const done: BuiltSection[] = [{ section: section('Test 1'), questions: [draft('kept')], shortfall: 0, requested: 2 }]
    const indices: number[] = []
    const built = await generateSections({
      requests: REQUESTS,
      written: done,
      write: async (_req, index, avoid) => {
        indices.push(index)
        expect(avoid[0]).toBe('kept')
        return { questions: [draft(`q${index}`)], shortfall: 0 }
      },
    })
    expect(indices).toEqual([1, 2])
    expect(built[0]).toBe(done[0])
    expect(built).toHaveLength(3)
  })

  it('reports a failing test with the tests written before it', async () => {
    const boom = new Error('busy')
    const err = await generateSections({
      requests: REQUESTS,
      written: [],
      write: async (_req, index) => {
        if (index === 1) throw boom
        return { questions: [draft(`q${index}`)], shortfall: 0 }
      },
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SectionFailure)
    const failure = err as SectionFailure
    expect(failure.index).toBe(1)
    expect(failure.section.title).toBe('Test 2')
    expect(failure.cause).toBe(boom)
    expect(failure.written.map((b) => b.section.title)).toEqual(['Test 1'])
  })

  it('treats a test with no valid questions as a failure of that test', async () => {
    const err = await generateSections({
      requests: REQUESTS,
      written: [],
      write: async () => ({ questions: [], shortfall: 2 }),
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SectionFailure)
    expect((err as SectionFailure).index).toBe(0)
    expect((err as SectionFailure).cause).toBeInstanceOf(EmptySectionError)
  })

  it('stops with an AbortError, not a SectionFailure, once the signal is aborted', async () => {
    const controller = new AbortController()
    const err = await generateSections({
      requests: REQUESTS,
      written: [],
      signal: controller.signal,
      write: async (_req, index) => {
        if (index === 0) controller.abort()
        return { questions: [draft('q')], shortfall: 0 }
      },
    }).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(SectionFailure)
    expect((err as Error).name).toBe('AbortError')
  })

  it('passes a cancel from inside write through as-is', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('Aborted', 'AbortError')
    const err = await generateSections({
      requests: REQUESTS,
      written: [],
      signal: controller.signal,
      write: async () => {
        controller.abort()
        throw abortError
      },
    }).catch((e: unknown) => e)
    expect(err).toBe(abortError)
  })
})
```

- [ ] **Step 5: Run to verify failure**

Run: `npx vitest run src/quiz/sections.test.ts` → FAIL (module not found).

- [ ] **Step 6: Implement** — create `src/quiz/sections.ts`:

```ts
import type { QuizQuestionDraft, QuizSection } from './types'

/*
  Runs a quiz's tests one model call at a time, in order. Pure apart from the
  injected `write`, so the rules — order, what earlier tests pass on to avoid,
  resuming after a failure, cancel — are testable without React or a model.
*/

export interface SectionRequest {
  section: QuizSection
  count: number
}

export interface BuiltSection {
  section: QuizSection
  questions: QuizQuestionDraft[]
  /** How many fewer than `requested` survived validation. */
  shortfall: number
  requested: number
}

/** The model's reply for a test held no usable question. */
export class EmptySectionError extends Error {
  constructor() {
    super('No usable questions were written for this test.')
    this.name = 'EmptySectionError'
  }
}

/** Test `index` failed; `written` holds the tests finished before it, kept for a resume. */
export class SectionFailure extends Error {
  index: number
  section: QuizSection
  written: BuiltSection[]
  override cause: unknown

  constructor(index: number, section: QuizSection, written: BuiltSection[], cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'SectionFailure'
    this.index = index
    this.section = section
    this.written = written
    this.cause = cause
  }
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

/**
 * Writes `requests[written.length …]` in order and returns every test,
 * including the ones passed in `written` (kept by identity). A failure throws
 * `SectionFailure` carrying what was finished; a cancel throws an AbortError
 * (or whatever `write` threw once the signal is aborted), never a
 * `SectionFailure`, so the caller can tell the two apart.
 */
export async function generateSections(opts: {
  requests: SectionRequest[]
  written: BuiltSection[]
  write: (
    request: SectionRequest,
    index: number,
    avoid: string[],
  ) => Promise<{ questions: QuizQuestionDraft[]; shortfall: number }>
  onProgress?: (index: number) => void
  signal?: AbortSignal
}): Promise<BuiltSection[]> {
  const { requests, write, onProgress, signal } = opts
  const built = [...opts.written]

  for (let index = built.length; index < requests.length; index++) {
    if (signal?.aborted) throw abortError()
    const request = requests[index]
    onProgress?.(index)
    const avoid = built.flatMap((b) => b.questions.map((q) => q.prompt))
    let result: { questions: QuizQuestionDraft[]; shortfall: number }
    try {
      result = await write(request, index, avoid)
    } catch (err) {
      if (signal?.aborted) throw err
      throw new SectionFailure(index, request.section, built, err)
    }
    if (signal?.aborted) throw abortError()
    if (result.questions.length === 0) {
      throw new SectionFailure(index, request.section, built, new EmptySectionError())
    }
    built.push({ section: request.section, questions: result.questions, shortfall: result.shortfall, requested: request.count })
  }
  return built
}
```

If `override cause` is rejected by the TS target (`Error.cause` requires `lib: es2022`), check `tsconfig.app.json` `lib`; if `cause` is not on `Error`, drop the `override` keyword. Do not rename the field — tests read `.cause`.

- [ ] **Step 7: Run tests and build**

Run: `npx vitest run src/quiz/sections.test.ts src/ai/quizPrompt.test.ts` → PASS. `npm run build` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ai/quizPrompt.ts src/ai/quizPrompt.test.ts src/quiz/sections.ts src/quiz/sections.test.ts
git commit -m "feat(quiz): run tests in order with resume and an avoid list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Test-card form reducer (`quiz/sectionForm.ts`)

**Files:**
- Create: `src/quiz/sectionForm.ts`, `src/quiz/sectionForm.test.ts`

**Interfaces:**
- Consumes: `QuizConfig`, `QuizType`, `DEFAULT_CONFIGS`, `clampItemCount`, `MAX_QUIZ_SECTIONS`, `MAX_SECTION_TITLE`, `MAX_SECTION_INSTRUCTIONS`, `defaultSectionTitle`, `defaultInstructions` (Task 1); `SectionRequest` (Task 2).
- Produces:
  ```ts
  const DEFAULT_SECTION_COUNT = 10
  interface SectionDraft {
    key: string
    configs: Record<QuizType, QuizConfig>
    type: QuizType
    count: number
    countText: string
    title: string
    titleEdited: boolean
    instructions: string
    instructionsEdited: boolean
  }
  type SectionAction =
    | { kind: 'add'; key: string }
    | { kind: 'remove'; index: number }
    | { kind: 'setType'; index: number; type: QuizType }
    | { kind: 'setConfig'; index: number; config: QuizConfig }
    | { kind: 'setCountText'; index: number; text: string }
    | { kind: 'commitCount'; index: number }
    | { kind: 'commitAll' }
    | { kind: 'setTitle'; index: number; title: string }
    | { kind: 'setInstructions'; index: number; text: string }
  function parseCount(text: string): number | null
  function newSection(index: number, key: string): SectionDraft
  function sectionConfig(draft: SectionDraft): QuizConfig
  function sectionsReducer(state: SectionDraft[], action: SectionAction): SectionDraft[]
  function committedCount(draft: SectionDraft): number
  function totalItems(drafts: readonly SectionDraft[]): number
  function toSectionRequests(drafts: readonly SectionDraft[]): SectionRequest[]
  function changesForm(action: SectionAction): boolean
  ```

- [ ] **Step 1: Write the failing test** — `src/quiz/sectionForm.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SECTION_COUNT,
  newSection,
  parseCount,
  sectionConfig,
  sectionsReducer,
  toSectionRequests,
  totalItems,
  type SectionDraft,
} from './sectionForm'
import { defaultInstructions } from './types'

function three(): SectionDraft[] {
  let s = [newSection(0, 'a')]
  s = sectionsReducer(s, { kind: 'add', key: 'b' })
  s = sectionsReducer(s, { kind: 'add', key: 'c' })
  return s
}

describe('parseCount', () => {
  it('clamps whole numbers and rejects anything else', () => {
    expect(parseCount(' 7 ')).toBe(7)
    expect(parseCount('0')).toBe(1)
    expect(parseCount('99')).toBe(20)
    expect(parseCount('abc')).toBeNull()
    expect(parseCount('2.5')).toBeNull()
  })
})

describe('sectionsReducer', () => {
  it('starts a test as multiple choice with default title, count and instructions', () => {
    const [s] = [newSection(0, 'a')]
    expect(s.title).toBe('Test 1')
    expect(s.count).toBe(DEFAULT_SECTION_COUNT)
    expect(sectionConfig(s)).toEqual({ type: 'multiple_choice', choiceCount: 4 })
    expect(s.instructions).toBe(defaultInstructions(sectionConfig(s)))
  })

  it('adds up to three tests and no more', () => {
    const s = three()
    expect(s.map((d) => d.title)).toEqual(['Test 1', 'Test 2', 'Test 3'])
    expect(sectionsReducer(s, { kind: 'add', key: 'd' })).toBe(s)
  })

  it('never removes the last test', () => {
    const one = [newSection(0, 'a')]
    expect(sectionsReducer(one, { kind: 'remove', index: 0 })).toBe(one)
  })

  it('renumbers default titles after a removal but keeps edited ones', () => {
    let s = three()
    s = sectionsReducer(s, { kind: 'setTitle', index: 2, title: 'Bonus' })
    s = sectionsReducer(s, { kind: 'remove', index: 0 })
    expect(s.map((d) => d.title)).toEqual(['Test 1', 'Bonus'])
    expect(s.map((d) => d.key)).toEqual(['b', 'c'])
  })

  it('updates instructions with the type until they are edited', () => {
    let s = [newSection(0, 'a')]
    s = sectionsReducer(s, { kind: 'setType', index: 0, type: 'true_false' })
    expect(s[0].instructions).toBe('Write TRUE if the statement is true or FALSE if it is false.')
    s = sectionsReducer(s, { kind: 'setConfig', index: 0, config: { type: 'true_false', notation: 'letter' } })
    expect(s[0].instructions).toBe('Write T if the statement is true or F if it is false.')
    s = sectionsReducer(s, { kind: 'setInstructions', index: 0, text: 'My own words.' })
    s = sectionsReducer(s, { kind: 'setType', index: 0, type: 'fill_blank' })
    expect(s[0].instructions).toBe('My own words.')
  })

  it('remembers each type sub-option when switching away and back', () => {
    let s = [newSection(0, 'a')]
    s = sectionsReducer(s, { kind: 'setConfig', index: 0, config: { type: 'multiple_choice', choiceCount: 3 } })
    s = sectionsReducer(s, { kind: 'setType', index: 0, type: 'true_false' })
    s = sectionsReducer(s, { kind: 'setType', index: 0, type: 'multiple_choice' })
    expect(sectionConfig(s[0])).toEqual({ type: 'multiple_choice', choiceCount: 3 })
  })

  it('commits typed counts, reverting non-numbers', () => {
    let s = [newSection(0, 'a')]
    s = sectionsReducer(s, { kind: 'setCountText', index: 0, text: '25' })
    s = sectionsReducer(s, { kind: 'commitCount', index: 0 })
    expect([s[0].count, s[0].countText]).toEqual([20, '20'])
    s = sectionsReducer(s, { kind: 'setCountText', index: 0, text: 'x' })
    s = sectionsReducer(s, { kind: 'commitAll' })
    expect([s[0].count, s[0].countText]).toEqual([20, '20'])
  })
})

describe('toSectionRequests / totalItems', () => {
  it('uses typed counts, trims titles and falls back to the default title when blank', () => {
    let s = three()
    s = sectionsReducer(s, { kind: 'setTitle', index: 0, title: '   ' })
    s = sectionsReducer(s, { kind: 'setTitle', index: 1, title: '  Part B  ' })
    s = sectionsReducer(s, { kind: 'setCountText', index: 2, text: '4' })
    s = sectionsReducer(s, { kind: 'setInstructions', index: 2, text: `  ${'y'.repeat(400)}  ` })
    const requests = toSectionRequests(s)
    expect(requests.map((r) => r.section.title)).toEqual(['Test 1', 'Part B', 'Test 3'])
    expect(requests.map((r) => r.count)).toEqual([10, 10, 4])
    expect(requests[2].section.instructions.length).toBe(300)
    expect(totalItems(s)).toBe(24)
  })

  it('caps a long title at 80 characters', () => {
    const s = sectionsReducer([newSection(0, 'a')], { kind: 'setTitle', index: 0, title: 'z'.repeat(120) })
    expect(toSectionRequests(s)[0].section.title).toHaveLength(80)
  })
})

describe('changesForm', () => {
  it('is false only for settling a count already typed (a blur must not drop written tests)', () => {
    expect(changesForm({ kind: 'commitCount', index: 0 })).toBe(false)
    expect(changesForm({ kind: 'commitAll' })).toBe(false)
    expect(changesForm({ kind: 'setCountText', index: 0, text: '5' })).toBe(true)
    expect(changesForm({ kind: 'setTitle', index: 0, title: 'x' })).toBe(true)
    expect(changesForm({ kind: 'add', key: 'k' })).toBe(true)
    expect(changesForm({ kind: 'remove', index: 0 })).toBe(true)
    expect(changesForm({ kind: 'setType', index: 0, type: 'fill_blank' })).toBe(true)
  })
})
```

Add `changesForm` to this test file's import from `./sectionForm`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/quiz/sectionForm.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/quiz/sectionForm.ts`:

```ts
import type { SectionRequest } from './sections'
import {
  DEFAULT_CONFIGS,
  MAX_QUIZ_SECTIONS,
  MAX_SECTION_INSTRUCTIONS,
  MAX_SECTION_TITLE,
  clampItemCount,
  defaultInstructions,
  defaultSectionTitle,
  type QuizConfig,
  type QuizType,
} from './types'

/*
  The quiz modal's test cards as pure state. Rules: 1–3 tests; a default title
  follows the test's position until the user types one; instructions follow
  the type and sub-option until the user edits them; each type remembers its
  own sub-option.
*/

export const DEFAULT_SECTION_COUNT = 10

export interface SectionDraft {
  /** Stable React key; never shown. */
  key: string
  configs: Record<QuizType, QuizConfig>
  type: QuizType
  count: number
  /** What the Items field shows; settled into `count` on commit. */
  countText: string
  title: string
  titleEdited: boolean
  instructions: string
  instructionsEdited: boolean
}

export type SectionAction =
  | { kind: 'add'; key: string }
  | { kind: 'remove'; index: number }
  | { kind: 'setType'; index: number; type: QuizType }
  | { kind: 'setConfig'; index: number; config: QuizConfig }
  | { kind: 'setCountText'; index: number; text: string }
  | { kind: 'commitCount'; index: number }
  | { kind: 'commitAll' }
  | { kind: 'setTitle'; index: number; title: string }
  | { kind: 'setInstructions'; index: number; text: string }

/** An integer within 1–20, or `null` when the text isn't a whole number. */
export function parseCount(text: string): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null
  return clampItemCount(Number(text))
}

export function sectionConfig(draft: SectionDraft): QuizConfig {
  return draft.configs[draft.type]
}

export function newSection(index: number, key: string): SectionDraft {
  const configs = { ...DEFAULT_CONFIGS }
  const type: QuizType = 'multiple_choice'
  return {
    key,
    configs,
    type,
    count: DEFAULT_SECTION_COUNT,
    countText: String(DEFAULT_SECTION_COUNT),
    title: defaultSectionTitle(index),
    titleEdited: false,
    instructions: defaultInstructions(configs[type]),
    instructionsEdited: false,
  }
}

function withDefaults(draft: SectionDraft, index: number): SectionDraft {
  return {
    ...draft,
    title: draft.titleEdited ? draft.title : defaultSectionTitle(index),
    instructions: draft.instructionsEdited ? draft.instructions : defaultInstructions(sectionConfig(draft)),
  }
}

export function committedCount(draft: SectionDraft): number {
  return parseCount(draft.countText) ?? draft.count
}

function commit(draft: SectionDraft): SectionDraft {
  const count = committedCount(draft)
  return { ...draft, count, countText: String(count) }
}

function update(state: SectionDraft[], index: number, change: (d: SectionDraft) => SectionDraft): SectionDraft[] {
  if (index < 0 || index >= state.length) return state
  return state.map((d, i) => (i === index ? change(d) : d))
}

export function sectionsReducer(state: SectionDraft[], action: SectionAction): SectionDraft[] {
  switch (action.kind) {
    case 'add':
      if (state.length >= MAX_QUIZ_SECTIONS) return state
      return [...state, newSection(state.length, action.key)]
    case 'remove':
      if (state.length <= 1 || action.index < 0 || action.index >= state.length) return state
      return state.filter((_, i) => i !== action.index).map(withDefaults)
    case 'setType':
      return update(state, action.index, (d) => withDefaults({ ...d, type: action.type }, action.index))
    case 'setConfig':
      return update(state, action.index, (d) =>
        withDefaults({ ...d, type: action.config.type, configs: { ...d.configs, [action.config.type]: action.config } }, action.index),
      )
    case 'setCountText':
      return update(state, action.index, (d) => ({ ...d, countText: action.text }))
    case 'commitCount':
      return update(state, action.index, commit)
    case 'commitAll':
      return state.map(commit)
    case 'setTitle':
      return update(state, action.index, (d) => ({ ...d, title: action.title, titleEdited: true }))
    case 'setInstructions':
      return update(state, action.index, (d) => ({ ...d, instructions: action.text, instructionsEdited: true }))
  }
}

export function totalItems(drafts: readonly SectionDraft[]): number {
  return drafts.reduce((n, d) => n + committedCount(d), 0)
}

/**
 * Does this action change what the user asked for? Tests written before a
 * failure are kept only while the form is unchanged; settling a count that was
 * already typed (a blur, or Generate's own commit) is not a change.
 */
export function changesForm(action: SectionAction): boolean {
  return action.kind !== 'commitCount' && action.kind !== 'commitAll'
}

/** What generation and saving use: trimmed, capped, a blank title replaced by the default. */
export function toSectionRequests(drafts: readonly SectionDraft[]): SectionRequest[] {
  return drafts.map((d, i) => {
    const title = d.title.trim().slice(0, MAX_SECTION_TITLE)
    return {
      count: committedCount(d),
      section: {
        config: sectionConfig(d),
        title: title || defaultSectionTitle(i),
        instructions: d.instructions.trim().slice(0, MAX_SECTION_INSTRUCTIONS),
      },
    }
  })
}
```

Note on `setType`/`setConfig`: `withDefaults` is passed `action.index`, so an unedited title stays in step with its position.

- [ ] **Step 4: Run test** → `npx vitest run src/quiz/sectionForm.test.ts` PASS; `npm run build` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/quiz/sectionForm.ts src/quiz/sectionForm.test.ts
git commit -m "feat(quiz): pure form state for quiz test cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Migration 0016 and its hand-run SQL test

**Files:**
- Create: `supabase/migrations/0016_quiz_sections.sql`
- Create: `supabase/tests/0016_quiz_sections.sql`

**Interfaces:**
- Consumes: 0009 tables (`quizzes`, `quiz_questions`, `quiz_classes`, `quiz_attempts`, `classes`, `class_members`, `presentations`), 0012 functions (`generate_quiz_code`, `normalize_answer`, `assert_quiz_question`).
- Produces (what Tasks 5–7 call):
  - `create_quiz(p_presentation_id uuid, p_title text, p_deck_title text, p_sections jsonb) returns jsonb {id, code}`, where each section is `{title, instructions, type, settings, questions:[{slide_number, slide_heading, card_id, prompt, choices, answer}]}`.
  - `get_quiz_for_taking(p_code)` question objects gain `section_index` (int) and `question_type` (text); top-level `word_box` is replaced by `word_boxes` (object, keys are section indices as text).
  - `quiz_questions.section_index`, `quiz_questions.question_type` columns (owner reads select them).

There is no automated test for SQL in this repo. Steps here are: write, review against the checklist, commit. **Do not try to run SQL against any database.**

- [ ] **Step 1: Write `supabase/migrations/0016_quiz_sections.sql`**

```sql
-- 0016_quiz_sections.sql
-- A quiz is made of 1–3 tests ("sections"), each with its own type, title and
-- instructions. Builds on 0012 (never edited).
--
--   * quiz_questions gain section_index and question_type; existing rows are
--     backfilled from their quiz (one test, the quiz's type).
--   * quizzes.quiz_type may now be 'mixed' (a summary for lists).
--   * quizzes.settings for new quizzes is {"sections":[{title, instructions,
--     type, ...type settings}]}. Quizzes saved before 0016 keep their old
--     settings and are read as one test by the client.
--   * create_quiz now takes the tests (p_sections) and replaces the 0012
--     six-argument version, which is dropped.
--   * get_quiz_for_taking returns each question's section and type and a word
--     box per fill-in-the-blank test (word_boxes); submit_quiz_attempt scores
--     each question by its own type.
--
-- supabase/tests/0012_quiz_rls.sql checks the pre-0016 shape (old create_quiz,
-- word_box); after 0016 run supabase/tests/0016_quiz_sections.sql instead.

-- ─── columns ────────────────────────────────────────────────────────────────

alter table quiz_questions add column if not exists section_index integer not null default 0;
alter table quiz_questions add column if not exists question_type text;

update quiz_questions qq
   set question_type = q.quiz_type
  from quizzes q
 where q.id = qq.quiz_id
   and qq.question_type is null;

-- A question written without a type (an owner's direct insert, or any insert
-- shaped like 0012's) takes its quiz's type when that is a single type.
create or replace function quiz_question_default_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.question_type is null then
    select nullif(q.quiz_type, 'mixed') into new.question_type from quizzes q where q.id = new.quiz_id;
  end if;
  return new;
end;
$$;

drop trigger if exists quiz_questions_default_type on quiz_questions;
create trigger quiz_questions_default_type
  before insert on quiz_questions
  for each row execute function quiz_question_default_type();

alter table quiz_questions alter column question_type set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quiz_questions_section_index_check') then
    alter table quiz_questions
      add constraint quiz_questions_section_index_check check (section_index between 0 and 2);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quiz_questions_question_type_check') then
    alter table quiz_questions
      add constraint quiz_questions_question_type_check
      check (question_type in ('multiple_choice', 'fill_blank', 'true_false'));
  end if;
end $$;

-- quizzes.quiz_type: 0012 added an unnamed column check; drop whatever check
-- mentions quiz_type and add a named one that also allows 'mixed'.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'quizzes'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%quiz_type%'
  loop
    execute format('alter table quizzes drop constraint %I', c.conname);
  end loop;
end $$;

alter table quizzes add constraint quizzes_quiz_type_check
  check (quiz_type in ('multiple_choice', 'fill_blank', 'true_false', 'mixed'));

-- ─── create_quiz ────────────────────────────────────────────────────────────

drop function if exists create_quiz(uuid, text, text, text, jsonb, jsonb);

create or replace function create_quiz(
  p_presentation_id uuid,
  p_title text,
  p_deck_title text,
  p_sections jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  n_sections integer;
  s jsonb;
  s_type text;
  s_title text;
  s_instructions text;
  n integer;
  q jsonb;
  types text[] := '{}';
  stored jsonb := '[]'::jsonb;
  summary text;
  new_id uuid := gen_random_uuid();
  new_code text := generate_quiz_code();
begin
  if auth.uid() is null then raise exception 'Log in to create a quiz.'; end if;
  if trim(coalesce(p_title, '')) = '' then raise exception 'A quiz needs a title.'; end if;
  if jsonb_typeof(p_sections) is distinct from 'array' then raise exception 'Tests must be a list.'; end if;
  n_sections := jsonb_array_length(p_sections);
  if n_sections < 1 or n_sections > 3 then raise exception 'A quiz has between 1 and 3 tests.'; end if;
  -- Under invoker rights, presentations' owner-only RLS decides visibility.
  if not exists (select 1 from presentations where id = p_presentation_id) then
    raise exception 'That deck isn''t available.';
  end if;

  for i in 0 .. n_sections - 1 loop
    s := p_sections -> i;
    if jsonb_typeof(s) is distinct from 'object' then raise exception 'Each test must be an object.'; end if;
    s_type := s->>'type';
    if s_type is null or s_type not in ('multiple_choice', 'fill_blank', 'true_false') then
      raise exception 'Unknown quiz type.';
    end if;
    s_title := trim(coalesce(s->>'title', ''));
    if s_title = '' then raise exception 'Every test needs a title.'; end if;
    if length(s_title) > 80 then raise exception 'A test title is at most 80 characters.'; end if;
    s_instructions := trim(coalesce(s->>'instructions', ''));
    if length(s_instructions) > 300 then raise exception 'Test instructions are at most 300 characters.'; end if;
    if jsonb_exists(s, 'settings') and jsonb_typeof(s->'settings') is distinct from 'object' then
      raise exception 'Test settings must be an object.';
    end if;
    if jsonb_typeof(s->'questions') is distinct from 'array' then raise exception 'Questions must be a list.'; end if;
    n := jsonb_array_length(s->'questions');
    if n < 1 or n > 20 then raise exception 'Each test has between 1 and 20 questions.'; end if;

    for q in select value from jsonb_array_elements(s->'questions') loop
      perform assert_quiz_question(s_type, q);
    end loop;

    types := array_append(types, s_type);
    -- settings first, so a client-supplied "title"/"type" inside settings cannot override the checked ones.
    stored := stored || jsonb_build_array(
      coalesce(s->'settings', '{}'::jsonb)
      || jsonb_build_object('title', s_title, 'instructions', s_instructions, 'type', s_type)
    );
  end loop;

  summary := case when (select count(distinct t) from unnest(types) as t) = 1 then types[1] else 'mixed' end;

  -- id and code are chosen up front and there is deliberately NO `returning`
  -- (see create_quiz in 0012: RETURNING re-checks the SELECT policy, which
  -- cannot see the row yet, and the insert would be refused).
  insert into quizzes (id, presentation_id, title, deck_title, quiz_type, settings, code)
  values (
    new_id,
    p_presentation_id,
    trim(p_title),
    coalesce(nullif(trim(p_deck_title), ''), trim(p_title)),
    summary,
    jsonb_build_object('sections', stored),
    new_code
  );

  insert into quiz_questions
    (quiz_id, order_index, section_index, question_type, card_id, slide_number, slide_heading, prompt, choices, answer)
  select
    new_id,
    (row_number() over (order by sec.ord, qs.ord) - 1)::int,
    (sec.ord - 1)::int,
    sec.elem->>'type',
    nullif(qs.elem->>'card_id', '')::uuid,
    (qs.elem->>'slide_number')::int,
    coalesce(qs.elem->>'slide_heading', ''),
    trim(qs.elem->>'prompt'),
    case when sec.elem->>'type' = 'multiple_choice' then coalesce(qs.elem->'choices', '[]'::jsonb) else '[]'::jsonb end,
    qs.elem->'answer'
  from jsonb_array_elements(p_sections) with ordinality as sec(elem, ord)
  cross join lateral jsonb_array_elements(sec.elem->'questions') with ordinality as qs(elem, ord);

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
  boxes jsonb := '{}'::jsonb;
  sec record;
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
             'section_index', qq.section_index,
             'question_type', qq.question_type,
             'slide_number', qq.slide_number,
             'prompt', qq.prompt,
             'choices', qq.choices
           ) order by qq.order_index), '[]'::jsonb)
    into question_list
    from quiz_questions qq
    where qq.quiz_id = quiz.id;

  -- A word box per fill-in-the-blank test that asked for one: that test's
  -- answers, shuffled stably. JSON comparison, never a cast (settings is
  -- client-supplied and must not be able to break taking).
  if jsonb_typeof(quiz.settings->'sections') = 'array' then
    for sec in
      select (t.ord - 1)::int as idx, t.elem
        from jsonb_array_elements(quiz.settings->'sections') with ordinality as t(elem, ord)
    loop
      if sec.elem->>'type' = 'fill_blank' and coalesce(sec.elem->'wordBox' = 'true'::jsonb, false) then
        boxes := boxes || jsonb_build_object(sec.idx::text, (
          select coalesce(jsonb_agg(w.word order by md5(w.word || quiz.id::text)), '[]'::jsonb)
            from (select distinct (qq.answer->>'text') as word
                    from quiz_questions qq
                   where qq.quiz_id = quiz.id
                     and qq.section_index = sec.idx
                     and qq.question_type = 'fill_blank') w));
      end if;
    end loop;
  elsif quiz.quiz_type = 'fill_blank' and coalesce(quiz.settings->'wordBox' = 'true'::jsonb, false) then
    boxes := jsonb_build_object('0', (
      select coalesce(jsonb_agg(w.word order by md5(w.word || quiz.id::text)), '[]'::jsonb)
        from (select distinct (qq.answer->>'text') as word from quiz_questions qq where qq.quiz_id = quiz.id) w));
  end if;

  return jsonb_build_object(
    'id', quiz.id,
    'title', quiz.title,
    'deck_title', quiz.deck_title,
    'quiz_type', quiz.quiz_type,
    'settings', quiz.settings,
    'classes', eligible,
    'questions', question_list,
    'word_boxes', boxes
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

  for rec in
    select qq.id, qq.answer, qq.question_type
      from quiz_questions qq
     where qq.quiz_id = quiz.id
     order by qq.order_index
  loop
    total := total + 1;
    given := p_answers -> (rec.id::text);
    ok := false;

    if given is not null and jsonb_typeof(given) <> 'null' then
      if rec.question_type = 'multiple_choice' then
        ok := jsonb_typeof(given) = 'number' and given = rec.answer;
      elsif rec.question_type = 'true_false' then
        ok := jsonb_typeof(given) = 'boolean' and given = rec.answer;
      elsif rec.question_type = 'fill_blank' then
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

revoke execute on function quiz_question_default_type() from public, anon, authenticated;
revoke execute on function create_quiz(uuid, text, text, jsonb) from public, anon;
grant execute on function create_quiz(uuid, text, text, jsonb) to authenticated;
revoke execute on function get_quiz_for_taking(text) from public, anon;
grant execute on function get_quiz_for_taking(text) to authenticated;
revoke execute on function submit_quiz_attempt(text, uuid, jsonb) from public, anon;
grant execute on function submit_quiz_attempt(text, uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Write `supabase/tests/0016_quiz_sections.sql`** (same shape as `supabase/tests/0012_quiz_rls.sql`: one transaction that rolls back, fixtures as postgres, checks under `set local role authenticated` with forged claims, refusals matched by message):

```sql
-- Hand-run checks for 0016_quiz_sections.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying
-- 0009-0016. One transaction that rolls back; any failed check raises with a
-- message naming it; a clean run ends by printing "quiz sections checks passed".
-- Refusals are matched by message so a typo here can't pass as "refused".

begin;

-- ── fixtures (as postgres) ──────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000000601', 's-teacher@example.test', '{"role":"teacher","display_name":"Tess Teacher"}'),
  ('00000000-0000-4000-a000-000000000602', 's-student@example.test', '{"role":"student","display_name":"Stu Student"}');

insert into presentations (id, owner_id, title, theme)
values ('00000000-0000-4000-e000-000000000601', '00000000-0000-4000-a000-000000000601', 'Cells', '{}');

insert into classes (id, teacher_id, name, join_code)
values ('00000000-0000-4000-b000-000000000601', '00000000-0000-4000-a000-000000000601', 'Sections Bio', 'SCBIO2');
insert into class_members (class_id, student_id)
values ('00000000-0000-4000-b000-000000000601', '00000000-0000-4000-a000-000000000602');

-- A legacy-shaped quiz: inserted without question_type, as 0012 code did.
insert into quizzes (id, teacher_id, title, deck_title, quiz_type, settings, code) values
  ('00000000-0000-4000-d000-000000000601', '00000000-0000-4000-a000-000000000601', 'Legacy blanks', 'Cells', 'fill_blank', '{"wordBox":true}', 'LGCYBK22');
insert into quiz_questions (id, quiz_id, order_index, slide_number, prompt, choices, answer) values
  ('00000000-0000-4000-f000-000000000601', '00000000-0000-4000-d000-000000000601', 0, 2, 'The ___ makes ATP.', '[]', '{"text":"Mitochondria","accepted":[]}');
insert into quiz_classes (quiz_id, class_id)
values ('00000000-0000-4000-d000-000000000601', '00000000-0000-4000-b000-000000000601');

-- 1. legacy rows: the trigger filled question_type and section_index defaulted
do $$ begin
  if (select question_type from quiz_questions where id = '00000000-0000-4000-f000-000000000601') <> 'fill_blank'
     or (select section_index from quiz_questions where id = '00000000-0000-4000-f000-000000000601') <> 0 then
    raise exception 'legacy: question_type / section_index not filled';
  end if;
  if exists (select 1 from quiz_questions where question_type is null) then
    raise exception 'migration: a question has no type after backfill';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000601","role":"authenticated"}', true);

-- 2. a mixed quiz saves with its tests, types and order
do $$
declare
  res jsonb;
  qid uuid;
  mc jsonb := '{"slide_number":2,"slide_heading":"Organelles","prompt":"Which organelle makes ATP?","choices":["Nucleus","Mitochondrion","Ribosome"],"answer":1}';
  tf jsonb := '{"slide_number":3,"slide_heading":"Nuclei","prompt":"Cells have nuclei.","answer":true}';
  fb jsonb := '{"slide_number":4,"slide_heading":"Energy","prompt":"The _____ makes ATP.","answer":{"text":"mitochondria","accepted":[]}}';
begin
  res := create_quiz('00000000-0000-4000-e000-000000000601', 'Cells quiz', 'Cells', jsonb_build_array(
    jsonb_build_object('title', ' Part A ', 'instructions', 'Pick one.', 'type', 'multiple_choice',
                       'settings', '{"choiceCount":3,"title":"hijack"}'::jsonb, 'questions', jsonb_build_array(mc)),
    jsonb_build_object('title', 'Part B', 'instructions', '', 'type', 'true_false',
                       'settings', '{"notation":"letter"}'::jsonb, 'questions', jsonb_build_array(tf, tf)),
    jsonb_build_object('title', 'Part C', 'instructions', 'Use the box.', 'type', 'fill_blank',
                       'settings', '{"wordBox":true}'::jsonb, 'questions', jsonb_build_array(fb))
  ));
  qid := (res->>'id')::uuid;
  perform set_config('sectest.id', res->>'id', true);
  perform set_config('sectest.code', res->>'code', true);

  if (select quiz_type from quizzes where id = qid) <> 'mixed' then
    raise exception 'create: quiz_type should be mixed';
  end if;
  if (select settings->'sections'->0->>'title' from quizzes where id = qid) <> 'Part A'
     or (select settings->'sections'->0->>'type' from quizzes where id = qid) <> 'multiple_choice'
     or (select settings->'sections'->0->'choiceCount' from quizzes where id = qid) <> '3'::jsonb
     or (select settings->'sections'->2->'wordBox' from quizzes where id = qid) <> 'true'::jsonb then
    raise exception 'create: stored sections are wrong: %', (select settings from quizzes where id = qid);
  end if;
  if (select array_agg(section_index || ':' || question_type || ':' || order_index order by order_index)
        from quiz_questions where quiz_id = qid)
     <> array['0:multiple_choice:0', '1:true_false:1', '1:true_false:2', '2:fill_blank:3'] then
    raise exception 'create: question rows are wrong';
  end if;
  if (select choices from quiz_questions where quiz_id = qid and question_type = 'true_false' limit 1) <> '[]'::jsonb then
    raise exception 'create: non-MC questions must store no choices';
  end if;

  -- a single-type quiz keeps that type as its summary
  res := create_quiz('00000000-0000-4000-e000-000000000601', 'TF only', 'Cells', jsonb_build_array(
    jsonb_build_object('title', 'Test 1', 'instructions', '', 'type', 'true_false', 'settings', '{}'::jsonb, 'questions', jsonb_build_array(tf)),
    jsonb_build_object('title', 'Test 2', 'instructions', '', 'type', 'true_false', 'settings', '{}'::jsonb, 'questions', jsonb_build_array(tf))
  ));
  if (select quiz_type from quizzes where id = (res->>'id')::uuid) <> 'true_false' then
    raise exception 'create: a single-type quiz should keep its type';
  end if;
end $$;

-- 3. refusals
do $$
declare
  tf jsonb := '{"slide_number":3,"prompt":"Cells have nuclei.","answer":true}';
  one jsonb;
  msg text;
  twentyone jsonb;
begin
  one := jsonb_build_object('title', 'T', 'instructions', '', 'type', 'true_false', 'settings', '{}'::jsonb, 'questions', jsonb_build_array(tf));

  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', jsonb_build_array(one, one, one, one));
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'A quiz has between 1 and 3 tests.' then raise exception 'refuse 4 tests: %', msg; end if;

  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', '[]');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'A quiz has between 1 and 3 tests.' then raise exception 'refuse 0 tests: %', msg; end if;

  select jsonb_agg(tf) into twentyone from generate_series(1, 21);
  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', jsonb_build_array(
    jsonb_set(one, '{questions}', twentyone)));
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Each test has between 1 and 20 questions.' then raise exception 'refuse 21 questions: %', msg; end if;

  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', jsonb_build_array(
    jsonb_set(one, '{type}', '"multiple_choice"')));
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'A multiple-choice question needs choices.' then raise exception 'refuse wrong shape: %', msg; end if;

  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', jsonb_build_array(
    jsonb_set(one, '{title}', '"   "')));
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Every test needs a title.' then raise exception 'refuse blank title: %', msg; end if;

  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', jsonb_build_array(
    jsonb_set(one, '{type}', '"mixed"')));
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Unknown quiz type.' then raise exception 'refuse mixed section type: %', msg; end if;
end $$;

-- post the mixed quiz (teacher owns it)
insert into quiz_classes (quiz_id, class_id)
values (current_setting('sectest.id')::uuid, '00000000-0000-4000-b000-000000000601');

-- ── student ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000602","role":"authenticated"}', true);

-- 4. taking: no answers, per-question section and type, a word box only for Part C
do $$
declare
  res jsonb;
begin
  if exists (select 1 from quiz_questions) then
    raise exception 'student: must not read quiz questions directly';
  end if;
  res := get_quiz_for_taking(current_setting('sectest.code'));
  if res::text ~ '"answer"' then raise exception 'student: an answer leaked: %', res; end if;
  if res ? 'word_box' then raise exception 'student: old word_box key still returned'; end if;
  if (select array_agg((q->>'section_index') || ':' || (q->>'question_type'))
        from jsonb_array_elements(res->'questions') q)
     <> array['0:multiple_choice', '1:true_false', '1:true_false', '2:fill_blank'] then
    raise exception 'student: question sections/types wrong: %', res->'questions';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(res->'word_boxes') k) <> array['2']
     or res->'word_boxes'->'2' <> '["mitochondria"]'::jsonb then
    raise exception 'student: word boxes wrong: %', res->'word_boxes';
  end if;

  -- legacy quiz: its box comes back under "0"
  res := get_quiz_for_taking('LGCYBK22');
  if res->'word_boxes'->'0' <> '["Mitochondria"]'::jsonb then
    raise exception 'student: legacy word box wrong: %', res->'word_boxes';
  end if;
end $$;

-- 5. scoring is per question type: MC right, TF right + wrong, blank right → 3 of 4
do $$
declare
  res jsonb;
  ids uuid[];
begin
  -- the student can't read question ids directly; take them from the taking payload
  select array_agg((q->>'id')::uuid order by (q->>'order_index')::int) into ids
    from jsonb_array_elements(get_quiz_for_taking(current_setting('sectest.code'))->'questions') q;
  res := submit_quiz_attempt(current_setting('sectest.code'), '00000000-0000-4000-b000-000000000601',
    jsonb_build_object(ids[1]::text, 1, ids[2]::text, true, ids[3]::text, false, ids[4]::text, ' Mitochondria. '));
  if (res->>'correct')::int <> 3 or (res->>'total')::int <> 4 then
    raise exception 'scoring: expected 3 of 4, got %', res;
  end if;
  if res->'results' <> '[true,true,false,true]'::jsonb then
    raise exception 'scoring: wrong per-question results %', res->'results';
  end if;
end $$;

rollback;

select 'quiz sections checks passed' as result;
```

- [ ] **Step 3: Self-check the SQL** against this list (fix anything that fails; no database is available):
  - `create_quiz` has no `returning` clause; is `security invoker`.
  - Every `jsonb_typeof(x) <> …` check uses `is distinct from` where `x` may be missing.
  - The `settings || build_object(...)` order puts `title/instructions/type` on the right (they win).
  - `get_quiz_for_taking` never selects `answer` into `question_list`.
  - `submit_quiz_attempt` branches on `rec.question_type`, not `quiz.quiz_type`.
  - The old six-argument `create_quiz` is dropped before the new one is created.
  - The test file's message strings match the `raise exception` strings exactly (including `assert_quiz_question`'s 'A multiple-choice question needs choices.').

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0016_quiz_sections.sql supabase/tests/0016_quiz_sections.sql
git commit -m "feat(quiz): migration 0016 — quiz test sections, per-question type

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Owner/deck data layer with sections, preview and PDF

**Files:**
- Modify: `src/quiz/rows.ts`, `src/quiz/rows.test.ts`
- Modify: `src/quiz/api.ts`, `src/quiz/questionJson.test.ts`
- Modify: `src/classroom/types.ts`, `src/classroom/rows.ts`, `src/classroom/rows.test.ts`, `src/components/classroom/StudentQuizRow.tsx`
- Modify: `src/components/quiz/QuizPreview.tsx`
- Modify: `src/quiz/pdf/quizPdfLayout.ts`, `src/quiz/pdf/quizPdfLayout.test.ts`
- Modify: `src/components/quiz/QuizModal.tsx` (minimal: keep compiling)

**Interfaces:**
- Consumes: Task 1 (`QuizSection`, `fromDbSections`, `parseTypeSummary`, `quizTypeLabel`, `summaryType`, `defaultInstructions`, `defaultSectionTitle`, `QuizTypeSummary`), Task 4's columns/RPC.
- Produces:
  - `rows.ts`: `OWNER_QUESTION_COLUMNS = 'id, order_index, section_index, question_type, slide_number, slide_heading, prompt, choices, answer'`; `OwnerQuestion` gains `sectionIndex: number; type: QuizType`; `OwnerQuiz.sections: QuizSection[]` (replaces `config`); `DeckQuizSummary.sections: QuizSection[]` (replaces `config`); `asQuizType(value: unknown, fallback: QuizType): QuizType`; `groupBySection<T extends { sectionIndex: number }>(sections: readonly QuizSection[], questions: readonly T[]): { section: QuizSection; index: number; questions: T[] }[]`.
  - `api.ts`: `interface SectionToSave { section: QuizSection; questions: QuizQuestionDraft[] }`; `sectionJson(s: SectionToSave)`; `createQuiz({ presentationId, title, deckTitle, sections: SectionToSave[] })`.
  - classroom `QuizSummary.quizType` and `StudentQuiz.quizType` become `QuizTypeSummary`.

- [ ] **Step 1: Update tests first.**

In `src/quiz/rows.test.ts`, replace the `deckQuizFromRow` first test's expectation `config: { type: 'fill_blank', wordBox: true },` with:

```ts
      sections: [
        {
          title: 'Test 1',
          instructions: 'Fill in each blank using a word from the word box.',
          config: { type: 'fill_blank', wordBox: true },
        },
      ],
```

Replace the `ownerQuizFromRows` describe with:

```ts
describe('ownerQuizFromRows', () => {
  it('orders questions and keeps the answers (legacy quiz, rows without section columns)', () => {
    const quiz = ownerQuizFromRows(
      { id: 'q', code: 'C', title: 'T', deck_title: 'D', created_at: 'x', quiz_type: 'true_false', settings: { notation: 'letter' } },
      [
        { id: 'b', order_index: 1, slide_number: 2, slide_heading: 'H2', prompt: 'P2', choices: [], answer: false },
        { id: 'a', order_index: 0, slide_number: 1, slide_heading: 'H1', prompt: 'P1', choices: [], answer: true },
      ],
    )
    expect(quiz.sections.map((s) => s.config)).toEqual([{ type: 'true_false', notation: 'letter' }])
    expect(quiz.questions.map((q) => q.id)).toEqual(['a', 'b'])
    expect(quiz.questions[0]).toMatchObject({ answer: true, sectionIndex: 0, type: 'true_false' })
  })

  it('reads sections and each question’s section and type, clamping a bad section index', () => {
    const quiz = ownerQuizFromRows(
      {
        id: 'q', code: 'C', title: 'T', deck_title: 'D', created_at: 'x', quiz_type: 'mixed',
        settings: { sections: [
          { title: 'A', instructions: '', type: 'multiple_choice', choiceCount: 3 },
          { title: 'B', instructions: 'Say T or F.', type: 'true_false', notation: 'letter' },
        ] },
      },
      [
        { id: 'x', order_index: 0, section_index: 0, question_type: 'multiple_choice', slide_number: 1, slide_heading: 'H', prompt: 'P', choices: ['a', 'b', 'c'], answer: 2 },
        { id: 'y', order_index: 1, section_index: 1, question_type: 'true_false', slide_number: 1, slide_heading: 'H', prompt: 'P', choices: [], answer: false },
        { id: 'z', order_index: 2, section_index: 7, question_type: 'essay', slide_number: 1, slide_heading: 'H', prompt: 'P', choices: [], answer: true },
      ],
    )
    expect(quiz.sections.map((s) => s.title)).toEqual(['A', 'B'])
    expect(quiz.questions.map((q) => [q.sectionIndex, q.type])).toEqual([
      [0, 'multiple_choice'],
      [1, 'true_false'],
      [1, 'true_false'],
    ])
  })
})

describe('groupBySection', () => {
  it('groups questions in order under each section, keeping empty sections out', () => {
    const sections = [
      { title: 'A', instructions: '', config: { type: 'true_false' as const, notation: 'word' as const } },
      { title: 'B', instructions: '', config: { type: 'true_false' as const, notation: 'word' as const } },
      { title: 'C', instructions: '', config: { type: 'true_false' as const, notation: 'word' as const } },
    ]
    const groups = groupBySection(sections, [
      { id: '1', sectionIndex: 0 },
      { id: '2', sectionIndex: 2 },
      { id: '3', sectionIndex: 0 },
    ])
    expect(groups.map((g) => [g.index, g.section.title, g.questions.map((q) => q.id)])).toEqual([
      [0, 'A', ['1', '3']],
      [2, 'C', ['2']],
    ])
  })
})
```

Add `groupBySection` to the import from `./rows`. Leave the `takeQuizFromJson` test unchanged in this task (Task 6 changes it).

In `src/quiz/questionJson.test.ts`, change the import to `import { questionJson, sectionJson } from './api'` and append:

```ts
/* The exact keys 0016's create_quiz reads from each element of p_sections. */
describe('sectionJson', () => {
  it('emits title, instructions, type, settings and the questions', () => {
    const json = sectionJson({
      section: { title: 'Part A', instructions: 'Pick one.', config: { type: 'multiple_choice', choiceCount: 3 } },
      questions: [
        { slideNumber: 1, slideHeading: 'H', cardId: null, prompt: 'P', choices: ['a', 'b', 'c'], answer: 1 },
      ],
    })
    expect(Object.keys(json).sort()).toEqual(['instructions', 'questions', 'settings', 'title', 'type'])
    expect(json).toMatchObject({
      title: 'Part A',
      instructions: 'Pick one.',
      type: 'multiple_choice',
      settings: { choiceCount: 3 },
    })
    expect(json.questions[0]).toEqual({
      slide_number: 1, slide_heading: 'H', card_id: null, prompt: 'P', choices: ['a', 'b', 'c'], answer: 1,
    })
  })
})
```

In `src/classroom/rows.test.ts`, add one test inside the `studentQuizFromRow` describe (next to the `'essay'` test):

```ts
  it('keeps a mixed quiz as mixed', () => {
    expect(studentQuizFromRow({ id: 'q', title: 'T', code: 'C', quiz_type: 'mixed', created_at: 'c' }).quizType).toBe('mixed')
  })
```

In `src/quiz/pdf/quizPdfLayout.test.ts`, replace the `quiz()` helper and add a `question()` helper:

```ts
import type { OwnerQuestion, OwnerQuiz } from '@/quiz/rows'
import { defaultInstructions, type QuizConfig } from '@/quiz/types'

function quiz(over: Partial<OwnerQuiz> & { config?: QuizConfig }): OwnerQuiz {
  const { config = { type: 'multiple_choice', choiceCount: 4 }, ...rest } = over
  return {
    id: 'q',
    code: 'ABCD23XY',
    title: 'Cells quiz',
    deckTitle: 'Cells',
    createdAt: '2026-09-24T00:00:00Z',
    sections: [{ title: 'Test 1', instructions: defaultInstructions(config), config }],
    questions: [],
    ...rest,
  }
}

/** A question in section 0 whose type defaults to the first section's. */
function question(over: Partial<OwnerQuestion>): OwnerQuestion {
  return { id: '1', sectionIndex: 0, type: 'multiple_choice', slideNumber: 1, slideHeading: 'H', prompt: 'P', choices: [], answer: 0, ...over }
}
```

Then go through the existing `buildQuizItems` tests: every question literal `{ id, slideNumber, slideHeading, prompt, choices, answer }` becomes `question({ ...same fields, type: <the test's config type> })` (multiple choice tests: `type: 'multiple_choice'`; fill-blank tests: `type: 'fill_blank'`; true/false tests: `type: 'true_false'`). Keep every existing assertion. Any assertion that looks for the instruction text keeps working because `quiz()` sets the section's instructions to `defaultInstructions(config)`. If an existing test asserts the exact *first items* of `sheet` (title, subtitle, subtitle, instruction), update it to expect `title, subtitle, subtitle, heading ('Test 1'), instruction`. If an existing test asserts the key starts with `[title 'Answer key', subtitle]`, it still holds; the key then has a `heading` before key lines — update `key` length/index assertions accordingly.

Append these new tests:

```ts
describe('buildQuizItems — several tests', () => {
  const mixed = quiz({
    sections: [
      { title: 'Part A', instructions: 'Pick one.', config: { type: 'multiple_choice', choiceCount: 3 } },
      { title: 'Part B', instructions: '', config: { type: 'fill_blank', wordBox: true } },
      { title: 'Part C', instructions: 'T or F.', config: { type: 'true_false', notation: 'letter' } },
    ],
    questions: [
      question({ id: 'a1', prompt: 'Which?', choices: ['x', 'y', 'z'], answer: 1 }),
      question({ id: 'a2', prompt: 'Which else?', choices: ['x', 'y', 'z'], answer: 0 }),
      question({ id: 'b1', sectionIndex: 1, type: 'fill_blank', prompt: 'The ___ glows.', answer: { text: 'sun', accepted: [] } }),
      question({ id: 'c1', sectionIndex: 2, type: 'true_false', prompt: 'Water is wet.', answer: true }),
    ],
  })

  it('heads each test with its title and instructions and restarts numbering', () => {
    const { sheet } = buildQuizItems(mixed)
    expect(sheet.filter((i) => i.kind === 'heading').map((i) => i.text)).toEqual(['Part A', 'Part B', 'Part C'])
    expect(sheet.filter((i) => i.kind === 'instruction').map((i) => i.text)).toEqual(['Pick one.', 'T or F.'])
    expect(sheet.filter((i) => i.kind === 'question').map((i) => i.text)).toEqual([
      '1. Which?', '2. Which else?', '1. The ___ glows.', '1. Water is wet.',
    ])
    expect(sheet.filter((i) => i.kind === 'wordBox').map((i) => i.text)).toEqual(['sun'])
    expect(sheet.filter((i) => i.kind === 'answerLine').map((i) => i.text)).toEqual(['T / F'])
  })

  it('groups the key by test with numbering restarting', () => {
    const { key } = buildQuizItems(mixed)
    expect(key.filter((i) => i.kind === 'heading' || i.kind === 'keyLine').map((i) => i.text)).toEqual([
      'Part A', '1. B', '2. A', 'Part B', '1. sun', 'Part C', '1. T',
    ])
  })

  it('never ends the sheet on a spacer', () => {
    const { sheet } = buildQuizItems(mixed)
    expect(sheet[sheet.length - 1].kind).not.toBe('blank')
  })
})
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/quiz src/classroom` → FAIL (types/exports missing).

- [ ] **Step 3: Implement `src/quiz/rows.ts`.**

Change the import line to:

```ts
import { fromDbConfig, fromDbSections, type QuizAnswer, type QuizConfig, type QuizSection, type QuizType } from './types'
```

(`fromDbConfig` and `QuizConfig` stay for `takeQuizFromJson` until Task 6.)

Set `OWNER_QUESTION_COLUMNS`:

```ts
export const OWNER_QUESTION_COLUMNS =
  'id, order_index, section_index, question_type, slide_number, slide_heading, prompt, choices, answer'
```

`OwnerQuestionRow` gains (optional, so older test literals and pre-0016 shapes still type-check):

```ts
  section_index?: number | null
  question_type?: string | null
```

`DeckQuizSummary`: replace `config: QuizConfig` with `sections: QuizSection[]`.
`OwnerQuestion`: add `sectionIndex: number` and `type: QuizType`.
`OwnerQuiz`: replace `config: QuizConfig` with `sections: QuizSection[]`.
Leave `TakeQuiz`/`TakeQuestion`/`TakeJson`/`takeQuizFromJson` exactly as they are in this task (Task 6 changes them) — `TakeQuiz.config` stays `QuizConfig`, so keep the `QuizConfig` import.

Add helpers (after `asAnswer`):

```ts
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
```

Replace `deckQuizFromRow`'s `config:` line with `sections: fromDbSections(row.quiz_type, row.settings),`.

Replace `ownerQuizFromRows` with:

```ts
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
```

Note: in the clamping test, row `z` has `section_index: 7` → clamped to 1, and `question_type: 'essay'` → falls back to section 1's type `true_false`. That matches the expected `[1, 'true_false']`.

- [ ] **Step 4: Implement `src/quiz/api.ts`.**

Change the types import to `import { toDbConfig, type QuizQuestionDraft, type QuizSection } from './types'` and replace `createQuiz` with:

```ts
export interface SectionToSave {
  section: QuizSection
  questions: QuizQuestionDraft[]
}

/** One element of `create_quiz`'s `p_sections` (supabase/migrations/0016_quiz_sections.sql). */
export function sectionJson({ section, questions }: SectionToSave) {
  const { quiz_type, settings } = toDbConfig(section.config)
  return {
    title: section.title,
    instructions: section.instructions,
    type: quiz_type,
    settings,
    questions: questions.map(questionJson),
  }
}

export async function createQuiz(input: {
  presentationId: string
  title: string
  deckTitle: string
  sections: SectionToSave[]
}): Promise<{ id: string; code: string }> {
  const client = await db()
  return rpcValue<{ id: string; code: string }>(
    await client.rpc('create_quiz', {
      p_presentation_id: input.presentationId,
      p_title: input.title,
      p_deck_title: input.deckTitle,
      p_sections: input.sections.map(sectionJson),
    }),
  )
}
```

Also update the comment in `questionJson.test.ts` that mentions `0012_quizzes.sql` to say the keys are read from each section's `questions` by `0016_quiz_sections.sql`.

- [ ] **Step 5: Classroom `'mixed'`.**

`src/classroom/types.ts`: import `type QuizTypeSummary` from `@/quiz/types` (replacing `QuizType` if it becomes unused) and change both `quizType: QuizType` fields to `quizType: QuizTypeSummary`.

`src/classroom/rows.ts`: change the import to `import { parseTypeSummary } from '@/quiz/types'` and both `quizType: fromDbConfig(row.quiz_type, {}).type,` lines to `quizType: parseTypeSummary(row.quiz_type),`.

`src/components/classroom/StudentQuizRow.tsx`: import `quizTypeLabel` instead of `QUIZ_TYPE_LABELS` and set `const quizTypeLabel = quizTypeLabelOf(quiz.quizType)` — to avoid shadowing, import as `import { quizTypeLabel as labelFor } from '@/quiz/types'` and write `const quizTypeLabel = labelFor(quiz.quizType)`.

Run `npx tsc -b` and fix any other place that reads `quizType` as `QuizType` (e.g. `classroom/select.test.ts` fixtures still use `'multiple_choice'`, which is valid).

- [ ] **Step 6: Implement `src/quiz/pdf/quizPdfLayout.ts`.**

Delete the local `instruction()` function. Change imports to:

```ts
import { groupBySection, type OwnerQuiz } from '@/quiz/rows'
```

Replace `buildQuizItems` with:

```ts
/** The quiz sheet and its answer key as flat, geometry-free items. Numbering restarts in each test. */
export function buildQuizItems(quiz: OwnerQuiz): { sheet: PdfItem[]; key: PdfItem[] } {
  const sheet: PdfItem[] = [
    { kind: 'title', text: quiz.title },
    { kind: 'subtitle', text: `From: ${quiz.deckTitle}` },
    { kind: 'subtitle', text: 'Name: ____________________________     Date: ______________' },
  ]
  const key: PdfItem[] = [{ kind: 'title', text: 'Answer key' }, { kind: 'subtitle', text: quiz.title }]

  groupBySection(quiz.sections, quiz.questions).forEach(({ section, questions }, gi) => {
    const { config } = section
    // Spacers only BETWEEN things: a trailing one could open an empty page before the key.
    if (gi > 0) sheet.push({ kind: 'blank', text: '' })
    sheet.push({ kind: 'heading', text: section.title })
    if (section.instructions) sheet.push({ kind: 'instruction', text: section.instructions })

    if (config.type === 'fill_blank' && config.wordBox) {
      const words = [
        ...new Set(questions.map((q) => (typeof q.answer === 'object' ? q.answer.text : '')).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b))
      if (words.length > 0) sheet.push({ kind: 'wordBox', text: words.join('   ·   ') })
    }

    key.push({ kind: 'heading', text: section.title })
    const letter = config.type === 'true_false' && config.notation === 'letter'

    questions.forEach((q, i) => {
      const n = i + 1
      if (i > 0) sheet.push({ kind: 'blank', text: '' })
      sheet.push({ kind: 'question', text: `${n}. ${q.prompt}` })

      if (q.type === 'multiple_choice') {
        q.choices.forEach((c, ci) => sheet.push({ kind: 'choice', text: `${LETTERS[ci]}. ${c}` }))
        key.push({ kind: 'keyLine', text: `${n}. ${LETTERS[typeof q.answer === 'number' ? q.answer : 0]}` })
      } else if (q.type === 'fill_blank') {
        const a = typeof q.answer === 'object' ? q.answer : { text: '', accepted: [] as string[] }
        const also = a.accepted.length > 0 ? ` (also accepted: ${a.accepted.join(', ')})` : ''
        key.push({ kind: 'keyLine', text: `${n}. ${a.text}${also}` })
      } else {
        const value = q.answer === true
        sheet.push({ kind: 'answerLine', text: letter ? 'T / F' : 'TRUE / FALSE' })
        key.push({ kind: 'keyLine', text: `${n}. ${letter ? (value ? 'T' : 'F') : value ? 'TRUE' : 'FALSE'}` })
      }
    })
  })

  return { sheet, key }
}
```

`quizPdf.ts` needs no change: `heading` already has a style with `keepWithNext`.

- [ ] **Step 7: Implement `src/components/quiz/QuizPreview.tsx`** (full replacement):

```tsx
import { groupBySection, type OwnerQuestion, type OwnerQuiz } from '@/quiz/rows'
import type { QuizConfig } from '@/quiz/types'

const LETTERS = ['A', 'B', 'C', 'D']

function answerLabel(q: OwnerQuestion, config: QuizConfig): string {
  if (q.type === 'multiple_choice' && typeof q.answer === 'number') return LETTERS[q.answer]
  if (q.type === 'true_false') {
    const letter = config.type === 'true_false' && config.notation === 'letter'
    return q.answer === true ? (letter ? 'T' : 'TRUE') : letter ? 'F' : 'FALSE'
  }
  if (typeof q.answer === 'object') {
    return q.answer.accepted.length > 0 ? `${q.answer.text} (also: ${q.answer.accepted.join(', ')})` : q.answer.text
  }
  return ''
}

/** The generated quiz with its answers marked, grouped by test. Owner-only: it is fed by `loadOwnerQuiz`. */
export function QuizPreview({ quiz }: { quiz: OwnerQuiz }) {
  return (
    <div className="scrollbar-subtle max-h-96 space-y-5 overflow-y-auto rounded-app border border-app-border p-3 text-sm">
      {groupBySection(quiz.sections, quiz.questions).map(({ section, index, questions }) => (
        <section key={index} aria-label={section.title}>
          <h4 className="font-semibold text-app-foreground">{section.title}</h4>
          {section.instructions && <p className="mt-0.5 text-xs text-app-muted">{section.instructions}</p>}
          <ol className="mt-2 space-y-3">
            {questions.map((q, i) => (
              <li key={q.id}>
                <p className="font-medium text-app-foreground">
                  {i + 1}. {q.prompt}
                </p>
                {q.type === 'multiple_choice' && (
                  <ul className="mt-1 space-y-0.5 pl-4 text-app-muted">
                    {q.choices.map((c, ci) => (
                      <li key={ci} className={q.answer === ci ? 'font-medium text-app-accent-text' : undefined}>
                        {LETTERS[ci]}. {c}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-app-muted">
                  Answer:{' '}
                  <span className="font-medium text-app-accent-text">{answerLabel(q, section.config)}</span> · slide{' '}
                  {q.slideNumber}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 8: Keep `QuizModal.tsx` compiling (temporary; Task 7 rewrites it).**

In `save()`, replace `config: p.config,` in the `createQuiz` call with:

```ts
          sections: [
            {
              section: { config: p.config, title: defaultSectionTitle(0), instructions: defaultInstructions(p.config) },
              questions: p.questions,
            },
          ],
```

In the previous-quizzes list replace `{TYPE_LABEL[q.config.type]}` with `{quizTypeLabel(summaryType(q.sections))}` and delete the now-unused `TYPE_LABEL` constant. Add `defaultInstructions, defaultSectionTitle, quizTypeLabel, summaryType` to the `@/quiz/types` import.

- [ ] **Step 9: Run everything**

Run: `npm run test` → PASS. `npm run lint` → clean. `npm run build` → PASS.

- [ ] **Step 10: Commit**

```bash
git add src/quiz src/classroom src/components/classroom/StudentQuizRow.tsx src/components/quiz
git commit -m "feat(quiz): owner data, preview and PDF grouped by test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Student taking page grouped by test

**Files:**
- Modify: `src/quiz/rows.ts`, `src/quiz/rows.test.ts`
- Modify: `src/pages/QuizPage.tsx`

**Interfaces:**
- Consumes: Task 5 (`groupBySection`, `asQuizType`, `fromDbSections`), Task 4's `get_quiz_for_taking` payload (`section_index`, `question_type`, `word_boxes`; a database without 0016 returns neither — handle by defaults).
- Produces:
  - `TakeQuestion { id; slideNumber; prompt; choices; sectionIndex: number; type: QuizType }`
  - `TakeQuiz { id; title; deckTitle; sections: QuizSection[]; classes; questions: TakeQuestion[]; wordBoxes: Record<number, string[]> }` (replaces `config` and `wordBox`)

- [ ] **Step 1: Replace the `takeQuizFromJson` tests** in `src/quiz/rows.test.ts`:

```ts
describe('takeQuizFromJson', () => {
  it('maps a sectioned payload and never expects an answer', () => {
    const quiz = takeQuizFromJson({
      id: 'q',
      title: 'T',
      deck_title: 'D',
      quiz_type: 'mixed',
      settings: { sections: [
        { title: 'A', instructions: 'Pick.', type: 'multiple_choice', choiceCount: 3 },
        { title: 'B', instructions: '', type: 'fill_blank', wordBox: true },
      ] },
      classes: [{ id: 'c', name: 'Bio', attempted: false }],
      questions: [
        { id: 'x', order_index: 0, section_index: 0, question_type: 'multiple_choice', slide_number: 2, prompt: 'P', choices: ['a', 'b', 'c'] },
        { id: 'y', order_index: 1, section_index: 1, question_type: 'fill_blank', slide_number: 3, prompt: 'The ___.', choices: [] },
      ],
      word_boxes: { '1': ['sun', 'moon'], junk: ['x'], '0': 'nope' },
    })
    expect(quiz.sections.map((s) => s.title)).toEqual(['A', 'B'])
    expect(quiz.questions[0]).toEqual({
      id: 'x', slideNumber: 2, prompt: 'P', choices: ['a', 'b', 'c'], sectionIndex: 0, type: 'multiple_choice',
    })
    expect(quiz.wordBoxes).toEqual({ 1: ['sun', 'moon'] })
    expect('answer' in quiz.questions[0]).toBe(false)
  })

  it('reads a legacy payload (no section fields, old word_box) as one test', () => {
    const quiz = takeQuizFromJson({
      id: 'q',
      title: 'T',
      deck_title: 'D',
      quiz_type: 'fill_blank',
      settings: { wordBox: true },
      classes: [],
      questions: [{ id: 'x', order_index: 0, slide_number: 2, prompt: 'The ___.', choices: [] }],
      word_box: ['sun'],
    })
    expect(quiz.sections).toHaveLength(1)
    expect(quiz.questions[0]).toMatchObject({ sectionIndex: 0, type: 'fill_blank' })
    expect(quiz.wordBoxes).toEqual({ 0: ['sun'] })
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/quiz/rows.test.ts` → FAIL.

- [ ] **Step 3: Implement in `src/quiz/rows.ts`.** Replace `TakeQuestion`, `TakeQuiz`, `TakeJson`, `takeQuizFromJson`:

```ts
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
```

Remove the now-unused `fromDbConfig` and `QuizConfig` imports from `rows.ts` (lint/tsc will flag them).

- [ ] **Step 4: Update `src/pages/QuizPage.tsx`.**

Imports: add `groupBySection` to the `@/quiz/rows` import (it is a value import now: `import { groupBySection, type TakeQuestion, type TakeQuiz } from '@/quiz/rows'`) and `import type { QuizConfig } from '@/quiz/types'`.

In `QuizForm`, replace the whole `{quiz.wordBox && …}` block and the `<ol className="flex flex-col gap-4">…</ol>` block with:

```tsx
          {groupBySection(quiz.sections, quiz.questions).map(({ section, index, questions }) => {
            const words = quiz.wordBoxes[index]
            return (
              <section key={index} aria-labelledby={`quiz-test-${index}`} className="flex flex-col gap-4">
                <div>
                  <h2 id={`quiz-test-${index}`} className="text-base font-semibold text-app-foreground">
                    {section.title}
                  </h2>
                  {section.instructions && <p className="mt-1 text-sm text-app-muted">{section.instructions}</p>}
                </div>

                {words && words.length > 0 && (
                  <div className="rounded-app-sm border border-app-border bg-app-surface p-3">
                    <p className="mb-2 text-xs font-medium text-app-muted">Word box</p>
                    <ul className="flex flex-wrap gap-2">
                      {words.map((word, i) => (
                        <li
                          key={i}
                          className="rounded-app-sm border border-app-border bg-app-background px-2.5 py-1 text-sm text-app-foreground"
                        >
                          {word}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <ol className="flex flex-col gap-4">
                  {questions.map((q, i) => (
                    <li
                      key={q.id}
                      className="rounded-app border border-app-border/80 bg-app-surface/20 p-4 sm:p-5 transition-colors hover:border-app-border"
                    >
                      <QuestionField
                        index={i}
                        question={q}
                        config={section.config}
                        answer={answers[q.id]}
                        onAnswer={(value) => setAnswer(q.id, value)}
                      />
                    </li>
                  ))}
                </ol>
              </section>
            )
          })}
```

In `QuestionField`: change the prop type `config: TakeQuiz['config']` to `config: QuizConfig`, change `switch (config.type) {` to `switch (question.type) {`, and in the `true_false` case change `config.notation === 'letter'` to `config.type === 'true_false' && config.notation === 'letter'`.

In `ResultPanel`, group the review the same way so numbering restarts. Replace the `<ol className="divide-y divide-app-border">…</ol>` with:

```tsx
        <div className="flex flex-col gap-6">
          {groupBySection(quiz.sections, quiz.questions).map(({ section, index, questions }) => (
            <section key={index} aria-label={section.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-muted">{section.title}</h3>
              <ol className="divide-y divide-app-border">
                {questions.map((q, i) => {
                  const right = result.results[positions.get(q.id) ?? -1] === true
                  return (
                    <li key={q.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                      <span
                        className={`mt-0.5 inline-grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          right
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-red-500/15 text-red-600 dark:text-red-400'
                        }`}
                        aria-label={right ? 'Correct' : 'Incorrect'}
                      >
                        {right ? '✓' : '✕'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-app-muted">
                          <span className="font-mono font-medium">Question {i + 1}</span>
                          {q.slideNumber > 0 && <span>· Slide {q.slideNumber}</span>}
                        </div>
                        <p className="mt-1 text-sm text-app-foreground leading-snug">{q.prompt}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
```

and add at the top of `ResultPanel` (after `scorePercent`): `const positions = new Map(quiz.questions.map((q, i) => [q.id, i]))` — `result.results` is in global question order, so a question's result is found by its overall position, not its number within the test.

- [ ] **Step 5: Run** `npm run test`, `npm run lint`, `npm run build` → all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/quiz/rows.ts src/quiz/rows.test.ts src/pages/QuizPage.tsx
git commit -m "feat(quiz): students take quizzes test by test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The quiz modal — wider, tabs, test cards, sequential generation with resume

**Files:**
- Create: `src/components/quiz/Radios.tsx`, `src/components/quiz/SectionCard.tsx`, `src/components/quiz/DeckQuizList.tsx`
- Rewrite: `src/components/quiz/QuizModal.tsx`
- Test: `src/components/quiz/QuizModal.test.tsx` (create)

**Interfaces:**
- Consumes: Task 2 (`generateSections`, `SectionFailure`, `EmptySectionError`, `BuiltSection`), Task 3 (`sectionsReducer`, `newSection`, `SectionDraft`, `SectionAction`, `sectionConfig`, `toSectionRequests`, `totalItems`), Task 5 (`createQuiz` with `sections`, `OwnerQuiz`, `DeckQuizSummary`), Task 1 (`MAX_QUIZ_SECTIONS`, `MAX_QUIZ_ITEMS`, `MIN_QUIZ_ITEMS`, `MAX_SECTION_TITLE`, `MAX_SECTION_INSTRUCTIONS`, `quizTypeLabel`, `summaryType`, `defaultSectionTitle`).
- Produces:
  - `Radios<T extends string>(props: { label; value: T; options: { value: T; label: string }[]; onChange; disabled? })`
  - `SectionList(props: { drafts: SectionDraft[]; dispatch: (a: SectionAction) => void; onAdd: () => void; disabled: boolean })`
  - `DeckQuizList(props: { quizzes: DeckQuizSummary[] | null; loadError: boolean; isTeacher: boolean; pdfBusy: string | null; busy: boolean; onPdf: (quizId: string) => void })`, `CodeChip({ code })`
  - `QuizModal` keeps its props: `{ presentationId: string; title: string; cards: Card[]; onClose: () => void }`

- [ ] **Step 1: Write the failing render smoke test** — `src/components/quiz/QuizModal.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuizModal } from './QuizModal'
import { SectionList } from './SectionCard'
import { DeckQuizList } from './DeckQuizList'
import { newSection, sectionsReducer, type SectionDraft } from '@/quiz/sectionForm'
import type { Card } from '@/engine/contentBlocks'

/**
 * Render smoke tests (no jsdom, nothing can be clicked): what the modal and its
 * parts offer for which state.
 */

const noop = () => {}

const CARDS = [
  {
    id: 'c0',
    orderIndex: 0,
    layout: 'auto',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: 'Cells' },
      { type: 'paragraph', text: 'Mitochondria make ATP.' },
    ],
  },
] as unknown as Card[]

function drafts(n: number): SectionDraft[] {
  let s = [newSection(0, 'k0')]
  for (let i = 1; i < n; i++) s = sectionsReducer(s, { kind: 'add', key: `k${i}` })
  return s
}

/** The opening tag of the first button whose text includes `label`. */
function buttonTag(html: string, label: string): string {
  const at = html.indexOf(label)
  const start = html.lastIndexOf('<button', at)
  return html.slice(start, html.indexOf('>', start) + 1)
}

/** The `disabled` attribute itself, not the `disabled:` Tailwind variants in the class list. */
const DISABLED_ATTR = /\sdisabled=""/

describe('QuizModal', () => {
  it('opens on the Create tab, beside Quizzes from this deck, and is wide', () => {
    const html = renderToStaticMarkup(<QuizModal presentationId="p" title="Cells" cards={CARDS} onClose={noop} />)
    expect(html).toContain('max-w-3xl')
    const create = buttonTag(html, 'Create new quiz')
    const list = buttonTag(html, 'Quizzes from this deck')
    expect(create).toContain('role="tab"')
    expect(create).toContain('aria-selected="true"')
    expect(list).toContain('aria-selected="false"')
    expect(html).toContain('value="Test 1"')
    expect(html).not.toContain('value="Test 2"')
  })
})

describe('SectionList', () => {
  it('offers Add test and no remove button with a single test', () => {
    const html = renderToStaticMarkup(<SectionList drafts={drafts(1)} dispatch={noop} onAdd={noop} disabled={false} />)
    expect(buttonTag(html, 'Add test')).not.toMatch(DISABLED_ATTR)
    expect(html).not.toContain('Remove Test 1')
  })

  it('disables Add test at three tests and offers remove on each', () => {
    const html = renderToStaticMarkup(<SectionList drafts={drafts(3)} dispatch={noop} onAdd={noop} disabled={false} />)
    expect(buttonTag(html, 'Add test')).toMatch(DISABLED_ATTR)
    expect(html).toContain('Remove Test 1')
    expect(html).toContain('Remove Test 3')
    expect(html).toContain('3 tests · 30 items')
  })
})

describe('DeckQuizList', () => {
  it('shows an empty state when the deck has no quizzes', () => {
    const html = renderToStaticMarkup(
      <DeckQuizList quizzes={[]} loadError={false} isTeacher pdfBusy={null} busy={false} onPdf={noop} />,
    )
    expect(html).toContain('No quizzes from this deck yet')
  })

  it('labels a mixed quiz', () => {
    const html = renderToStaticMarkup(
      <DeckQuizList
        quizzes={[
          {
            id: 'q', code: 'ABCD23XY', title: 'Cells — quiz', createdAt: '2026-10-01T00:00:00Z', itemCount: 12,
            sections: [
              { title: 'Test 1', instructions: '', config: { type: 'multiple_choice', choiceCount: 4 } },
              { title: 'Test 2', instructions: '', config: { type: 'true_false', notation: 'word' } },
            ],
          },
        ]}
        loadError={false}
        isTeacher={false}
        pdfBusy={null}
        busy={false}
        onPdf={noop}
      />,
    )
    expect(html).toContain('12 questions · 2 tests · Mixed')
    expect(html).not.toContain('ABCD23XY')
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/quiz` → FAIL (modules missing).

If the modal's import chain fails under Vitest (e.g. `crypto` or Supabase at import), note that other suites already import `@/store/presentationStore` and `@/ai/fallbackProvider` (check with `grep -rl "presentationStore\|fallbackProvider" src --include=*.test.*`); fix the cause rather than mocking, and report it.

- [ ] **Step 3: Create `src/components/quiz/Radios.tsx`** — move the `RadioOption` interface and `Radios` component out of `QuizModal.tsx` verbatim, exported:

```tsx
import type { KeyboardEvent } from 'react'

export interface RadioOption<T extends string> {
  value: T
  label: string
}

/** A small exclusive choice, drawn as chips. Arrow keys move between options like a native radio group. */
export function Radios<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: T
  options: RadioOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || disabled) return
    e.preventDefault()
    const at = options.findIndex((o) => o.value === value)
    const next = options[(at + step + options.length) % options.length]
    onChange(next.value)
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons[(at + step + options.length) % options.length]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer rounded-app-sm border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50 ${
              checked
                ? 'border-app-accent bg-app-accent/15 text-app-accent-text'
                : 'border-app-border bg-app-surface text-app-foreground hover:bg-app-border/40'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/quiz/SectionCard.tsx`:**

```tsx
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Radios } from './Radios'
import {
  sectionConfig,
  totalItems,
  type SectionAction,
  type SectionDraft,
} from '@/quiz/sectionForm'
import {
  MAX_QUIZ_ITEMS,
  MAX_QUIZ_SECTIONS,
  MAX_SECTION_INSTRUCTIONS,
  MAX_SECTION_TITLE,
  MIN_QUIZ_ITEMS,
  defaultSectionTitle,
  type QuizType,
} from '@/quiz/types'

const TYPE_OPTIONS: { value: QuizType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'fill_blank', label: 'Fill in the blank' },
  { value: 'true_false', label: 'True or False' },
]

/** One test of the quiz being created: title, type, its sub-option, items and instructions. */
function SectionCard({
  draft,
  index,
  canRemove,
  dispatch,
  disabled,
}: {
  draft: SectionDraft
  index: number
  canRemove: boolean
  dispatch: (action: SectionAction) => void
  disabled: boolean
}) {
  const config = sectionConfig(draft)
  const name = draft.title.trim() || defaultSectionTitle(index)

  return (
    <li className="rounded-app border border-app-border bg-app-surface/30 p-4">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Test ${index + 1} title`}
          value={draft.title}
          maxLength={MAX_SECTION_TITLE}
          disabled={disabled}
          onChange={(e) => dispatch({ kind: 'setTitle', index, title: e.target.value })}
          className="font-semibold"
        />
        {canRemove && (
          <Button
            variant="secondary"
            className="shrink-0 !px-2.5 !py-1.5 text-xs"
            aria-label={`Remove ${name}`}
            disabled={disabled}
            onClick={() => dispatch({ kind: 'remove', index })}
          >
            Remove
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-app-muted">Type</p>
            <Radios
              label={`${name} type`}
              value={draft.type}
              options={TYPE_OPTIONS}
              onChange={(type) => dispatch({ kind: 'setType', index, type })}
              disabled={disabled}
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-app-muted">Options</p>
            {config.type === 'multiple_choice' && (
              <Radios
                label={`${name} number of choices`}
                value={String(config.choiceCount)}
                options={[
                  { value: '3', label: 'A–C' },
                  { value: '4', label: 'A–D' },
                ]}
                onChange={(v) =>
                  dispatch({ kind: 'setConfig', index, config: { type: 'multiple_choice', choiceCount: v === '3' ? 3 : 4 } })
                }
                disabled={disabled}
              />
            )}
            {config.type === 'fill_blank' && (
              <Radios
                label={`${name} word box`}
                value={config.wordBox ? 'box' : 'none'}
                options={[
                  { value: 'none', label: 'No word box' },
                  { value: 'box', label: 'Word box' },
                ]}
                onChange={(v) => dispatch({ kind: 'setConfig', index, config: { type: 'fill_blank', wordBox: v === 'box' } })}
                disabled={disabled}
              />
            )}
            {config.type === 'true_false' && (
              <Radios
                label={`${name} answer notation`}
                value={config.notation}
                options={[
                  { value: 'word', label: 'TRUE / FALSE' },
                  { value: 'letter', label: 'T / F' },
                ]}
                onChange={(v) => dispatch({ kind: 'setConfig', index, config: { type: 'true_false', notation: v } })}
                disabled={disabled}
              />
            )}
          </div>
        </div>

        <div className="w-24">
          <Field
            label="Items"
            hint={`${MIN_QUIZ_ITEMS}–${MAX_QUIZ_ITEMS}`}
            render={(fieldProps) => (
              <Input
                {...fieldProps}
                inputMode="numeric"
                autoComplete="off"
                value={draft.countText}
                disabled={disabled}
                onChange={(e) => dispatch({ kind: 'setCountText', index, text: e.target.value })}
                onBlur={() => dispatch({ kind: 'commitCount', index })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    dispatch({ kind: 'commitCount', index })
                  }
                }}
              />
            )}
          />
        </div>
      </div>

      <div className="mt-4">
        <Field
          label="Instructions"
          render={(p) => (
            <Textarea
              id={p.id}
              aria-describedby={p['aria-describedby']}
              rows={2}
              value={draft.instructions}
              maxLength={MAX_SECTION_INSTRUCTIONS}
              disabled={disabled}
              onChange={(e) => dispatch({ kind: 'setInstructions', index, text: e.target.value })}
            />
          )}
        />
      </div>
    </li>
  )
}

/** Every test card, then Add test and the running total. */
export function SectionList({
  drafts,
  dispatch,
  onAdd,
  disabled,
}: {
  drafts: SectionDraft[]
  dispatch: (action: SectionAction) => void
  onAdd: () => void
  disabled: boolean
}) {
  const full = drafts.length >= MAX_QUIZ_SECTIONS
  const total = totalItems(drafts)
  return (
    <div>
      <ol className="space-y-3">
        {drafts.map((draft, index) => (
          <SectionCard
            key={draft.key}
            draft={draft}
            index={index}
            canRemove={drafts.length > 1}
            dispatch={dispatch}
            disabled={disabled}
          />
        ))}
      </ol>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          disabled={disabled || full}
          title={full ? `A quiz has at most ${MAX_QUIZ_SECTIONS} tests` : undefined}
          onClick={onAdd}
        >
          + Add test
        </Button>
        <p className="text-xs text-app-muted">
          {drafts.length} {drafts.length === 1 ? 'test' : 'tests'} · {total} items
        </p>
      </div>
    </div>
  )
}
```

`Field`'s render props are `{ id, invalid, 'aria-describedby' }`; `Textarea` has no `invalid` prop, which is why the instructions field passes `id` and `aria-describedby` explicitly instead of spreading. Confirm the exact render-prop type in `src/components/ui/Input.tsx` before writing it.

- [ ] **Step 5: Create `src/components/quiz/DeckQuizList.tsx`** (move `CodeChip` here from the modal, exported):

```tsx
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { DeckQuizSummary } from '@/quiz/rows'
import { quizTypeLabel, summaryType } from '@/quiz/types'

/** A share code in a monospace chip with a Copy button. Only ever rendered for Teachers. */
export function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <code className="rounded-app-sm border border-app-border bg-app-surface px-2 py-1 font-mono text-sm tracking-wider text-app-foreground">
        {code}
      </code>
      <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  )
}

/** The quizzes already made from this deck: their codes (Teachers) and PDFs. */
export function DeckQuizList({
  quizzes,
  loadError,
  isTeacher,
  pdfBusy,
  busy,
  onPdf,
}: {
  /** `null` while loading. */
  quizzes: DeckQuizSummary[] | null
  loadError: boolean
  isTeacher: boolean
  pdfBusy: string | null
  busy: boolean
  onPdf: (quizId: string) => void
}) {
  if (loadError) return <p className="text-sm text-app-muted">The quizzes from this deck couldn&apos;t be loaded.</p>
  if (quizzes === null) return <p className="text-sm text-app-muted">Loading…</p>
  if (quizzes.length === 0) {
    return <p className="text-sm text-app-muted">No quizzes from this deck yet. Make one on the Create new quiz tab.</p>
  }
  return (
    <ul className="space-y-2">
      {quizzes.map((q) => (
        <li
          key={q.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-app border border-app-border px-3 py-2 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-app-foreground">{q.title}</p>
            <p className="text-xs text-app-muted">
              {q.itemCount} questions · {q.sections.length} {q.sections.length === 1 ? 'test' : 'tests'} ·{' '}
              {quizTypeLabel(summaryType(q.sections))} · {new Date(q.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isTeacher && <CodeChip code={q.code} />}
            <Button
              variant="secondary"
              className="!px-2 !py-1 text-xs"
              loading={pdfBusy === q.id}
              disabled={pdfBusy !== null || busy}
              onClick={() => onPdf(q.id)}
            >
              PDF
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 6: Rewrite `src/components/quiz/QuizModal.tsx`** (full file):

```tsx
import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { QuizPreview } from './QuizPreview'
import { SectionList } from './SectionCard'
import { CodeChip, DeckQuizList } from './DeckQuizList'
import { QUIZ_CHAIN, generateQuizWithFallback } from '@/ai/fallbackProvider'
import { hasQuizContent, quizSlides } from '@/ai/quizPrompt'
import { AIProviderError } from '@/ai/provider'
import { buildQuestions } from '@/quiz/build'
import { createQuiz, listQuizzesForDeck, loadOwnerQuiz } from '@/quiz/api'
import type { DeckQuizSummary, OwnerQuiz } from '@/quiz/rows'
import { exportQuizPdf } from '@/quiz/pdf/quizPdf'
import { EmptySectionError, SectionFailure, generateSections, type BuiltSection } from '@/quiz/sections'
import { changesForm, newSection, sectionsReducer, toSectionRequests, type SectionAction } from '@/quiz/sectionForm'
import { headingTextOf, type Card } from '@/engine/contentBlocks'
import { describeError } from '@/store/presentationStore'
import { useAuthStore } from '@/store/authStore'

type Tab = 'create' | 'list'
type Phase = 'form' | 'generating' | 'saving' | 'done'

const TABS: { id: Tab; label: string }[] = [
  { id: 'create', label: 'Create new quiz' },
  { id: 'list', label: 'Quizzes from this deck' },
]

/** Written tests held after a failed save, so "Save again" never regenerates. */
interface Pending {
  built: BuiltSection[]
  /** Set once `create_quiz` has succeeded, so a retry only re-reads and never creates a duplicate. */
  savedId: string | null
}

interface Result {
  quiz: OwnerQuiz
  built: BuiltSection[]
}

function friendlyError(err: unknown, saving: boolean): string {
  if (err instanceof AIProviderError && err.kind === 'capacity') {
    return 'The free AI model is busy. Try again in a minute.'
  }
  const message = describeError(err)
  return saving && /create_quiz/i.test(message) ? `${message} Run migration 0016 in Supabase.` : message
}

function failureMessage(failure: SectionFailure): string {
  if (failure.cause instanceof EmptySectionError) {
    return `The AI couldn't write questions for ${failure.section.title}. Try again or add more content.`
  }
  return `${failure.section.title}: ${friendlyError(failure.cause, false)}`
}

/**
 * Makes a quiz of 1–3 tests from the open deck: one model call per test, in
 * order (`generateSections`), deterministic assembly (`buildQuestions`), one
 * `create_quiz` write for the whole quiz, then the owner's preview and PDF.
 *
 * Failure paths are kept apart on purpose. A failed *test* keeps the tests
 * before it and Try again resumes there (each test is a model call worth
 * keeping); editing the form drops them, since they no longer match it. A
 * failed *save* keeps every written test (`pending`) and offers Save again.
 * Both tab panels stay mounted, so switching tabs never cancels a run.
 */
export function QuizModal({
  presentationId,
  title,
  cards,
  onClose,
}: {
  presentationId: string
  title: string
  /** Sorted by `orderIndex`. */
  cards: Card[]
  onClose: () => void
}) {
  const isTeacher = useAuthStore((s) => s.profile?.role) === 'teacher'

  const [tab, setTab] = useState<Tab>('create')
  const [drafts, dispatch] = useReducer(sectionsReducer, undefined, () => [newSection(0, crypto.randomUUID())])
  /** Tests finished before a failure; the next Generate resumes after them. */
  const [written, setWritten] = useState<BuiltSection[]>([])
  const [progress, setProgress] = useState<number | null>(null)

  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [previous, setPrevious] = useState<DeckQuizSummary[] | null>(null)
  const [previousError, setPreviousError] = useState(false)
  const [pdfNotice, setPdfNotice] = useState<string | null>(null)
  /** A failed PDF build (shown as an alert), apart from the muted font notice above. */
  const [pdfError, setPdfError] = useState<string | null>(null)
  /** Which PDF is being built: 'result' for the one just made, else a quiz id. */
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Leaving mid-generation must stop the request, not let it finish unseen.
  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    let live = true
    listQuizzesForDeck(presentationId)
      .then((rows) => {
        if (live) setPrevious(rows)
      })
      .catch(() => {
        if (live) setPreviousError(true)
      })
    return () => {
      live = false
    }
  }, [presentationId])

  async function refreshPrevious() {
    try {
      setPrevious(await listQuizzesForDeck(presentationId))
      setPreviousError(false)
    } catch {
      // Keep what is shown.
    }
  }

  const noKey = QUIZ_CHAIN.length === 0
  const noContent = !hasQuizContent(cards)
  const busy = phase === 'generating' || phase === 'saving'

  /** A change to the form drops tests written for the old form (a blur's count commit is not a change). */
  function edit(action: SectionAction) {
    dispatch(action)
    if (changesForm(action)) setWritten([])
  }

  function addTest() {
    edit({ kind: 'add', key: crypto.randomUUID() })
  }

  async function save(p: Pending) {
    setPhase('saving')
    setError(null)
    setPending(null)
    let savedId = p.savedId
    try {
      if (savedId === null) {
        const created = await createQuiz({
          presentationId,
          title: `${title} — quiz`,
          deckTitle: title,
          sections: p.built.map((b) => ({ section: b.section, questions: b.questions })),
        })
        savedId = created.id
      }
      const quiz = await loadOwnerQuiz(savedId)
      setResult({ quiz, built: p.built })
      setPhase('done')
      void refreshPrevious()
    } catch (err) {
      setError(friendlyError(err, true))
      setPending({ ...p, savedId })
      setPhase('form')
    }
  }

  async function generate() {
    dispatch({ kind: 'commitAll' })
    const requests = toSectionRequests(drafts)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller
    const seed = crypto.randomUUID()
    const slides = quizSlides(cards)
    const cardRefs = cards.map((c, i) => ({ id: c.id, heading: headingTextOf(c, i) }))

    setError(null)
    setPdfNotice(null)
    setPdfError(null)
    setPending(null)
    setPhase('generating')

    let built: BuiltSection[]
    try {
      built = await generateSections({
        requests,
        written,
        signal,
        onProgress: setProgress,
        write: async (request, index, avoid) => {
          const response = await generateQuizWithFallback(
            QUIZ_CHAIN,
            { title, slides, count: request.count, config: request.section.config, avoid },
            signal,
          )
          return buildQuestions({
            response,
            config: request.section.config,
            count: request.count,
            cards: cardRefs,
            seed: `${seed}:${index}`,
          })
        },
      })
    } catch (err) {
      setProgress(null)
      if (signal.aborted) {
        // A cancel is the user's own act: back to the form, nothing kept, no message.
        setWritten([])
      } else if (err instanceof SectionFailure) {
        setWritten(err.written)
        setError(failureMessage(err))
      } else {
        setError(friendlyError(err, false))
      }
      setPhase('form')
      return
    }

    setProgress(null)
    setWritten([])
    await save({ built, savedId: null })
  }

  async function downloadPdf(key: string, load: () => Promise<OwnerQuiz>) {
    setPdfBusy(key)
    setPdfNotice(null)
    setPdfError(null)
    try {
      const { unicodeFont } = await exportQuizPdf(await load())
      if (!unicodeFont) {
        setPdfNotice("The accent-safe font couldn't be loaded, so accented characters may not appear.")
      }
    } catch (err) {
      setPdfError(`Couldn't build the PDF: ${describeError(err)}`)
    } finally {
      setPdfBusy(null)
    }
  }

  function makeAnother() {
    setResult(null)
    setError(null)
    setPdfNotice(null)
    setPdfError(null)
    setPhase('form')
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const at = TABS.findIndex((t) => t.id === tab)
    const next = (at + step + TABS.length) % TABS.length
    setTab(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  const notices = (
    <>
      {pdfNotice && (
        <p role="status" className="mt-3 text-xs text-app-muted">
          {pdfNotice}
        </p>
      )}
      {pdfError && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {pdfError}
        </p>
      )}
    </>
  )

  function createPanel() {
    if (phase === 'done' && result) {
      const { quiz, built } = result
      const short = built.filter((b) => b.shortfall > 0)
      return (
        <div>
          <h3 className="text-base font-semibold text-app-foreground">Quiz ready</h3>
          {short.map((b) => (
            <p key={b.section.title} className="mt-1 text-sm text-app-muted">
              {b.section.title}: generated {b.questions.length} of {b.requested} — the deck didn&apos;t have enough
              material for more.
            </p>
          ))}

          <div className="mt-3">
            <QuizPreview quiz={quiz} />
          </div>

          <div className="mt-4 text-sm">
            {isTeacher ? (
              <div className="space-y-2">
                <CodeChip code={quiz.code} />
                <p className="text-xs text-app-muted">
                  Post it to a class from{' '}
                  <Link
                    to="/classroom/quizzes"
                    className="rounded-app-sm text-app-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                  >
                    Quizzes
                  </Link>{' '}
                  to let students answer.
                </p>
              </div>
            ) : (
              <p className="text-xs text-app-muted">Sharing needs a Teacher account.</p>
            )}
          </div>

          {notices}

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={makeAnother}>
              Make another
            </Button>
            <Button
              variant="primary"
              loading={pdfBusy === 'result'}
              disabled={pdfBusy !== null}
              onClick={() => void downloadPdf('result', () => Promise.resolve(quiz))}
            >
              Download PDF
            </Button>
          </div>
        </div>
      )
    }

    if (pending) {
      const count = pending.built.reduce((n, b) => n + b.questions.length, 0)
      return (
        <div>
          <p className="text-sm text-app-muted">
            {pending.savedId !== null
              ? `Your quiz was saved, but it couldn't be loaded just now.`
              : `${count} questions are written. They just haven't been saved yet.`}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                // A quiz that did save should show up in the list even if we can't open it now.
                if (pending.savedId !== null) void refreshPrevious()
                setError(null)
                setPending(null)
              }}
            >
              Discard
            </Button>
            <Button variant="primary" onClick={() => void save(pending)}>
              {pending.savedId !== null ? 'Try loading again' : 'Save again'}
            </Button>
          </div>
        </div>
      )
    }

    const resuming = written.length > 0
    return (
      <div>
        <p className="mb-4 text-sm text-app-muted">
          Questions are written once from your slides and saved. Each test is written separately; the answer key is for
          you, and students see only the questions.
        </p>

        <SectionList drafts={drafts} dispatch={edit} onAdd={addTest} disabled={busy} />

        {noKey && <p className="mt-4 text-xs text-app-muted">Quiz generation needs VITE_GROQ_API_KEY.</p>}
        {!noKey && noContent && <p className="mt-4 text-xs text-app-muted">Add some slide content first.</p>}
        {phase === 'generating' && progress !== null && (
          <p role="status" className="mt-4 text-sm text-app-muted">
            Writing {drafts[progress]?.title.trim() || `Test ${progress + 1}`} ({progress + 1} of {drafts.length})…
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {resuming && phase === 'form' && (
          <p className="mt-2 text-xs text-app-muted">
            {written.length === 1 ? 'The first test is' : `The first ${written.length} tests are`} written; Try again
            continues from the next one. Changing the form starts over.
          </p>
        )}
        {notices}

        <div className="mt-6 flex items-center justify-end gap-2">
          {phase === 'generating' && (
            <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          )}
          <Button
            variant="primary"
            loading={busy}
            disabled={busy || noKey || noContent}
            onClick={() => void generate()}
          >
            {resuming ? 'Try again' : 'Generate'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Modal title="Generate a quiz" maxWidth="max-w-3xl" onClose={onClose}>
      <div role="tablist" aria-label="Quiz" onKeyDown={onTabKeyDown} className="mb-5 flex gap-1 border-b border-app-border">
        {TABS.map((t, i) => {
          const selected = tab === t.id
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`quiz-tab-${t.id}`}
              aria-controls={`quiz-panel-${t.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
                selected
                  ? 'border-app-accent text-app-foreground'
                  : 'border-transparent text-app-muted hover:text-app-foreground'
              }`}
            >
              {t.label}
              {t.id === 'list' && previous && previous.length > 0 && (
                <span className="ml-1.5 rounded-full bg-app-surface px-1.5 py-0.5 text-xs text-app-muted">
                  {previous.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id="quiz-panel-create" aria-labelledby="quiz-tab-create" hidden={tab !== 'create'}>
        {createPanel()}
      </div>
      <div role="tabpanel" id="quiz-panel-list" aria-labelledby="quiz-tab-list" hidden={tab !== 'list'}>
        <DeckQuizList
          quizzes={previous}
          loadError={previousError}
          isTeacher={isTeacher}
          pdfBusy={pdfBusy}
          busy={busy}
          onPdf={(id) => void downloadPdf(id, () => loadOwnerQuiz(id))}
        />
        {tab === 'list' && notices}
      </div>
    </Modal>
  )
}
```

Notes for the implementer:
- `generate()` dispatches `commitAll` *and* computes `toSectionRequests(drafts)` from the current render's `drafts`; `toSectionRequests` already uses `committedCount` (typed text), so both agree. Do **not** route `commitAll` through `edit` — that would drop `written` and break resume.
- `notices` renders in whichever panel is visible; the create panel includes it, the list panel only when it's the active tab (both are mounted).
- `QuizPreview`'s `max-h-96` is fine inside the wider modal.

- [ ] **Step 7: Run** `npx vitest run src/components/quiz` → PASS. Then `npm run test`, `npm run lint`, `npm run build` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/quiz
git commit -m "feat(quiz): wider modal with tabs and up to three tests per quiz

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: CLAUDE.md and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md.**

In the **Testing** section's component-test list, add after the `OverlayLayer.test.tsx` mention: "`components/quiz/QuizModal.test.tsx` (the modal opens wide on the Create tab beside Quizzes from this deck; Add test disabled at three; no remove with one test; the deck list's empty state and Mixed label) is the same kind."

In the **Testing** RLS bullet, add `supabase/tests/0016_quiz_sections.sql` (never run).

In **Persistence**, after the `0015` bullet add:

"- `0016` quiz test sections: `quiz_questions.section_index`/`question_type` (backfilled; a trigger fills `question_type` from the quiz for inserts that omit it), `quizzes.quiz_type` may be `'mixed'`, `create_quiz` now takes `p_sections` (the 0012 six-argument version is dropped), and taking/scoring are per question type with `word_boxes` per test. Does **not** gate card writes or the classroom list reads; **gates quiz saving, taking, submitting and the owner's preview/PDF** (`OWNER_QUESTION_COLUMNS` selects the new columns). `supabase/tests/0016_quiz_sections.sql` is hand-run and **has not been run**; after 0016, `0012_quiz_rls.sql`'s `create_quiz`/`word_box` checks no longer apply."

In **Quizzes**, replace the first paragraph's type description ("multiple choice (A–C/A–D), fill in the blank (optional word box), true/false (`TRUE/FALSE` or `T/F`), 1–20 items (`MAX_QUIZ_ITEMS`), one type per quiz") with: "a quiz is **1–3 tests** (`MAX_QUIZ_SECTIONS`), each with its own type — multiple choice (A–C/A–D), fill in the blank (optional word box), true/false (`TRUE/FALSE` or `T/F`) — 1–20 items (`MAX_QUIZ_ITEMS`, per test), and an editable title and instructions (spec `2026-10-01-quiz-test-sections-design.md`). The modal is wide with two tabs, Create new quiz and Quizzes from this deck (both stay mounted, so a tab switch never cancels)." Then add these bullets:

"- **One model call per test, in order** (`quiz/sections.ts` `generateSections`, pure, tested): each later call is told the prompts already asked (`avoidList`, capped at 40 prompts / 2,000 characters for Groq's window). A failed test keeps the tests before it and **Try again resumes at the failed one**; any form edit (the modal's `edit` wrapper) drops them; cancel drops them silently. A test with zero valid questions is a failure of that test (`EmptySectionError`). The whole quiz is saved in **one** `create_quiz` call. Three calls back to back can meet a saturated TPM window; the shared retry absorbs it, so a 3-test quiz can take over a minute.
- **Tests are stored inside the quiz**: `settings.sections` (title, instructions, type, sub-option) and per-question `section_index`/`question_type`. `fromDbSections` reads a pre-0016 quiz as one test titled "Test 1" with its type's default instructions; every reader groups with `groupBySection` (`quiz/rows.ts`) and **numbering restarts in each test** (preview, PDF sheet and key, taking page, result review — whose right/wrong marks are looked up by global position). The form is a pure reducer (`quiz/sectionForm.ts`): default titles follow position until typed, instructions follow the type until edited, a blank title saves as the default."

Also change "Saving a generated quiz fails with "Run migration 0012 in Supabase."" to say "0016".

- [ ] **Step 2: Final verification**

Run: `npm run test` → all PASS. `npm run lint` → clean. `npm run build` → PASS. Then `git status` → only expected files.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): quiz test sections and migration 0016

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
