---
paths:
  - "src/lesson/**"
  - "src/components/lesson/**"
  - "src/pages/LessonPage.tsx"
---

# Lessons (`src/lesson/`, `pages/LessonPage.tsx`)

A quiz watched as the deck's narrated video, pausing at each question's slide. A `quiz_classes` posting with `mode='lesson'`. Spec: `2026-11-06-lessons-design.md`. No AI call; never touches `cards`.

- Needs a video **with slide timings** (`VideoRecord.slides`); older videos must be made again.
- **`placeCheckpoints` (TS) and `lesson_stops` (SQL) must agree**; both are checked against `lesson/fixtures.ts`. Change one → change both and the fixture.
- **Watching is enforced by the server** (`watched_until` grows by real time only, capped at the next unanswered stop). The player's clamp is convenience only.
- Scoring reuses `submit_quiz_attempt`, so classroom stats count lessons unchanged. `lesson_answers` stores only `correct`.
- Mode is fixed once anyone has *answered*. Lesson code imports only `video/videoRecord.ts` and `video/paths.ts` from `src/video/`.
