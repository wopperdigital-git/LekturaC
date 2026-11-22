---
paths:
  - "src/jobs/**"
  - "src/components/jobs/**"
---

# Background jobs (`src/jobs/`, `components/jobs/`)

Deck, quiz, video and narration generations run as jobs that outlive their page. Spec: `2026-10-02-background-generation-design.md`.

- **One job per kind** in `jobsStore`; `start` returns false while that kind runs. `jobs/start.ts` is the only place real deps are wired; job specs take injected deps and are tested against fakes.
- **Every write goes through the run-id check** (`current()`), so cancel/replace/reset settle into nothing.
- **A background job must never call `createDeckFromGeneration`** (it replaces the editor's open deck); use `insertGeneratedDeck`. The brief draft is deleted only after the insert.
- `reset()` runs on auth user change. Jobs live in this tab; a reload ends them (a `beforeunload` warning).
- **`src/jobs/*` reaches `@/video/generate` only through `import()`.**
- `newItems.ts` marks unseen results (user-namespaced `localStorage`). `JobTray` sits beside `<Routes>`; on `/deck/:id` that deck's narration and quiz jobs are hidden there (shown in the tab and `QuizJobStrip`).
