# Teacher & student user types, classroom — design

**Date:** 2026-09-14
**Status:** approved, not yet implemented

LekturaC gains user types. A **teacher** keeps the full deck dashboard and adds
a **Classroom** area: Classes (a folder per class holding its students,
announcements and quizzes), Students (every student across the teacher's
classes, with performance statistics that expand in place), and Quizzes (every
generated quiz, with its source slides, the classes it is posted in, and when it
was generated). A **student** keeps the deck dashboard and adds a minimal side:
join a class by code, see their classes and each class's announcements.

**Quiz generation, taking quizzes, and posting quizzes are out of scope.** This
phase builds the tables and screens they will fill, so those screens ship with
honest empty states and need no migration when generation lands.

## Decisions

Settled before design, in the order they constrain everything else:

1. **Students are real accounts**, not a roster the teacher types in.
   Performance statistics come from quizzes students actually take in the app.
2. **The user type is picked at sign-up** — General / Teacher / Student — and
   can be changed later from the account menu. Existing accounts become
   General. Nobody verifies that a teacher is a teacher.
3. **The student side is minimal in this phase:** join by code, list my
   classes, read a class's announcements, leave a class.
4. **Statistics shown:** average score, completion rate, score trend, and
   per-quiz history. The collapsed student row carries the first three; the
   expanded view carries all four.
5. **A quiz belongs to one deck and cites its slides per question.** The list
   reads "*Photosynthesis* · slides 2–5".
6. **Every user type keeps the deck tools.** The classroom is additive; no deck
   route is role-guarded.

### Assumed defaults (stated, not asked)

- Announcements are a title and a body; the teacher creates, edits and deletes
  them; every class member reads them.
- A class is joined with a 6-character code the teacher can regenerate. A
  teacher can remove a student; a student can leave.
- Statistics are empty until quizzes exist. Every stat has a real empty state;
  nothing is seeded with demo numbers.

## Approach

**A `profiles` table plus classroom tables in Supabase under RLS, with every
statistic computed client-side in a pure module.** Chosen over:

- *Role in `auth.users.user_metadata`* — a teacher still needs student names
  and emails, which the client cannot read from `auth.users`, so a profiles
  table is needed regardless and the role would live in two places.
- *Statistics as SQL views/RPCs* — scales better to very large classes, but
  moves the most test-worthy logic into SQL, where this repo has no tests.
  Revisit if classes reach hundreds of students.

## 1. Data model — `supabase/migrations/0009_classroom.sql`

### Tables

**`profiles`** — one row per account.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | references `auth.users(id) on delete cascade` |
| `role` | `text not null default 'general'` | check in (`general`, `teacher`, `student`) |
| `display_name` | `text not null default ''` | |
| `email` | `text not null default ''` | copied so a teacher's roster can show it; the client cannot read `auth.users` |
| `created_at` | `timestamptz not null default now()` | |

- An `after insert on auth.users` trigger (`security definer`) creates the row,
  reading `role` and `display_name` from `raw_user_meta_data` and `email` from
  the user. An unrecognised or absent role becomes `general`.
- The migration backfills a `general` row for every existing `auth.users` row
  that has none (`on conflict do nothing`), so no account is ever without a
  profile.
- A `before update` trigger refuses to change `role` away from `teacher` while
  the user still owns any class, with the message *"Delete or hand off your
  classes before changing account type."* Without it a class would be left with
  a `teacher_id` whose owner is no longer a teacher. It also refuses to change
  `role` away from `student` while the user is still a member of any class
  (*"Leave your classes before changing account type."*), for the same reason on
  the other side.
- A user may update only `role` and `display_name` on their own row; `id` and
  `email` are not client-writable (column privileges, or a trigger that pins
  them to their old values).

**`classes`**

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `teacher_id` | `uuid not null default auth.uid()` | references `profiles(id) on delete cascade` |
| `name` | `text not null` | check `length(trim(name)) > 0` |
| `description` | `text not null default ''` | |
| `join_code` | `text not null unique` | default from `generate_join_code()` |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` via the existing `set_updated_at()` |

- `generate_join_code()` returns 6 characters from an alphabet without
  lookalikes (no `0 O 1 I L`), retrying on a unique collision.
- An insert trigger rejects a `teacher_id` whose profile role is not `teacher`.

**`class_members`**

| column | type | notes |
|---|---|---|
| `class_id` | `uuid` | references `classes(id) on delete cascade` |
| `student_id` | `uuid` | references `profiles(id) on delete cascade` |
| `joined_at` | `timestamptz not null default now()` | |

Primary key `(class_id, student_id)`. An insert trigger rejects a `student_id`
whose role is not `student`.

**`announcements`**

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `class_id` | `uuid not null` | references `classes(id) on delete cascade` |
| `title` | `text not null` | check non-blank |
| `body` | `text not null default ''` | |
| `created_at`, `updated_at` | `timestamptz` | |

**`quizzes`**

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `teacher_id` | `uuid not null default auth.uid()` | references `profiles(id) on delete cascade` |
| `presentation_id` | `uuid null` | references `presentations(id) on delete set null` |
| `title` | `text not null` | |
| `deck_title` | `text not null` | snapshot, so the quiz still reads "from *X*" after a rename or deletion |
| `created_at` | `timestamptz not null default now()` | the "date generated" |

**`quiz_questions`**

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `quiz_id` | `uuid not null` | references `quizzes(id) on delete cascade` |
| `order_index` | `integer not null` | |
| `card_id` | `uuid null` | references `cards(id) on delete set null` |
| `slide_number` | `integer not null` | 1-based snapshot at generation time |
| `slide_heading` | `text not null default ''` | snapshot |
| `prompt` | `text not null` | |
| `choices` | `jsonb not null default '[]'` | |
| `answer` | `jsonb not null` | |

**Questions carry their own text rather than referencing live slide content.**
Two reasons, both load-bearing: a student cannot read a teacher's `cards` (RLS
scopes them to the deck owner), so a student taking the quiz needs the question
itself; and editing a slide later must not silently change a quiz that has
already been answered and scored. `card_id` survives only as a link back for the
teacher.

**`quiz_classes`** — where a quiz is posted.

| column | type | notes |
|---|---|---|
| `quiz_id` | `uuid` | references `quizzes(id) on delete cascade` |
| `class_id` | `uuid` | references `classes(id) on delete cascade` |
| `posted_at` | `timestamptz not null default now()` | |

Primary key `(quiz_id, class_id)`. The insert policy's `with check` requires
the caller to own both the quiz and the class, so a quiz can only be posted to
its own teacher's classes.

**`quiz_attempts`**

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `quiz_id` | `uuid not null` | references `quizzes(id) on delete cascade` |
| `class_id` | `uuid not null` | references `classes(id) on delete cascade` |
| `student_id` | `uuid not null` | references `profiles(id) on delete cascade` |
| `score` | `numeric not null` | check `score >= 0 and score <= 1` |
| `submitted_at` | `timestamptz not null default now()` | |

Unique `(quiz_id, class_id, student_id)` — one attempt per quiz per class; no
retakes. The attempt carries its class so a quiz posted to two of a student's
classes keeps completion and per-class averages honest.

Indexes on every foreign key used for lookup: `classes(teacher_id)`,
`class_members(student_id)`, `announcements(class_id, created_at desc)`,
`quizzes(teacher_id, created_at desc)`, `quiz_questions(quiz_id, order_index)`,
`quiz_classes(class_id)`, `quiz_attempts(class_id)`, `quiz_attempts(student_id)`.

### Row-level security

RLS is enabled on every new table. **Policies never query each other's tables
directly.** "Can read a class if a member" and "can read members if the class's
teacher" reference each other and Postgres recurses. Every membership or
ownership check goes through two `security definer` helpers with a pinned
`search_path`:

- `is_class_teacher(class_id uuid) returns boolean`
- `is_class_member(class_id uuid) returns boolean`

plus, for reading profiles, `teaches_student(student_id uuid) returns boolean`
(the caller teaches a class the student belongs to) and
`is_my_teacher(teacher_id uuid) returns boolean` (the caller is a member of a
class that teacher owns).

| table | teacher | student | anyone else |
|---|---|---|---|
| `profiles` | read own + `teaches_student(id)`; update own | read own + `is_my_teacher(id)`; update own | read/update own |
| `classes` | all verbs where `teacher_id = auth.uid()` | read where `is_class_member(id)` | — |
| `class_members` | read, delete where `is_class_teacher(class_id)` | read own rows; delete own rows (leave) | — |
| `announcements` | all verbs where `is_class_teacher(class_id)` | read where `is_class_member(class_id)` | — |
| `quizzes` | all verbs where `teacher_id = auth.uid()` | read when posted to a class they are in | — |
| `quiz_questions` | all verbs via own quiz | **none in this phase** | — |
| `quiz_classes` | all verbs where `is_class_teacher(class_id)` | read where `is_class_member(class_id)` | — |
| `quiz_attempts` | read where `is_class_teacher(class_id)` | read own | — |

**Students cannot read `quiz_questions` at all in this phase**, because each
row carries its `answer`. A select policy would hand every student the answer
key the moment a quiz is posted. Quiz taking will add a `security definer` RPC
that returns a posted quiz's questions without their answers, and scores a
submission server-side.

Students have **no insert policy on `class_members`**. Joining goes only through
`join_class`. Nothing in this phase inserts attempts; that policy arrives with
quiz taking.

### RPCs

- **`join_class(code text) returns uuid`** — `security definer`. Requires the
  caller's role to be `student` (*"Only student accounts can join classes."*);
  matches `upper(trim(code))`; raises *"No class with that code."* when none;
  inserts the membership `on conflict do nothing` (joining twice succeeds);
  returns the class id. It has to be an RPC because a student cannot read a
  class they are not yet in.
- **`regenerate_join_code(class_id uuid) returns text`** — requires
  `is_class_teacher`, writes a fresh code, returns it.

## 2. Auth, roles, routes, sidebar

### Auth store — `store/authStore.ts`

- New state `profile: { role: Role; displayName: string } | null`, loaded from
  `profiles` whenever a session resolves and cleared on sign-out.
- `status` stays `'loading'` until the profile has resolved, so `RequireAuth`
  (which already waits on `status`) never renders a page before the role is
  known. A user switch must reset `profile` before loading the next one, or the
  previous account's role is briefly in force.
- **Fallback:** a failed profile read, a missing row, or an unrecognised role
  resolves to `general` with a `console.warn`. `general` is exactly today's
  app, so an un-migrated database degrades to current behaviour instead of
  locking everyone out. This logic is a pure `resolveProfile(row, error)` so it
  is testable.
- `signUp(email, password, { role, displayName })` passes both through
  `options.data`, where the insert trigger reads them.
- `updateRole(role): Promise<{ error: string | null }>` writes the user's own
  row and updates `profile` only on success; the trigger's refusal message is
  returned as-is.

### Sign-up — `pages/LoginPage.tsx`

Signup mode only gains a **Name** field and an **"I'm using LekturaC as…"**
choice (General / Teacher / Student, each with a one-line hint), defaulting to
General. Login and forgot-password are unchanged.

### Guards

`components/auth/RequireRole.tsx` — `<RequireRole role="teacher">`, nested
inside `RequireAuth`. The wrong role redirects to `/` rather than rendering an
error: nothing is broken, the page is just not theirs. The decision is a pure
`canAccess(role, required)`. Deck routes are not wrapped.

### Routes — `App.tsx`

| route | role | page |
|---|---|---|
| `/classroom` | teacher | redirects to `/classroom/classes` |
| `/classroom/classes` | teacher | `ClassesPage` |
| `/classroom/classes/:classId` | teacher | `ClassFolderPage` |
| `/classroom/students` | teacher | `StudentsPage` |
| `/classroom/quizzes` | teacher | `QuizzesPage` |
| `/classes` | student | `MyClassesPage` |
| `/classes/:classId` | student | `StudentClassPage` |

### `DashboardShell`

`HomePage` and `DraftsPage` each hand-assemble the rail, the mobile drawer's
open state, sign-out and the main column. Before six more pages copy that, it
moves into `components/home/DashboardShell.tsx`, which takes `title`,
`subtitle`, `query`/`onQueryChange` and children. Both existing pages are
migrated onto it with no visual change. The rail's search binds to whatever the
page passes, so ⌘F / Ctrl+F searches classes, students or quizzes on those
pages and decks elsewhere.

### Sidebar — `components/home/AppSidebar.tsx`

- **Workspace** (Overview, Drafts) is unchanged for everyone.
- **Teacher:** a **Classroom** section — Classes (count badge), Students,
  Quizzes.
- **Student:** a **My classes** section — one link per class (at most five,
  then "All classes"), and "Join a class".
- The class list for both comes from a small shared cache
  (`classroom/useMyClasses.ts`, `useSyncExternalStore` like `useDrafts`) that
  classroom writes invalidate, so the rail stays correct without each page
  threading counts through.
- The account footer shows the display name (falling back to email) with a role
  label beneath, and gains an **Account type** item beside Log out, opening
  `AccountTypeModal` with the same three choices and any refusal shown inline.

## 3. Screens

All are `app-*`-token chrome inside `DashboardShell`: a title/subtitle block
over one bordered panel with a toolbar strip, matching the deck dashboard.

### Classes — `/classroom/classes`

- Toolbar: `ViewTabs` (grid/list) and **New class**.
- A class card shows name, description, student count, relative time of the
  latest announcement, quizzes posted, and the join code as a copyable chip.
  Menu: Open, Delete.
- Delete confirms in a modal modelled on `DeleteDeckModal`, naming what goes
  with the class (memberships, announcements, postings, and the scores students
  earned in this class — `quiz_attempts.class_id` cascades) and what does not
  (the quizzes themselves, and students' accounts).
- **New class** modal: name (required), description (optional). The code is
  generated by the database.
- Rail search filters by name and description.
- Empty state: "Create your first class", with one line on how students join
  by code.

### Class folder — `/classroom/classes/:classId`

- Header: name and description (changed through an **Edit details** modal that
  reuses the New class form), join code with Copy and
  Regenerate (confirms first — the old code stops working immediately), student
  count.
- Tabs, reflected in the URL as `?tab=students|announcements|quizzes` so a
  reload or a shared link lands on the same tab:
  - **Students** — the roster, using `StudentRow` with statistics scoped to this
    class. Each row can be removed, with confirmation.
  - **Announcements** — a composer (title, body) above posts newest-first, each
    editable and deletable in place.
  - **Quizzes** — `QuizRow`s for quizzes posted here; empty state "Quizzes will
    appear here once they're generated and posted."

### Students — `/classroom/students`

- One row per student, deduplicated across the teacher's classes. Toolbar: a
  class filter. Rail search filters by name and email.
- **Collapsed `StudentRow`:** name and email, class chips, average score,
  completion (`7 / 9`), and a trend sparkline with an improving / steady /
  slipping indicator.
- **Expanded:** clicking the row (or Enter/Space on it) expands it in place.
  One row is open at a time; the row is a `button` with `aria-expanded` and
  `aria-controls`. The expanded region holds:
  - a larger score-over-time chart,
  - per-class average and completion,
  - a per-quiz history table: quiz, class, source slides, score or **Missing**,
    submitted date.
- Charts are hand-drawn inline SVG, no chart dependency. Each chart has a text
  equivalent (the history table, and an `aria-label` summarising the trend) so
  nothing is conveyed by the drawing alone.

### Quizzes — `/classroom/quizzes`

- A `QuizRow` shows title; source "*deck_title* · slides 2–5", linking to
  `/deck/:presentationId` when the deck still exists and otherwise marked "deck
  deleted"; the classes it is posted in as chips, or "Not posted"; and the date
  generated.
- Toolbar: class filter; newest/oldest sort. Rail search filters by title and
  deck title.
- No Generate, Post or Unpost controls in this phase — nothing can create a
  quiz, so they would ship untestable. Empty state: "Quizzes you generate from a
  deck will show up here."

### Student side

- **`/classes`** — class cards (name, teacher's display name, latest
  announcement) and a **Join a class** field. Input is uppercased as typed;
  `join_class` errors appear inline; success navigates into the class.
- **`/classes/:classId`** — teacher's name, announcements (read-only,
  newest-first), and **Leave class** with confirmation.

### Statistics — `classroom/stats.ts`

Pure, no React, no Supabase.

- **Expected:** every `(quiz, class)` posting for a class the student is a
  member of. There are no due dates, so a student who joins late is still
  expected to take quizzes posted before they joined.
- **Completion** = submitted ÷ expected, as a count pair and a ratio. With
  nothing expected it is **—**, never `0%` — a student with no quizzes posted is
  not failing.
- **Average** = mean of submitted scores only. A missing quiz is not scored as
  zero: completion already reports it, and counting it in the average as well
  would penalise the same absence twice. No submissions → **—**.
- **Trend** = mean of the latest three scores minus the mean of the three
  before them, by `submitted_at`. Fewer than four scores → "Not enough data".
  More than +5 percentage points → improving; less than −5 → slipping;
  otherwise steady.
- **History** = one entry per expected posting, carrying the attempt if one
  exists, otherwise marked missing; newest posting first.
- Every function takes an optional `classId` so the class folder computes the
  same statistics scoped to one class.

## 4. Data access, errors, testing

### Data access

- **`classroom/api.ts`** owns every Supabase read and write for the classroom.
  Pages call its functions and never build queries — the rule `briefDrafts.ts`
  follows. Rows map to app types through pure `classFromRow`, `quizFromRow`,
  etc. in `classroom/rows.ts`.
- **`classroom/types.ts`** — `Role`, `ClassRoom`, `Member`, `Announcement`,
  `QuizSummary`, `Posting`, `Attempt`.
- **No new global store.** The classroom has no cross-route live state like the
  editor does. Each page loads through `classroom/useAsync.ts` (loading / error
  / data / reload) and reloads after a write. Only the rail's class list is
  shared, via `useMyClasses`.
- The Students page issues four parallel reads — classes, members with
  profiles, postings, attempts — and `stats.ts` joins them. The source-slide
  label comes from `formatSlideRange(numbers)` in `classroom/slideRange.ts`
  ("slides 2–5, 8"; "slide 3").
- Loading states are row-shaped skeletons, like `DeckCardSkeleton`.

### Errors

- A failed load renders inline in the panel with **Retry**, through the
  existing `describeError` from `store/presentationStore.ts`.
- Writes (create class, post announcement, remove student, join, leave, change
  account type) keep the form's input and show the error beside it. **No
  optimistic updates:** these are infrequent, and a roster that briefly shows a
  removal that did not happen is worse than a short wait.
- A class id that does not exist or is not visible to the caller renders "This
  class isn't available" with a link back — deliberately not distinguishing the
  two, and never a blank page.

### Testing

Vitest, pure logic only, per the repo's narrow-coverage rule:

- **`classroom/stats.test.ts`** — completion is `—` with nothing expected; a
  missing quiz lowers completion and never the average; trend needs four scores
  and respects the ±5-point threshold at its boundaries; a quiz posted to two
  classes counts once per class; `classId` scoping excludes other classes'
  postings and attempts; history marks missing postings.
- **`classroom/slideRange.test.ts`** — contiguous runs, singles, duplicates,
  unsorted input, empty input.
- **`classroom/joinCode.test.ts`** — normalisation of case and whitespace;
  rejection of lookalike characters and wrong lengths (client-side validation
  before calling `join_class`).
- **`store/profile.test.ts`** — `resolveProfile` (missing row, error and unknown
  role all resolve to `general`) and `canAccess(role, required)`.
- **`classroom/rows.test.ts`** — row mapping, including a quiz whose deck was
  deleted (`presentation_id` null).

**RLS is verified by a SQL script, not a unit test**:
`supabase/tests/0009_classroom_rls.sql`. The repo has no database test harness
and this phase does not add one. The script creates fixture users, impersonates
(via `set local role authenticated` and `request.jwt.claims`) a teacher, a
student in the class, a student outside it, and a general user, and asserts
what each can read and write — including that a student cannot insert into
`class_members` directly, cannot read another class's announcements, and cannot
read another student's profile. It runs inside a transaction that rolls back.
It is run by hand in the Supabase SQL editor after applying 0009. These
policies decide who sees student data, so they get a written, repeatable check.

### Documentation

CLAUDE.md gains a **Classroom** section: the user types and the `general`
fallback, the recursion-safe RLS helpers, questions storing their own text, the
statistic definitions, and that migration 0009 is required before any
classroom page or sign-up with a role works.

## Out of scope

- Quiz generation, taking quizzes, submitting attempts
- Posting and unposting quizzes
- Due dates, retakes
- Email invites
- Co-teachers, or transferring a class
- Verifying teacher accounts
- A student-facing performance page
- Statistics computed in SQL
