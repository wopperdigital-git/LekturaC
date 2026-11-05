# Lessons — narrated video with quiz checkpoints (design)

## Context

The user wants a feature unique to LekturaC that needs no AI call and no per-use bill. They picked **interactive replay** ("Lessons"): a teacher posts a deck's narrated video to a class as a lesson; each student watches it on their own time; the video stops at quiz checkpoints; the student answers and sees ✓/✗ at once; the final score counts in class statistics like a quiz. It joins what only LekturaC has together: AI decks, narrated cloned-voice video, quizzes cited by slide, and a real class roster. (Cost cutting was raised and parked by the user.)

Name "Lessons" is Claude's call; rename freely.

## Decided by the user

- Remote, self-paced (not live; no audio streaming).
- Checkpoints come from an **existing quiz** of the deck; each question pauses the video at the end of the slide it is about. No new generation.
- Wrong answer: **show ✓/✗ (never the correct answer) and continue**.
- **Rewind only**: rewatch anything seen; never jump past an unanswered checkpoint.
- **Resume**: answers given are kept; the student picks up after the last answered checkpoint.
- Teacher sees: **who's done** (not started / in progress / finished + score), **hardest checkpoints** (most missed, by slide), and **scores in class stats**.
- **The server enforces** "can't skip": a checkpoint can be answered only once the server agrees the student has watched up to it (not just the player).

## Goals / non-goals / anti-goals

- Goal: a posted lesson a student can finish on a phone or laptop, with the score in the existing stats.
- Non-goals: live sync, teacher audio, guest (non-account) students, new AI calls, editing checkpoints by hand.
- Anti-goals: a student ever seeing correct answers; a student reading the deck or cards; skipping checkpoints by seeking; breaking classroom pages on a project without the new migration.

## Design (Claude's calls unless marked above)

### 1. Save slide timings with the video
- `VideoRecord` (`src/video/videoRecord.ts`) gains optional `slides: {cardId, startSeconds, durationSeconds}[]`. `generateVideo` (`src/video/pipeline.ts`) today gets only `texts` and calls `deps.save(blob, totalSeconds)`: it must also take the card ids (from `generate.ts`, where cards are already sorted) and pass the `planTimeline` slides (`timeline.ts`) to `save`, whose shape changes; `saveVideo` (`src/video/storage.ts`, starts ~line 51) writes them into the record.
- `parseVideo` keeps the record when `slides` is missing or malformed (slides = undefined), so old videos still play. A video without slides cannot be posted as a lesson ("Make the video again to use it in a lesson").
- Regenerating the video after posting is fine: the record and file are replaced together, so timings always match the file.

### 2. Migration `0018_lessons.sql`
- `quiz_classes.mode text not null default 'quiz' check (mode in ('quiz','lesson'))`. A lesson **is a quiz posting in lesson mode**, so the existing `unique (quiz_id, class_id, student_id)` attempt rule and `classroom/stats.ts` work unchanged (the final score is an ordinary `quiz_attempts` row).
- `lesson_answers(quiz_id, class_id, student_id, question_id, correct bool, answered_at, PK(quiz_id,class_id,student_id,question_id))`. RLS: select for self or `is_class_teacher(class_id)`; **no insert/update policy** (RPC only). Stores correctness only, not the answer text.
- Extract the per-type scoring in `submit_quiz_attempt` (0016:331–342) into `quiz_answer_correct(question_type, answer, given) returns boolean`; reuse it in both places.
- `get_lesson_for_taking(p_code, p_class_id) returns jsonb` (security definer): caller is a member, posting exists with mode `lesson`; returns quiz title/settings, questions **without answers** (id, order_index, section_index, question_type, card_id, slide_number, prompt, choices, word boxes), the deck's `video` record (path, contentType, slides), the caller's `lesson_answers` (question id + correct), and their attempt score if finished.
- **Server-side checkpoint order**: `lesson_stops(p_quiz_id) returns table(question_id, stop_seconds, ord)` computes the stops in SQL from the deck's `presentations.video->'slides'` and `quiz_questions.card_id` with exactly the rules of `placeCheckpoints` (§3). The two must agree; the hand-run SQL test and the Vitest test share the same fixture.
- **Watch progress** `lesson_progress(quiz_id, class_id, student_id, watched_until numeric, last_beat_at, video_generated_at, PK(...))`, RLS select self or class teacher, written only by RPC.
- `lesson_watch(p_code, p_class_id, p_position) returns jsonb` (security definer): the player calls it every ~5 s **while playing**. New `watched_until = max(old, min(p_position, old + least(now − last_beat_at, 15 s) + 2 s, next unanswered stop))`, so watched time grows no faster than real time, pausing banks nothing, and it never passes an unanswered stop. Rewinding (a lower position) changes nothing. If `video->>'generatedAt'` differs from `video_generated_at` (video regenerated mid-lesson), reset `watched_until` to the start of the slide after the last answered stop in the new timing.
- `answer_lesson_checkpoint(p_code, p_class_id, p_question_id, p_answer) returns jsonb` (security definer): membership + lesson-mode posting + no attempt yet; the question must be **the first unanswered stop** in `lesson_stops` order, and `watched_until ≥ its stop_seconds − 1`; if already answered return the stored result (never re-score); else score, insert `lesson_answers`; when it was the last question, insert the `quiz_attempts` row (score = correct/total). Returns `{correct, finished, score?}`.
- **No video** (deck or video deleted, or the record has no slides): the order rule still holds but the watch check is skipped, so students mid-lesson can finish (Claude's call; the teacher removed the video).
- `submit_quiz_attempt` refuses a posting in lesson mode; `get_quiz_for_taking` returns each class's `mode` so `/quiz/:code` can point to the lesson instead.
- Storage: a select policy on `deck-videos` for class members, through a security definer `can_watch_deck_video(object_name)` (parse presentation id from `<uid>/<presentationId>.<ext>`; true when a quiz with that `presentation_id` is posted in lesson mode to a class the caller is a member of). The student then calls `createSignedUrl` as today. Follows the 0012 rule: no policy selects another RLS table directly.
- **Mode is fixed once anyone started** (Claude's call): posting a quiz to a class in the other mode is refused while that quiz+class has any `quiz_attempts` or `lesson_answers`; unposting and reposting a lesson as a lesson resumes progress. One quiz may be a quiz in class A and a lesson in class B.
- Hand-run test `supabase/tests/0018_lessons_rls.sql`: student can't read `quiz_questions` or another student's `lesson_answers`/`lesson_progress`; can't answer out of order, before `watched_until` reaches the stop, twice, or after finishing; `lesson_watch` can't advance faster than real time or past an unanswered stop; can't submit a lesson through `submit_quiz_attempt`; mode switch refused after a start; non-member can't sign the video URL; member can; last answer writes the attempt; no-video lesson can be finished.

### 3. Pure logic `src/lesson/` (Vitest, colocated)
- `checkpoints.ts`: `placeCheckpoints(questions, videoSlides)` → stops sorted by time. A question maps by `card_id` → that slide's end; several on one slide are asked in `order_index` order; a question whose card isn't in the video (or has no card) is asked at the end.
- `player.ts`: `clampSeek(target, maxReached)`, `nextStop(time, stops, answeredIds)`, `resumeTime(stops, answeredIds, slides)` (start of the slide after the last answered stop; 0 when none), `lessonStatus(answers, attempt)` → `not_started|in_progress|finished`.
- `progress.ts`: per-student rows and `hardestCheckpoints(answers, questions)` (miss rate, ties by slide).

### 4. Student UI
- Route `/lesson/:code/:classId` → `pages/LessonPage.tsx`: own `<video>` with **no native controls**, playback rate fixed at 1×; play/pause, back 10 s, a progress bar that only seeks within the server's `watched_until`; `lesson_watch` heartbeat every ~5 s while playing; `timeupdate` pauses at the next unanswered stop and shows a question card (reuse `components/quiz/QuestionField.tsx`), then ✓/✗ and Continue. A refused answer ("watch to here first") rewinds to `watched_until`. On a phone the question covers the video. With no video: the remaining questions as a plain list with "The video for this lesson was removed." Finish screen: score + each answer's ✓/✗.
- `StudentClassPage` Quizzes panel: lesson postings say **Start lesson / Continue lesson / Finished · score** and link to the lesson. Mode is read in a **separate best-effort query** so classroom pages still load without 0018 (then everything is a quiz).
- `QuizPage`: for a lesson-mode class, show "This quiz is a lesson in <class>. Open the lesson."

### 5. Teacher UI
- `QuizRow` posting: beside the class picker, **Post as quiz / Post as lesson**; lesson disabled with its reason when the deck has no video, or a video without slide timings. Posted chips show "Lesson".
- A **Lesson progress** panel from a lesson chip (class folder and Quizzes page): student list with status + score, and hardest checkpoints (prompt, slide number, % missed). Reads `lesson_answers`, `quiz_attempts`, `class_members`, and the owner's own `quiz_questions`.

### Edge cases
- Deck deleted (`presentation_id` null) or video deleted: lesson page says the video is gone; already-earned scores stay.
- Quiz with questions on slides that no longer exist: asked at the end.
- Unposting a lesson: as today (attempts stay; `lesson_answers` cascade with the posting is Claude's call → keep them, harmless).

## Critical files
- Modify: `src/video/videoRecord.ts`, `pipeline.ts`, `generate.ts`, `storage.ts`; `src/quiz/api.ts` (`postQuiz` mode); `src/components/classroom/QuizRow.tsx`, `StudentQuizRow.tsx`; `src/classroom/api.ts`, `select.ts`; `src/pages/classroom/StudentClassPage.tsx`, `ClassFolderPage.tsx`; `src/pages/QuizPage.tsx`; `src/App.tsx`; `CLAUDE.md` (new Lessons section + 0018 note).
- New: `supabase/migrations/0018_lessons.sql`, `supabase/tests/0018_lessons_rls.sql`, `src/lesson/*`, `src/pages/LessonPage.tsx`, `src/components/lesson/*`.

## Steps after approval
1. Write this as `docs/superpowers/specs/2026-11-06-lessons-design.md` and commit.
2. `superpowers:writing-plans` → task-by-task plan; implement with Sonnet subagents (user memory).

## Verification
- `npm run test` (new `src/lesson/*.test.ts`, video record round-trip with/without slides), `npm run lint`, `npm run build` (check `mediabunny`/`html-to-image` still not in the entry chunk).
- Apply 0018 to a test project; hand-run `0018_lessons_rls.sql`.
- By hand: teacher generates a video, posts a quiz as a lesson; student account opens it from My classes, can't scrub ahead, answers ✓/✗, leaves mid-way, resumes, finishes; teacher sees status, hardest checkpoints, and the score in class stats.
