---
paths:
  - "src/quiz/**"
  - "src/components/quiz/**"
  - "src/pages/QuizPage.tsx"
  - "src/jobs/quizJob.ts"
---

# Quizzes (`src/quiz/`, `components/quiz/`)

1–3 tests per quiz, each multiple choice / fill in the blank / true-false, 1–20 items. Spec: `2026-09-24-quiz-generator-design.md` and `2026-10-01-quiz-test-sections-design.md`.

- **One model call per test, in order** (`quiz/sections.ts`); later calls get an `avoidList` (≤40 prompts / 2,000 chars). A failed test keeps earlier ones and Try again resumes there. Saved in **one** `create_quiz` call.
- **Free chain only**: `QUIZ_CHAIN` is Groq `gpt-oss-120b` → `groq/compound`, never Anthropic or Gemini. Shares `runWithFailover` with `FallbackProvider` (capacity-only failover, cancel never hands off).
- Budget `quizMaxTokens(n) = clamp(n*110 + 3800, 5200, 7000)`; deck text capped at 600 chars/slide and ~6,000 total. Raising any cap means revisiting Groq's TPM window.
- **The model is not trusted for structure** (`quiz/build.ts`): drop out-of-range citations and wrong shapes, report shortfall, **shuffle MC choices client-side** with a seeded shuffle.
- **Storage:** `quiz_questions` is **owner-only under RLS**, which makes the answer key and PDF owner-only by data. Students only use `get_quiz_for_taking` (no answers) and `submit_quiz_attempt` (server scoring, one attempt per class). `quiz/quizCode.ts` **must stay in step with `generate_quiz_code()`**.
- **`create_quiz` does not use `INSERT … RETURNING`** (under invoker RLS the SELECT policy can't see the new row yet). Don't "simplify" it back.
- Only Teachers get a code and can post; a code never auto-joins a class. Answers in progress are kept in user-namespaced `localStorage`. Result review shows the student's answer, never the correct one.
- Deleting cascades every attempt (scores leave class stats); the confirm names what is lost.
- **PDF** (`quiz/pdf/`): `jspdf` is lazy-imported; Noto Sans from `/fonts` (Latin, Greek, Cyrillic only).
