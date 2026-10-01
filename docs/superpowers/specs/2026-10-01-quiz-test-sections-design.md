# Quiz test sections (mixed-type quizzes) — design

Date: 2026-10-01. Builds on `2026-09-24-quiz-generator-design.md`; everything there still holds unless this document says otherwise.

## Goal

A teacher can build one quiz out of several **tests** ("Test 1 … Test 2 … Test 3"), each with its own question type, sub-option, item count, title and instructions. The quiz modal becomes wider and gains two tabs: **Create new quiz** and **Quizzes from this deck**.

### Agreed with the user

- At most **3 tests** per quiz; each test has **1–20 items** (`MAX_QUIZ_ITEMS` now means *per test*). A quiz therefore has 1–60 questions.
- Two tests may share a type (Test 1 and Test 3 both multiple choice).
- Each test has an **editable title and instructions**.
- **Numbering restarts at 1 in each test**, on the taking page, the owner preview and the PDF (sheet and key).
- If generation of one test fails, the tests already written are kept and **Try again resumes from the failed test**.
- Migration 0012 is applied; this work adds **migration 0016** and never edits 0012.

### Non-goals

- Reordering tests after creation, editing a saved quiz, regenerating one test of a saved quiz (a new quiz is a new generation — unchanged rule).
- Per-test scores. A quiz still has one score per attempt (correct / total over all tests); `classroom/stats.ts` is unchanged.
- Changing the provider chain. Quizzes stay on the free `QUIZ_CHAIN` (Groq only).

## Data model

### Client (`src/quiz/types.ts`)

```ts
export const MAX_QUIZ_SECTIONS = 3
export const MAX_SECTION_TITLE = 80
export const MAX_SECTION_INSTRUCTIONS = 300

/** One test of a quiz: its type/sub-option plus what the student reads above it. */
export interface QuizSection {
  config: QuizConfig        // existing union: type + its one sub-option
  title: string             // trimmed, non-empty, ≤ MAX_SECTION_TITLE
  instructions: string      // trimmed, may be empty, ≤ MAX_SECTION_INSTRUCTIONS
}
```

- `defaultSectionTitle(index)` → `"Test 1"`, `"Test 2"`, …
- `defaultInstructions(config)` → the per-type sentence currently hard-coded in `quizPdfLayout.ts` `instruction()` (moved here so the modal, taking page and PDF share it).
- `toDbSections(sections)` / `fromDbSections(quizType, settings)` replace `toDbConfig`/`fromDbConfig` for whole quizzes. `fromDbSections` returns **one synthetic section** (`title: "Test 1"`, `instructions: defaultInstructions(config)`, config from the legacy `quiz_type` + `settings`) when `settings.sections` is missing or unreadable, so every quiz saved before 0016 reads as a one-test quiz. A malformed entry in `settings.sections` falls back per field (unknown type → multiple choice, blank title → default title), never throws.
- `quizTypeLabel(sections)` → the type's label when every section shares one type, else `"Mixed"`.
- `QuizQuestionDraft` gains `sectionIndex: number`. `OwnerQuestion` and `TakeQuestion` gain `sectionIndex` and `type: QuizType`.
- `OwnerQuiz`, `TakeQuiz`, `DeckQuizSummary` replace `config: QuizConfig` with `sections: QuizSection[]`. `TakeQuiz.wordBox` becomes `wordBoxes: Record<number, string[]>` (section index → words; only fill-blank sections with the word box on).

### Database (migration `0016_quiz_sections.sql`)

- `quiz_questions.section_index int not null default 0 check (section_index between 0 and 2)`.
- `quiz_questions.question_type text` — backfilled from the owning quiz's `quiz_type`, then `set not null` and `check (question_type in ('multiple_choice','fill_blank','true_false'))`.
- `quizzes.quiz_type` check widened to also allow `'mixed'` (drop and re-add the named constraint; find its generated name via `pg_constraint` in a `do` block). The column stays a summary for lists: the shared type, or `'mixed'`.
- `quizzes.settings` for new quizzes: `{"sections":[{"title":"Test 1","instructions":"…","type":"multiple_choice","choiceCount":4}, …]}` — each entry is the old per-type settings plus `title`, `instructions`, `type`. Legacy quizzes keep their old settings untouched.
- `assert_quiz_question(p_type, q)` is unchanged and is called per question with **its section's** type.
- `create_quiz` (old six-argument signature) is **dropped** and replaced by
  `create_quiz(p_presentation_id uuid, p_title text, p_deck_title text, p_sections jsonb)`:
  - `p_sections` is an array of 1–3 objects `{title, instructions, type, settings, questions}`; each `questions` array has 1–20 entries; type must be one of the three; title non-blank (≤80), instructions ≤300.
  - Keeps every 0012 property: `security invoker`, id and code chosen up front, **no `INSERT … RETURNING`** (see the 0012 comment), atomic.
  - Writes `quizzes.quiz_type` = the shared type or `'mixed'`, `settings = {"sections": [...]}` (title/instructions/type plus the section's `settings` object merged), and one `quiz_questions` row per question with `section_index`, `question_type`, `order_index` running **across the whole quiz** (0…n-1, so ordering stays one sort), `choices` only for multiple-choice questions.
  - Grants: revoke from public/anon, grant to authenticated (as 0012).
- `get_quiz_for_taking`: each question object gains `section_index` and `question_type` (still never `answer`); `word_box` is replaced by `word_boxes`, an object keyed by section index (as text) holding the stably-shuffled distinct answers of that section's questions, present only for fill-blank sections whose `settings.sections[i].wordBox` is JSON `true`. For a legacy quiz (no `settings.sections`) the old rule applies to section `"0"` (`quiz_type = 'fill_blank'` and `settings->'wordBox' = 'true'::jsonb`). JSON comparison, never casts (client-supplied settings must not break taking).
- `submit_quiz_attempt`: branches on `qq.question_type` instead of `quiz.quiz_type`. Everything else (membership, posted, one attempt, server scoring, `results` in question order) unchanged.
- `supabase/tests/0016_quiz_sections.sql`: hand-run checks — a mixed quiz saves; 4 sections / 21 questions in a section / a question shaped for the wrong section type are refused; legacy rows got `question_type` and `section_index 0`; taking returns no answers and per-section word boxes; scoring is per question type; a student still cannot read `quiz_questions`. Written, **not run** by this work (no database here), and CLAUDE.md says so.

### Gating

0016 **gates quiz saving, taking and submitting** (the new `create_quiz` signature, `question_type`). It does **not** gate the classroom pages' reads: `QUIZ_COLUMNS`/`STUDENT_QUIZ_COLUMNS` select no new column and keep reading `quiz_type`, which may now be `'mixed'`. The owner's quiz reads (`OWNER_QUESTION_COLUMNS`) do select `section_index`, `question_type`, so the preview and PDF need 0016. A save on a database without 0016 fails with "Run migration 0016 in Supabase." (`friendlyError` matches `create_quiz`, same pattern as 0012). Does not gate card writes.

## Generation

- One model call **per test**, run in order, through the existing `generateQuizWithFallback(QUIZ_CHAIN, request, signal)` (capacity-only failover, cancel never hands off — unchanged code path). `QuizRequest` gains `avoid: string[]`: the prompts already written by earlier tests of this quiz. `buildQuizUserPrompt` adds, when non-empty, an `ALREADY ASKED` list ("do not ask these again or reword them") capped at the most recent ~40 prompts and ~2,000 characters total, so the input stays inside Groq's TPM window. `quizMaxTokens(count)` is per call and unchanged.
- `buildQuestions` runs per test with that test's config and stamps `sectionIndex`; the shuffle seed is per test (`${seed}:${sectionIndex}`). Shortfall is per test.
- A test that yields **zero** valid questions is a failure of that test (message: "The AI couldn't write questions for Test N. Try again or add more content.").
- **Resume:** the modal keeps `written: BuiltSection[]` for the run. On a non-cancel failure in test N, tests 1…N-1 stay in `written`, the error is shown, and the primary button reads **Try again** and continues from test N. Changing the form (any test's settings) discards `written` (the kept tests no longer match the form). Cancel discards `written` and returns to the form silently (same as today).
- Rate limit: three sequential calls can meet a saturated 8,000 TPM window; the existing retry/backoff (`Retry-After` honoured, ≤20s per wait) absorbs it, so a 3-test quiz may take over a minute. Progress text: "Writing Test 2 of 3…".
- After all tests are written, **one** `create_quiz` call saves the whole quiz. The existing failed-save handling (`pending` with Save again / Try loading again, never regenerating, `savedId` to avoid duplicates) applies unchanged to the whole quiz.

The pure orchestration (which test to run next, merging results, resume index, avoid-list assembly) lives in a new `src/quiz/sections.ts` so it is testable without React.

## Modal (`components/quiz/QuizModal.tsx`)

- `Modal maxWidth="max-w-3xl"`.
- A tab row (`role="tablist"`, two `role="tab"` buttons, arrow-key movement, app-chrome styling like the existing chips): **Create new quiz** (default) and **Quizzes from this deck** (with a count badge once loaded). Both panels stay mounted (`hidden`), so switching tabs never aborts a generation.
- **Create panel:** a list of test cards, then **+ Add test** (disabled at 3, tooltip says why). Each card:
  - Header: the title field (default `Test N`) and a remove button (hidden when only one test).
  - Type chips (existing `Radios`), the type's sub-option chips, an Items field (1–20, existing `parseCount`/commit-on-blur behaviour).
  - Instructions textarea, prefilled with `defaultInstructions(config)`. While the user hasn't edited it (`instructionsEdited: false`), changing type or sub-option updates it; once edited it is left alone.
  - Removing a test renumbers *default* titles of later tests (a title the user edited is kept).
  - A footer line shows the total ("3 tests · 35 items").
  - Everything is disabled while busy. Generate, Cancel, error and notices sit below the cards as today.
- **Quizzes from this deck panel:** the current previous-quizzes list (title, item count, `quizTypeLabel`, date, code chip for Teachers, PDF button), plus an empty state ("No quizzes from this deck yet") and a load error state.
- After a successful save the modal shows the existing "Quiz ready" view (preview grouped by test, code, Download PDF, Make another); the deck list is refreshed.
- Form state lives in a small pure reducer in `src/quiz/sectionForm.ts` (add, remove, set type, set sub-option, set count, set title, set instructions, renumber defaults) so the rules above are unit-tested.

## Reading surfaces

- **`QuizPreview`** (owner): questions grouped under each test's title and instructions; numbering restarts per test; answers shown per question type.
- **`QuizPage`** (student): one block per test — heading (title), instructions, that test's word box if any, then its questions numbered from 1. `QuestionField` takes the question's own `type` and its section's config (for choice letters / T/F notation). Progress and "answer everything" rules (`taking.ts`) are unchanged — they are per question.
- **PDF** (`quizPdfLayout.ts`): after the quiz title/name line, each test emits a `heading` item (title), an `instruction` item (its instructions, if non-empty), its word box (fill-blank with word box), then its questions numbered from 1. The key repeats each test title as a `heading` followed by its key lines. The "no trailing spacer" rule still holds (spacers only *between* items). `keepWithNext` on a test heading keeps it with its instructions.
- **Lists** (`DeckQuizSummary`, classroom `QuizRow`/`StudentQuizRow`): the type label becomes `quizTypeLabel`; `classroom/rows.ts` maps `quiz_type = 'mixed'` to a `'mixed'` label instead of falling back to multiple choice. `QUIZ_TYPE_LABELS` gains nothing; the classroom summary type widens to `QuizType | 'mixed'`.

## Error handling summary

| Situation | Behaviour |
|---|---|
| Test N generation fails (capacity, response, etc.) | Error shown; tests before N kept; **Try again** resumes at N |
| Test N returns no valid questions | Same as above, with the "couldn't write questions for Test N" message |
| User cancels | Abort, discard written tests, back to form, no message |
| User edits the form after a partial failure | Kept tests discarded; next Generate starts at Test 1 |
| Save fails | Existing pending/Save again path for the whole quiz |
| DB lacks 0016 | Save fails with "Run migration 0016 in Supabase." |
| Legacy quiz opened | Reads as one test titled "Test 1" with default instructions |

## Testing

Pure Vitest, colocated:

- `quiz/types.test.ts`: `toDbSections`/`fromDbSections` round-trip, legacy fallback, malformed entries, `quizTypeLabel`, `defaultInstructions`.
- `quiz/sectionForm.test.ts`: add up to 3, remove (never the last), default-title renumbering vs edited titles, instructions follow type until edited, count clamp 1–20.
- `quiz/sections.test.ts`: resume index, merging per-test results, avoid-list capping, `sectionIndex` stamping.
- `ai/quizPrompt.test.ts`: the ALREADY ASKED block appears only when non-empty and respects its caps.
- `quiz/build.test.ts`: `sectionIndex` on output, per-test seed.
- `quiz/rows.test.ts`: owner/take/deck mapping with sections, `word_boxes`, legacy rows.
- `quiz/pdf/quizPdfLayout.test.ts`: multiple tests, numbering restarts, per-test word box and key headings, no trailing spacer.
- `api` question JSON: `create_quiz` payload shape (`p_sections` with nested questions) pinned like `questionJson.test.ts`.
- `components/quiz/QuizModal.test.tsx` (render smoke, like the other component exceptions): both tabs present, Create selected by default, one test card initially, Add test disabled at three, no remove button with a single test.
- `supabase/tests/0016_quiz_sections.sql`: hand-run, not executed by this work.

## Docs

Update CLAUDE.md's Quizzes section (tests/sections, per-test cap, 0016 gating and its unrun SQL test, resume rule) and the Persistence migration list.
