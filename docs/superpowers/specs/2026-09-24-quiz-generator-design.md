# Quiz generator

A **Quiz** button in the editor opens a modal that turns a deck into a quiz. The quiz gets a share code; students in a class the quiz is posted to answer it, and their scores reach the teacher dashboard that already exists. The deck's owner can export the quiz (with an answer key) as a PDF.

This fills in the piece `2026-09-14-teacher-classroom-design.md` deferred ("quiz generation, taking quizzes, and posting quizzes are out of scope"). The tables and RLS for it already exist (migration 0009); this spec adds generation, taking, posting and the PDF, and one migration (0012).

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| What is "quiz type"? | Multiple choice (choices A–C or A–D), Fill in the blank (with or without a **word box**), True/False (notation `TRUE/FALSE` or `T/F`). One type per quiz. |
| Item count | 1–20 (`MAX_QUIZ_ITEMS = 20`). |
| Model | **Groq only** (free). `openai/gpt-oss-120b`, then `groq/compound`. Never Anthropic (billed) or Gemini. |
| Who answers | Logged-in students who are in a class the quiz is posted to. No guests, no anonymous taking. |
| Who can generate | Any deck owner. Sharing, posting and results need a **Teacher** account (a General account has no classes, and account type is permanent). |
| Attaching to a class | Generate first, **post later** from the Quizzes page. |
| Non-member with a code | Refused with "join the class first". The code does **not** auto-join a class. |
| Word box | A bank of the answers listed above the blanks. |
| PDF | Owner only, with an answer key. |

## Non-goals

Retakes (one attempt per student per class, already enforced), due dates, timers, showing correct answers to students after submitting, editing a generated quiz's questions, regenerating a quiz in place (generate a new one), anonymous taking, mixed-type quizzes. (A student-side list of posted quizzes was first listed here as a non-goal and was added afterwards, once it was clear students expect to see a posted quiz in their class — see §5.)

The **generate-once rule** in CLAUDE.md is about a deck's cards. A quiz is a separate artifact that never touches `cards`; it is not precedent for a "regenerate this slide" button, same as narration.

## 1. The editor: button and modal

- `TopBar` gets an `onQuiz` prop and a secondary **Quiz** button beside Export/Narrate. `EditorPage` owns the modal's open state.
- The button is disabled, with a tooltip, when the deck has no card text ("Add some slide content first") or when `QUIZ_CHAIN` is empty ("Quiz generation needs `VITE_GROQ_API_KEY`").
- `components/quiz/QuizModal.tsx` (same modal chrome as `ConfirmReplaceModal`/`GenerateScriptsModal`). Controls:
  - **Items**: a number field, 1–20, committed on Enter/blur and clamped, like `PercentField`.
  - **Type**: a segmented control (`Segmented`) of the three types. Choosing one reveals its one sub-option:
    - Multiple choice → *Choices per question*: A–C / A–D.
    - Fill in the blank → *Word box*: Off / On.
    - True or False → *Answer style*: TRUE/FALSE / T/F.
  - **Generate**. Owns an `AbortController`, aborted on close/unmount, honoured in both `fetch` and backoff `sleep`. Cancel returns to the form, not an error.
- After success the modal shows a **preview** (numbered questions with the answers marked) and, for the owner, **Download PDF**. For a Teacher it also shows the **share code** with a copy button and the line "Post it to a class from Quizzes to let students answer." A General account sees no code and "Sharing needs a Teacher account."
- Below the form: **Quizzes from this deck** (title, type, item count, date), each with its PDF button and, for teachers, its code. This is how a General owner gets the PDF again later, since the Quizzes page is teacher-only.

## 2. Generation

### Provider

Only `GroqProvider` implements quiz generation, so it is **not** added to `AIProvider` (that would force stubs on the Anthropic and Gemini providers). Instead, `provider.ts` gains:

```ts
export interface QuizProvider {
  generateQuiz(input: QuizRequest, signal?: AbortSignal): Promise<QuizResponse>
}
```

`fallbackProvider.ts` extracts the failover loop from `FallbackProvider.run` into an exported `runWithFailover(chain, label, call, signal)` (the class delegates to it; behaviour and existing tests unchanged), and exports:

```ts
export const QUIZ_CHAIN: NamedQuizProvider[]  // Groq gpt-oss-120b, then Groq groq/compound; empty without VITE_GROQ_API_KEY
```

The invariants carry over unchanged: **only `capacity` failures hand off**, cancellation never does, every call honours the signal. A failover test mutation-checks this for the quiz path too.

### Prompt (`ai/quizPrompt.ts`)

- The user prompt carries the deck title and each slide's `{slide, heading, lines}`, reusing `contentLines`. Per-slide text is truncated (600 characters) and the total is capped (about 6,000 characters), because Groq's 8,000 TPM window counts input and requested output together.
- The system prompt: write exactly `count` questions from the slides and **nothing outside them**; every question cites the `slide` it came from; return fewer only if the deck cannot support that many distinct questions.
- Type rules:
  - **Multiple choice**: exactly `choiceCount` choices, exactly one correct, plausible distractors from the same slides, never "all/none of the above".
  - **Fill in the blank**: one blank written as `_____`; the answer is a term stated on the slide, one to three words; up to three accepted alternates (spelling variants, abbreviations).
  - **True/False**: a statement, about half true and half false; false ones must be plausible.
- JSON mode, `temperature` 0.7. Budget `quizMaxTokens(n) = clamp(n*110 + 3800, 5200, 7000)`: the 5,200 floor clears `gpt-oss-120b`'s ~3,400 reasoning tokens, and 7,000 is Groq's ceiling. Same reasoning as `narrationMaxTokens`.
- Validated with zod (`quiz/schema.ts`), extracted with `extractJsonObject`, one retry that sends the exact zod errors, then `AIProviderError` (`response`).

### After the model (pure, `quiz/build.ts`)

The model is not trusted for anything structural:

- Drops questions whose `slide` is out of range (a false citation is worse than a missing question), or whose shape doesn't match the requested type (wrong choice count, answer index out of range).
- Trims to `count`. Fewer than `count` is accepted and reported: "Generated 14 of 20 — the deck didn't have enough material for more."
- **Shuffles multiple-choice choices client-side**, carrying the correct index with them (models bias the answer position), using a seeded shuffle so it is testable.
- Maps `slide` → `card_id` and `slide_heading`.
- Word box: not stored. It is derived at display time (below).

## 3. Storage (migration 0012)

`quizzes` gains:

| Column | Type | Notes |
|---|---|---|
| `code` | `text unique not null default generate_quiz_code()` | 8 characters, same alphabet as `generate_join_code` (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), regenerated until unused. Kept in `quiz/quizCode.ts` in step with the SQL, like `joinCode.ts`. |
| `quiz_type` | `text not null check (in ('multiple_choice','fill_blank','true_false'))` | |
| `settings` | `jsonb not null default '{}'` | `{choiceCount: 3\|4}`, `{wordBox: bool}`, `{notation: 'word'\|'letter'}`. Presentation only; scoring ignores it. |

Existing rows (none are written today) backfill `quiz_type` to `'multiple_choice'`.

`quiz_questions` is unchanged. Encoding:

| Type | `choices` | `answer` |
|---|---|---|
| multiple choice | array of 3–4 strings | index (number) |
| fill in the blank | `[]` | `{ "text": "...", "accepted": ["..."] }`; the prompt contains `_____` |
| true/false | `[]` | `true` / `false` |

`quiz_questions` stays **owner-only under RLS**. That is what makes the answer key, and therefore the PDF, owner-only: no path except the owner's own read returns answers, and the RPCs below never return them.

### RPCs

- **`create_quiz(p_presentation_id, p_title, p_deck_title, p_quiz_type, p_settings, p_questions jsonb)`** — `security invoker`, so RLS applies. One transaction (the client has no other way to make quiz + questions atomic). Verifies the caller can see the presentation (RLS on `presentations`), validates 1–20 questions and that each question's shape matches the type (a tampered client cannot store garbage), inserts both, returns `{id, code}`. It works for any account type; `quizzes_insert` already only requires `teacher_id = auth.uid()`.
- **`get_quiz_for_taking(p_code)`** — `security definer`. Returns `{ id, title, deck_title, quiz_type, settings, classes: [{id, name, attempted}], questions: [{id, order_index, slide_number, prompt, choices}], word_box }`. **Never** returns answers.
  - Refuses with sentences meant for the user: not logged in; no quiz with that code; not posted to any class ("This quiz isn't available yet."); the caller isn't a member of any class it is posted to ("This quiz is posted to a class you haven't joined. Join the class with its class code first.").
  - `classes` is only the caller's classes the quiz is posted to.
  - `word_box` (when `settings.wordBox`) is every fill-in answer, de-duplicated and shuffled with a stable order (`md5(question id)`), so it is the same on every load and reveals the set but not which blank each fills.
- **`submit_quiz_attempt(p_code, p_class_id, p_answers jsonb)`** — `security definer`. Requires membership of `p_class_id` and that the quiz is posted there. **Scores on the server**, so a client can never write its own score:
  - multiple choice: chosen index equals the answer;
  - true/false: boolean equals the answer;
  - fill in the blank: lower-case, trim, collapse whitespace and strip punctuation on both sides, then match `text` or any `accepted`.
  - Writes one `quiz_attempts` row with `score = correct / total` (already `0..1`). The existing `unique (quiz_id, class_id, student_id)` refuses a second attempt; the RPC turns that into "You've already submitted this quiz for this class."
  - Returns `{ score, correct, total, results: [bool] }`: which were right, not the correct answers.
- All three `revoke execute ... from public, anon` and `grant ... to authenticated`, like `join_class`.

Posting uses what already exists: `quiz_classes` insert requires `is_class_teacher(class_id) and owns_quiz(quiz_id)`.

No RLS policy selects from another RLS table (the classroom invariant), so nothing new joins tables inside a policy; the RPCs do the cross-table work as `security definer`.

## 4. Client I/O and the Quizzes page

- `quiz/api.ts` (pages never build a query, same rule as `classroom/api.ts`, and the same conventions: `many`, `changed`, `rpcValue`, refusals rethrown as bare `Error`s). `classroom/api.ts` exports its `db`/`many`/`changed`/`rpcValue` helpers for it. Functions: `createQuiz`, `listQuizzesForDeck`, `loadOwnerQuiz(quizId)` (questions with answers, for preview/PDF), `postQuiz(quizId, classId)`, `unpostQuiz`, `getQuizForTaking(code)`, `submitQuizAttempt`.
- **Quizzes page** (`QuizzesPage`/`QuizRow`): each row shows the quiz's **code** (copy) and **link** (copy), and gets a **Post to class** menu (the teacher's classes not yet posted to) and an unpost action on each posted-class chip. Posting invalidates the page's `useAsync` load; no optimistic update.
- `classroom/stats.ts` needs **no change**: it already computes from `attempts`, so a submitted quiz appears in the dashboard's completion, average and trend.

## 5. Taking a quiz

- Route `/quiz/:code` under `RequireAuth` (`QuizPage`). Students arrive by link, by typing a code into a small **Have a quiz code?** field on `MyClassesPage` (the existing joiner page), or from a **Quizzes panel on the class page** (`StudentClassPage`): every quiz posted to that class, newest posting first, each with **Take quiz**, or "Submitted · score" once the student has an attempt for that class. The panel reads only what RLS already allows a member (`quizzes`, `quiz_classes`, their own `quiz_attempts`) and shows no question count, because `quiz_questions` is owner-only and a student's embed of it is empty. No SQL change.
- The page calls `getQuizForTaking`. A refusal shows the RPC's sentence with a link to `/classes` (where the class code is entered). A student in several eligible classes picks which one (default: the first not yet attempted).
- Renders by type: radios labelled A–C/A–D; a text input per blank, with the word box above when on; TRUE/FALSE or T/F buttons. Submit is disabled until every question is answered; a second confirm is not needed (one attempt is stated up front).
- After submitting: the score and a per-question right/wrong list. No correct answers are shown.

## 6. PDF export (owner only)

- Dependency: `jspdf`, loaded by **dynamic `import()`** at export time so it never enters the main bundle.
- Text is Unicode-safe: jsPDF's built-in fonts cover only Latin-1, and decks are written in any language, so `quizPdf.ts` fetches a bundled OFL font (Noto Sans regular + bold, in `public/fonts/`) and registers it with `addFileToVFS`/`addFont`. If the fetch fails the export falls back to Helvetica and says accented text may not render.
- Layout: pure `quiz/pdf/quizPdfLayout.ts` (line wrapping against measured widths, pagination, no orphaned question numbers) and thin `quiz/pdf/quizPdf.ts` (drawing). Page 1 onwards: title, deck title, "Name ____ Date ____", one instruction line for the type, the word box (bordered) if on, then the numbered questions (choices lettered A–C/A–D, a TRUE/FALSE or T/F answer line, or a blank line). A new page holds the **Answer key**.
- The button appears only where the answers were loaded through the owner's own `quiz_questions` read. A student session has no answers to put in a PDF, so this is enforced by the data, not only by the UI.

## 7. Errors

- **No Groq key**: Quiz button disabled with the reason.
- **Capacity (429/503/413)** on the first Groq link falls to `groq/compound`; if both are out: "The free AI model is busy. Try again in a minute."
- **Unparseable after the retry**: "The AI returned a quiz that could not be read. Try again." Nothing is stored.
- **Missing migration 0012** (`create_quiz` not found): the modal states which migration to run, the way a missing 0008 announces itself.
- **Create fails after generation**: the preview stays open with the generated questions so the user can retry the save without paying for another generation.

## 8. Testing

Colocated Vitest, pure logic only (no jsdom):

- `ai/quizPrompt.test.ts` — the prompt per type and sub-option, truncation and the total cap, `quizMaxTokens` clamp at 1, 20 and out-of-range.
- `quiz/schema.test.ts` and `quiz/build.test.ts` — shape validation per type, dropping bad-slide and wrong-shape questions, trimming to `count`, shortfall reporting, the seeded shuffle carrying the correct index (exhaustive over positions), count clamp 1–20.
- `ai/quizFallback.test.ts` — against mocked `fetch`: only `capacity` hands off, an abort never does, retry-with-errors once. **Mutation-check** that an `auth` error does not fail over.
- `ai/fallbackProvider.test.ts` (existing) still passes unchanged after the `runWithFailover` extraction.
- `quiz/quizCode.test.ts` — alphabet and length match the SQL constant.
- `quiz/pdf/quizPdfLayout.test.ts` — wrapping, pagination, answer-key page break.
- `supabase/tests/0012_quiz_rls.sql`, run by hand like 0009/0010: a student cannot read `quiz_questions`; `get_quiz_for_taking` refuses a non-member, an unposted quiz and an unknown code, and never returns an answer; `submit_quiz_attempt` scores server-side for each type (case/punctuation/alternates for blanks) and refuses a second attempt; a General account can `create_quiz` but cannot post.

## 9. Files

New: `supabase/migrations/0012_quizzes.sql`, `supabase/tests/0012_quiz_rls.sql`, `src/quiz/{types,schema,build,quizCode,api}.ts`, `src/quiz/pdf/{quizPdfLayout,quizPdf}.ts`, `src/ai/quizPrompt.ts`, `src/components/quiz/{QuizModal,QuizPreview}.tsx`, `src/pages/QuizPage.tsx`, `public/fonts/NotoSans-{Regular,Bold}.ttf`, and the tests above.

Changed: `ai/provider.ts` (`QuizProvider`, quiz types), `ai/groqProvider.ts` (`generateQuiz`), `ai/fallbackProvider.ts` (`runWithFailover`, `QUIZ_CHAIN`), `components/editor/TopBar.tsx`, `pages/EditorPage.tsx`, `pages/classroom/QuizzesPage.tsx`, `components/classroom/QuizRow.tsx`, `pages/classroom/MyClassesPage.tsx`, `classroom/api.ts` (export helpers), `App.tsx` (`/quiz/:code`), `package.json` (`jspdf`), and CLAUDE.md (a Quiz section: the invariants above, and that generating a quiz is not precedent for regenerating slides).

## Risks

- Groq's 8,000 TPM window counts input plus requested output; 20 items plus a large deck is the tight case, which is why the input is capped. A deck too large for even the capped input still fails as `capacity` and shows the busy message.
- Fill-in-the-blank scoring is strict-but-normalised; an unlisted synonym counts wrong. The model's `accepted` list is the mitigation, and the word box removes the problem where it is on.
- `quizzes.teacher_id` is the owner's id, and for a General account it is not a teacher. The name is legacy from 0009; nothing branches on it.
