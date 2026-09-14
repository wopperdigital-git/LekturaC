# Teacher & Student Classroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add General / Teacher / Student account types, a teacher Classroom area (Classes, Students with expandable performance stats, Quizzes) and a minimal student side (join by code, my classes, announcements).

**Architecture:** A `profiles` table carries each account's role; classroom tables live in Supabase under RLS whose ownership/membership checks all go through `security definer` helpers (so policies cannot recurse). The client reads through one `classroom/api.ts` module, and every statistic is computed by pure, unit-tested functions in `src/classroom/`. Pages share one `DashboardShell` so the rail stays identical everywhere.

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), react-router-dom 7, zustand 5, Tailwind v4 (`app-*` tokens), Supabase (Postgres RLS, RPC), Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-09-14-teacher-classroom-design.md`

## Global Constraints

- Roles are exactly `general`, `teacher`, `student`. Anything unrecognised resolves to `general`.
- A failed/missing profile read resolves to `general` (today's app) — never locks the user out.
- `status` stays `'loading'` until the profile resolves, **except** a token refresh for the same user with a profile already loaded must not flip back to `'loading'` (that would unmount the editor).
- Join codes: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `0 O 1 I L`), matched case-insensitively.
- RLS policies never select from another RLS table directly; they call `is_class_teacher`, `is_class_member`, `teaches_student`, `is_my_teacher`, `owns_quiz`, `can_read_quiz`.
- Students have **no** read access to `quiz_questions` (rows carry answers) and **no** insert policy on `class_members` (joining is `join_class` only).
- Stats: completion with nothing expected is `—`; a missing quiz never lowers the average; trend needs ≥ 4 scores, window 3, threshold ±5 percentage points (delta rounded to 1e-9 before comparing).
- Classroom chrome uses `app-*` tokens only, never `slide-*`.
- No optimistic updates on classroom writes; errors shown inline, input kept.
- Pure modules in `src/classroom/` (`roles`, `joinCode`, `slideRange`, `stats`, `format`, `select`, `rows`) import no React and no Supabase client.
- Charts are hand-written inline SVG; no chart dependency.
- Nothing writes `quizzes`, `quiz_questions`, `quiz_classes` or `quiz_attempts` in this phase.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7
  ```
- Work on a dedicated branch (e.g. `feature/classroom`). Do not commit unrelated working-tree changes; stage only the files each task names.
- Do not apply migration 0009 to the user's Supabase project yourself — ask the user to run it.

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/0009_classroom.sql` | profiles, classroom tables, triggers, RLS helpers, policies, RPCs |
| `supabase/tests/0009_classroom_rls.sql` | hand-run RLS assertions (rolls back) |
| `src/classroom/roles.ts` (+test) | `Role`, labels/hints, `parseRole`, `canAccess` |
| `src/store/profile.ts` (+test) | `resolveProfile` — row/error → profile with `general` fallback |
| `src/store/authStore.ts` | loads profile with the session; `signUp` details; `updateRole` |
| `src/components/auth/RequireRole.tsx` | redirects the wrong role to `/` |
| `src/classroom/types.ts` | classroom domain types |
| `src/classroom/joinCode.ts` (+test) | normalise/validate a typed code |
| `src/classroom/slideRange.ts` (+test) | "slides 2–5, 8" |
| `src/classroom/stats.ts` (+test) | `studentStats`, `trendOf`, `rosterOf` |
| `src/classroom/format.ts` (+test) | `formatPercent`, `formatCompletion`, `personLabel`, `matchesQuery`, `describeTrend`, `plural`, `formatDate` |
| `src/classroom/select.ts` (+test) | `selectQuizzes` (filter/sort/search for the Quizzes list) |
| `src/classroom/rows.ts` (+test) | Supabase row shapes, column lists, row → type mappers |
| `src/classroom/api.ts` | every classroom Supabase read/write |
| `src/classroom/useAsync.ts` | page loading state |
| `src/classroom/useMyClasses.ts` | shared cache for the sidebar's class list |
| `src/components/home/DashboardShell.tsx` | rail + drawer + page header for every dashboard page |
| `src/components/home/relativeTime.ts` | add `relativePostedAt` |
| `src/components/auth/RoleChoice.tsx` | the three-way role radio group |
| `src/components/auth/AccountTypeModal.tsx` | change account type |
| `src/components/home/AppSidebar.tsx` | Classroom / My classes sections, footer role + Account type |
| `src/pages/LoginPage.tsx` | sign-up Name + role |
| `src/components/classroom/Panel.tsx` | `Panel`, `PanelMessage`, `LoadError`, `RowsSkeleton`, `ClassUnavailable` |
| `src/components/classroom/ConfirmModal.tsx` | async confirm with inline error |
| `src/components/classroom/ClassFormModal.tsx` | create / edit class details |
| `src/components/classroom/JoinCodeChip.tsx` | code + copy |
| `src/components/classroom/ClassChip.tsx` | small class-name pill |
| `src/components/classroom/ClassFilter.tsx` | class `<select>` |
| `src/components/classroom/ClassCard.tsx` | teacher class tile |
| `src/components/classroom/charts.tsx` | `Sparkline`, `ScoreChart`, `TrendBadge` |
| `src/components/classroom/StudentRow.tsx` | collapsible student row + detail |
| `src/components/classroom/QuizRow.tsx` | quiz list row |
| `src/components/classroom/AnnouncementList.tsx` | composer + list (editable or read-only) |
| `src/pages/classroom/ClassesPage.tsx` | `/classroom/classes` |
| `src/pages/classroom/StudentsPage.tsx` | `/classroom/students` |
| `src/pages/classroom/QuizzesPage.tsx` | `/classroom/quizzes` |
| `src/pages/classroom/ClassFolderPage.tsx` | `/classroom/classes/:classId` |
| `src/pages/classroom/MyClassesPage.tsx` | `/classes` |
| `src/pages/classroom/StudentClassPage.tsx` | `/classes/:classId` |
| `src/App.tsx` | routes |
| `CLAUDE.md` | Classroom section |

---

### Task 1: Database migration and RLS check script

**Files:**
- Create: `supabase/migrations/0009_classroom.sql`
- Create: `supabase/tests/0009_classroom_rls.sql`

**Interfaces:**
- Produces (used by every later task): tables `profiles(id, role, display_name, email, created_at)`, `classes(id, teacher_id, name, description, join_code, created_at, updated_at)`, `class_members(class_id, student_id, joined_at)`, `announcements(id, class_id, title, body, created_at, updated_at)`, `quizzes(id, teacher_id, presentation_id, title, deck_title, created_at)`, `quiz_questions(id, quiz_id, order_index, card_id, slide_number, slide_heading, prompt, choices, answer)`, `quiz_classes(quiz_id, class_id, posted_at)`, `quiz_attempts(id, quiz_id, class_id, student_id, score, submitted_at)`; RPCs `join_class(p_code text) returns uuid`, `regenerate_join_code(p_class_id uuid) returns text`. Sign-up metadata keys: `role`, `display_name`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_classroom.sql`:

```sql
-- Classroom: account types (profiles), classes, members, announcements, and
-- the quiz tables the Classes / Students / Quizzes screens read.
--
-- Nothing in the app writes quizzes, questions, postings or attempts yet —
-- quiz generation and taking come later. The tables and policies exist now so
-- those screens are built against the real shape.
--
-- RLS, load-bearing: no policy selects from another RLS-protected table
-- directly. "Read a class if you're a member" and "read members if you teach
-- the class" reference each other and Postgres recurses. Every ownership or
-- membership check goes through the security-definer helpers further down,
-- which read the tables without re-entering RLS.

-- ─── profiles ───────────────────────────────────────────────────────────────

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'general' check (role in ('general', 'teacher', 'student')),
  display_name text not null default '',
  -- Copied so a teacher's roster can show it: the client cannot read auth.users.
  email text not null default '',
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, role, display_name, email)
  values (
    new.id,
    case when requested in ('general', 'teacher', 'student') then requested else 'general' end,
    coalesce(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Every account that predates this migration becomes General.
insert into profiles (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do nothing;

-- ─── classes ────────────────────────────────────────────────────────────────

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  join_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Security definer so the uniqueness loop sees every class, not only the
-- caller's; under RLS a collision with someone else's code would go unnoticed
-- and surface as a unique-violation instead.
create or replace function generate_join_code()
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
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from classes where join_code = candidate);
  end loop;
  return candidate;
end;
$$;

alter table classes alter column join_code set default generate_join_code();

create table if not exists class_members (
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── quizzes ────────────────────────────────────────────────────────────────

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  presentation_id uuid references presentations(id) on delete set null,
  title text not null,
  -- Snapshot: the quiz still reads "from <deck>" after a rename or deletion.
  deck_title text not null,
  created_at timestamptz not null default now()
);

-- Questions carry their own text rather than pointing at live slide content:
-- students cannot read a teacher's cards, and editing a slide must not change
-- a quiz that has already been answered. card_id is only a link back.
create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  order_index integer not null,
  card_id uuid references cards(id) on delete set null,
  slide_number integer not null,
  slide_heading text not null default '',
  prompt text not null,
  choices jsonb not null default '[]',
  answer jsonb not null
);

create table if not exists quiz_classes (
  quiz_id uuid not null references quizzes(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  posted_at timestamptz not null default now(),
  primary key (quiz_id, class_id)
);

-- One attempt per quiz per class. The class is recorded so a quiz posted to
-- two of a student's classes keeps completion and per-class averages honest.
create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  score numeric not null check (score >= 0 and score <= 1),
  submitted_at timestamptz not null default now(),
  unique (quiz_id, class_id, student_id)
);

create index if not exists classes_teacher_id_idx on classes (teacher_id);
create index if not exists class_members_student_id_idx on class_members (student_id);
create index if not exists announcements_class_id_idx on announcements (class_id, created_at desc);
create index if not exists quizzes_teacher_id_idx on quizzes (teacher_id, created_at desc);
create index if not exists quiz_questions_quiz_id_idx on quiz_questions (quiz_id, order_index);
create index if not exists quiz_classes_class_id_idx on quiz_classes (class_id);
create index if not exists quiz_attempts_class_id_idx on quiz_attempts (class_id);
create index if not exists quiz_attempts_student_id_idx on quiz_attempts (student_id);

-- ─── integrity triggers ─────────────────────────────────────────────────────

create or replace function assert_role(p_user uuid, p_role text, p_message text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = p_user and role = p_role) then
    raise exception '%', p_message;
  end if;
end;
$$;

create or replace function classes_require_teacher()
returns trigger
language plpgsql
as $$
begin
  perform assert_role(new.teacher_id, 'teacher', 'Only teacher accounts can create classes.');
  return new;
end;
$$;

drop trigger if exists classes_require_teacher on classes;
create trigger classes_require_teacher
  before insert or update of teacher_id on classes
  for each row execute function classes_require_teacher();

create or replace function class_members_require_student()
returns trigger
language plpgsql
as $$
begin
  perform assert_role(new.student_id, 'student', 'Only student accounts can join classes.');
  return new;
end;
$$;

drop trigger if exists class_members_require_student on class_members;
create trigger class_members_require_student
  before insert on class_members
  for each row execute function class_members_require_student();

-- A user may change only role and display_name, and may not leave a role
-- that other rows still depend on.
create or replace function guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;

  if old.role = 'teacher' and new.role <> 'teacher'
     and exists (select 1 from classes where teacher_id = old.id) then
    raise exception 'Delete or hand off your classes before changing account type.';
  end if;

  if old.role = 'student' and new.role <> 'student'
     and exists (select 1 from class_members where student_id = old.id) then
    raise exception 'Leave your classes before changing account type.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_update on profiles;
create trigger profiles_guard_update
  before update on profiles
  for each row execute function guard_profile_update();

drop trigger if exists classes_set_updated_at on classes;
create trigger classes_set_updated_at
  before update on classes
  for each row execute function set_updated_at();

drop trigger if exists announcements_set_updated_at on announcements;
create trigger announcements_set_updated_at
  before update on announcements
  for each row execute function set_updated_at();

-- ─── RLS helpers (security definer: they must not re-enter RLS) ─────────────

create or replace function is_class_teacher(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from classes where id = target and teacher_id = auth.uid());
$$;

create or replace function is_class_member(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from class_members where class_id = target and student_id = auth.uid());
$$;

-- The caller teaches a class this student belongs to.
create or replace function teaches_student(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from class_members m
    join classes c on c.id = m.class_id
    where m.student_id = target and c.teacher_id = auth.uid()
  );
$$;

-- The caller is a member of a class this teacher owns.
create or replace function is_my_teacher(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from classes c
    join class_members m on m.class_id = c.id
    where c.teacher_id = target and m.student_id = auth.uid()
  );
$$;

create or replace function owns_quiz(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from quizzes where id = target and teacher_id = auth.uid());
$$;

-- Owner, or a student in a class the quiz is posted to.
create or replace function can_read_quiz(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from quizzes where id = target and teacher_id = auth.uid())
      or exists (
        select 1 from quiz_classes qc
        join class_members m on m.class_id = qc.class_id
        where qc.quiz_id = target and m.student_id = auth.uid()
      );
$$;

-- ─── policies ───────────────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table classes enable row level security;
alter table class_members enable row level security;
alter table announcements enable row level security;
alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_classes enable row level security;
alter table quiz_attempts enable row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select using (id = auth.uid() or teaches_student(id) or is_my_teacher(id));

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists classes_select on classes;
create policy classes_select on classes
  for select using (teacher_id = auth.uid() or is_class_member(id));

drop policy if exists classes_insert on classes;
create policy classes_insert on classes
  for insert with check (teacher_id = auth.uid());

drop policy if exists classes_update on classes;
create policy classes_update on classes
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists classes_delete on classes;
create policy classes_delete on classes
  for delete using (teacher_id = auth.uid());

drop policy if exists class_members_select on class_members;
create policy class_members_select on class_members
  for select using (student_id = auth.uid() or is_class_teacher(class_id));

-- No insert policy: joining goes only through join_class().
drop policy if exists class_members_delete on class_members;
create policy class_members_delete on class_members
  for delete using (student_id = auth.uid() or is_class_teacher(class_id));

drop policy if exists announcements_select on announcements;
create policy announcements_select on announcements
  for select using (is_class_teacher(class_id) or is_class_member(class_id));

drop policy if exists announcements_insert on announcements;
create policy announcements_insert on announcements
  for insert with check (is_class_teacher(class_id));

drop policy if exists announcements_update on announcements;
create policy announcements_update on announcements
  for update using (is_class_teacher(class_id)) with check (is_class_teacher(class_id));

drop policy if exists announcements_delete on announcements;
create policy announcements_delete on announcements
  for delete using (is_class_teacher(class_id));

drop policy if exists quizzes_select on quizzes;
create policy quizzes_select on quizzes
  for select using (can_read_quiz(id));

drop policy if exists quizzes_insert on quizzes;
create policy quizzes_insert on quizzes
  for insert with check (teacher_id = auth.uid());

drop policy if exists quizzes_update on quizzes;
create policy quizzes_update on quizzes
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists quizzes_delete on quizzes;
create policy quizzes_delete on quizzes
  for delete using (teacher_id = auth.uid());

-- Owner only. Rows carry the answer; students get questions through a
-- security-definer RPC when quiz taking is built, never through this table.
drop policy if exists quiz_questions_owner_all on quiz_questions;
create policy quiz_questions_owner_all on quiz_questions
  for all using (owns_quiz(quiz_id)) with check (owns_quiz(quiz_id));

drop policy if exists quiz_classes_select on quiz_classes;
create policy quiz_classes_select on quiz_classes
  for select using (is_class_teacher(class_id) or is_class_member(class_id));

drop policy if exists quiz_classes_insert on quiz_classes;
create policy quiz_classes_insert on quiz_classes
  for insert with check (is_class_teacher(class_id) and owns_quiz(quiz_id));

drop policy if exists quiz_classes_delete on quiz_classes;
create policy quiz_classes_delete on quiz_classes
  for delete using (is_class_teacher(class_id));

-- Read only in this phase; submitting attempts arrives with quiz taking.
drop policy if exists quiz_attempts_select on quiz_attempts;
create policy quiz_attempts_select on quiz_attempts
  for select using (student_id = auth.uid() or is_class_teacher(class_id));

-- ─── RPCs ───────────────────────────────────────────────────────────────────

-- An RPC because a student cannot read a class they are not yet in.
create or replace function join_class(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'Log in to join a class.';
  end if;
  if not exists (select 1 from profiles where id = auth.uid() and role = 'student') then
    raise exception 'Only student accounts can join classes.';
  end if;

  select id into target from classes where join_code = upper(trim(p_code));
  if target is null then
    raise exception 'No class with that code.';
  end if;

  insert into class_members (class_id, student_id)
  values (target, auth.uid())
  on conflict do nothing;

  return target;
end;
$$;

create or replace function regenerate_join_code(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  fresh text;
begin
  if not is_class_teacher(p_class_id) then
    raise exception 'This class isn''t available.';
  end if;
  fresh := generate_join_code();
  update classes set join_code = fresh where id = p_class_id;
  return fresh;
end;
$$;

revoke execute on function join_class(text) from public, anon;
grant execute on function join_class(text) to authenticated;
revoke execute on function regenerate_join_code(uuid) from public, anon;
grant execute on function regenerate_join_code(uuid) to authenticated;
```

- [ ] **Step 2: Write the RLS check script**

Create `supabase/tests/0009_classroom_rls.sql`:

```sql
-- Hand-run RLS checks for 0009_classroom.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying 0009.
-- Everything happens inside one transaction that rolls back, so no fixture
-- survives. Any failed check raises and aborts with a message naming it; a
-- clean run ends by printing "classroom RLS checks passed".

begin;

-- ── fixtures (as postgres, which bypasses RLS) ──────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000000001', 'rls-teacher@example.test',  '{"role":"teacher","display_name":"Tess Teacher"}'),
  ('00000000-0000-4000-a000-000000000002', 'rls-student@example.test',  '{"role":"student","display_name":"Sam Student"}'),
  ('00000000-0000-4000-a000-000000000003', 'rls-outsider@example.test', '{"role":"student","display_name":"Olive Outsider"}'),
  ('00000000-0000-4000-a000-000000000004', 'rls-general@example.test',  '{"display_name":"Gene General"}'),
  ('00000000-0000-4000-a000-000000000005', 'rls-teacher2@example.test', '{"role":"teacher","display_name":"Theo Teacher"}');

insert into classes (id, teacher_id, name, join_code)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'RLS Biology', 'QWERT9');
insert into class_members (class_id, student_id)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002');
insert into announcements (class_id, title, body)
values ('00000000-0000-4000-b000-000000000001', 'Welcome', 'Hello class');
insert into quizzes (id, teacher_id, title, deck_title)
values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-a000-000000000001', 'Cells quiz', 'Cells');
insert into quiz_questions (quiz_id, order_index, slide_number, prompt, answer)
values ('00000000-0000-4000-d000-000000000001', 0, 2, 'What is a cell?', '"b"');
insert into quiz_classes (quiz_id, class_id)
values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001');
insert into quiz_attempts (quiz_id, class_id, student_id, score)
values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', 0.8);

do $$ begin
  if (select role from profiles where id = '00000000-0000-4000-a000-000000000001') <> 'teacher' then
    raise exception 'sign-up trigger: requested teacher role not applied';
  end if;
  if (select role from profiles where id = '00000000-0000-4000-a000-000000000004') <> 'general' then
    raise exception 'sign-up trigger: absent role should become general';
  end if;
end $$;

set local role authenticated;

-- ── teacher ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from classes) <> 1 then raise exception 'teacher: should see exactly their one class'; end if;
  if (select count(*) from class_members) <> 1 then raise exception 'teacher: should see the member'; end if;
  if (select count(*) from profiles where id = '00000000-0000-4000-a000-000000000002') <> 1 then
    raise exception 'teacher: should read their student''s profile'; end if;
  if (select count(*) from profiles where id = '00000000-0000-4000-a000-000000000003') <> 0 then
    raise exception 'teacher: must not read a student outside their classes'; end if;
  if (select count(*) from announcements) <> 1 then raise exception 'teacher: should see the announcement'; end if;
  if (select count(*) from quiz_questions) <> 1 then raise exception 'teacher: should read own quiz questions'; end if;
  if (select count(*) from quiz_attempts) <> 1 then raise exception 'teacher: should read attempts in their class'; end if;
end $$;

do $$ declare failed boolean := false; begin
  begin
    update profiles set role = 'general' where id = '00000000-0000-4000-a000-000000000001';
  exception when others then failed := true;
  end;
  if not failed then raise exception 'teacher with classes was allowed to change account type'; end if;
end $$;

do $$ begin
  update profiles set email = 'hijack@example.test', display_name = 'Tess T.'
  where id = '00000000-0000-4000-a000-000000000001';
  if (select email from profiles where id = '00000000-0000-4000-a000-000000000001') <> 'rls-teacher@example.test' then
    raise exception 'profile email must not be client-writable'; end if;
  if (select display_name from profiles where id = '00000000-0000-4000-a000-000000000001') <> 'Tess T.' then
    raise exception 'display_name should be writable by its owner'; end if;
end $$;

-- ── second teacher ──────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);

do $$ declare failed boolean := false; begin
  if (select count(*) from classes) <> 0 then raise exception 'teacher2: must not see another teacher''s class'; end if;
  if (select count(*) from class_members) <> 0 then raise exception 'teacher2: must not see another class''s members'; end if;
  if (select count(*) from announcements) <> 0 then raise exception 'teacher2: must not see another class''s announcements'; end if;
  if (select count(*) from quizzes) <> 0 then raise exception 'teacher2: must not see another teacher''s quizzes'; end if;
  if (select count(*) from quiz_attempts) <> 0 then raise exception 'teacher2: must not see another class''s attempts'; end if;
  if (select count(*) from profiles where id = '00000000-0000-4000-a000-000000000002') <> 0 then
    raise exception 'teacher2: must not read another teacher''s student'; end if;
  begin
    insert into announcements (class_id, title) values ('00000000-0000-4000-b000-000000000001', 'Intruder');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'teacher2: posted into another teacher''s class'; end if;
end $$;

-- ── student in the class ────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

do $$ declare failed boolean; begin
  if (select count(*) from classes) <> 1 then raise exception 'student: should see their class'; end if;
  if (select count(*) from class_members) <> 1 then raise exception 'student: should see only their own membership'; end if;
  if (select count(*) from announcements) <> 1 then raise exception 'student: should read the class announcement'; end if;
  if (select count(*) from profiles where id = '00000000-0000-4000-a000-000000000001') <> 1 then
    raise exception 'student: should read their teacher''s profile'; end if;
  if (select count(*) from profiles where id = '00000000-0000-4000-a000-000000000003') <> 0 then
    raise exception 'student: must not read another student''s profile'; end if;
  if (select count(*) from quizzes) <> 1 then raise exception 'student: should see the posted quiz'; end if;
  if (select count(*) from quiz_questions) <> 0 then raise exception 'student: must not read quiz questions (answers)'; end if;
  if (select count(*) from quiz_attempts) <> 1 then raise exception 'student: should read their own attempt'; end if;

  failed := false;
  begin
    insert into announcements (class_id, title) values ('00000000-0000-4000-b000-000000000001', 'Student post');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'student: posted an announcement'; end if;

  failed := false;
  begin
    insert into class_members (class_id, student_id)
    values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'student: inserted a membership directly'; end if;

  failed := false;
  begin
    update profiles set role = 'general' where id = '00000000-0000-4000-a000-000000000002';
  exception when others then failed := true;
  end;
  if not failed then raise exception 'student in a class was allowed to change account type'; end if;

  failed := false;
  begin
    perform regenerate_join_code('00000000-0000-4000-b000-000000000001');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'student: regenerated a join code'; end if;
end $$;

do $$ declare touched integer; begin
  update profiles set display_name = 'hacked' where id = '00000000-0000-4000-a000-000000000003';
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'student: updated another account''s profile'; end if;
end $$;

-- ── student outside the class ───────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);

do $$ declare failed boolean := false; joined uuid; begin
  if (select count(*) from classes) <> 0 then raise exception 'outsider: must not see the class'; end if;
  if (select count(*) from announcements) <> 0 then raise exception 'outsider: must not read announcements'; end if;
  if (select count(*) from quizzes) <> 0 then raise exception 'outsider: must not see quizzes'; end if;
  if (select count(*) from profiles where id = '00000000-0000-4000-a000-000000000001') <> 0 then
    raise exception 'outsider: must not read a teacher they do not have'; end if;

  begin
    perform join_class('ZZZZZ2');
  exception when others then
    if sqlerrm <> 'No class with that code.' then raise exception 'outsider: unexpected join error: %', sqlerrm; end if;
    failed := true;
  end;
  if not failed then raise exception 'outsider: joined with a code that does not exist'; end if;

  joined := join_class(' qwert9 ');
  if joined <> '00000000-0000-4000-b000-000000000001' then raise exception 'outsider: join_class returned the wrong class'; end if;
  perform join_class('QWERT9'); -- joining twice must succeed
  if (select count(*) from classes) <> 1 then raise exception 'outsider: should see the class after joining'; end if;
  if (select count(*) from class_members) <> 1 then raise exception 'outsider: joining twice must not duplicate'; end if;
end $$;

-- ── general account ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);

do $$ declare failed boolean := false; begin
  begin
    perform join_class('QWERT9');
  exception when others then
    if sqlerrm <> 'Only student accounts can join classes.' then raise exception 'general: unexpected join error: %', sqlerrm; end if;
    failed := true;
  end;
  if not failed then raise exception 'general: joined a class'; end if;

  failed := false;
  begin
    insert into classes (name) values ('Not a teacher');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'general: created a class'; end if;
end $$;

-- ── teacher regenerates the code ────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

do $$ declare fresh text; begin
  fresh := regenerate_join_code('00000000-0000-4000-b000-000000000001');
  if fresh = 'QWERT9' or length(fresh) <> 6 then raise exception 'teacher: regenerate did not produce a new 6-character code'; end if;
  if fresh ~ '[01OIL]' then raise exception 'teacher: generated code contains a lookalike character'; end if;
end $$;

select 'classroom RLS checks passed' as result;

rollback;
```

- [ ] **Step 3: Ask the user to apply and verify**

Tell the user: apply `supabase/migrations/0009_classroom.sql` in the Supabase SQL editor, then paste and run `supabase/tests/0009_classroom_rls.sql`.
Expected: a single result row `classroom RLS checks passed`. If a check raises, fix the migration (it is written to be re-runnable: `create or replace`, `drop … if exists`) and re-run both.

Do not proceed to UI testing in later tasks until the user confirms this passed. Pure-logic tasks (2–4) can proceed in parallel.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_classroom.sql supabase/tests/0009_classroom_rls.sql
git commit -m "Classroom schema: profiles, classes, members, announcements, quiz tables, RLS

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 2: Roles, profile resolution, auth store, role guard

**Files:**
- Create: `src/classroom/roles.ts`, `src/classroom/roles.test.ts`
- Create: `src/store/profile.ts`, `src/store/profile.test.ts`
- Modify: `src/store/authStore.ts` (whole file)
- Create: `src/components/auth/RequireRole.tsx`
- Modify: `src/pages/LoginPage.tsx` (one call site, to keep the build green)

**Interfaces:**
- Consumes: `profiles` table and sign-up metadata keys `role`, `display_name` (Task 1).
- Produces:
  - from `@/classroom/roles`: `type Role = 'general' | 'teacher' | 'student'`, `ROLES: readonly Role[]`, `ROLE_LABEL: Record<Role, string>`, `ROLE_HINT: Record<Role, string>`, `parseRole(value: unknown): Role | null`, `canAccess(role: Role, required: Role): boolean`
  - from `@/store/profile`: `interface AccountProfile { role: Role; displayName: string }`, `resolveProfile(row, error): { profile: AccountProfile; degraded: boolean }`
  - `useAuthStore` gains `profile: AccountProfile | null`; `signUp(email, password, details: SignUpDetails)` with `SignUpDetails = { role: Role; displayName: string }`; `updateRole(role: Role): Promise<{ error: string | null }>`
  - `<RequireRole role="teacher" | "student">` from `@/components/auth/RequireRole`

- [ ] **Step 1: Write the failing tests**

`src/classroom/roles.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canAccess, parseRole, ROLES } from './roles'

describe('parseRole', () => {
  it('accepts the three account types', () => {
    for (const role of ROLES) expect(parseRole(role)).toBe(role)
  })

  it('rejects anything else, including near-misses a hand-edited row might hold', () => {
    expect(parseRole('Teacher')).toBeNull()
    expect(parseRole('admin')).toBeNull()
    expect(parseRole('')).toBeNull()
    expect(parseRole(null)).toBeNull()
    expect(parseRole(3)).toBeNull()
  })
})

describe('canAccess', () => {
  it('lets only the matching account type in', () => {
    expect(canAccess('teacher', 'teacher')).toBe(true)
    expect(canAccess('student', 'student')).toBe(true)
    expect(canAccess('student', 'teacher')).toBe(false)
    expect(canAccess('general', 'teacher')).toBe(false)
    expect(canAccess('teacher', 'student')).toBe(false)
  })
})
```

`src/store/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveProfile } from './profile'

/*
  The fallback is the point: an account whose profile cannot be read must land
  on exactly today's app (General), never on a locked screen. An un-migrated
  database is the common way to get here.
*/
describe('resolveProfile', () => {
  it('reads a well-formed row', () => {
    expect(resolveProfile({ role: 'teacher', display_name: 'Tess' }, null)).toEqual({
      profile: { role: 'teacher', displayName: 'Tess' },
      degraded: false,
    })
  })

  it('falls back to general when the read failed', () => {
    expect(resolveProfile(null, { message: 'relation "profiles" does not exist' })).toEqual({
      profile: { role: 'general', displayName: '' },
      degraded: true,
    })
  })

  it('falls back to general when the account has no row', () => {
    expect(resolveProfile(null, null)).toEqual({
      profile: { role: 'general', displayName: '' },
      degraded: true,
    })
  })

  it('falls back to general on an unknown role but keeps the name', () => {
    expect(resolveProfile({ role: 'admin', display_name: 'Ada' }, null)).toEqual({
      profile: { role: 'general', displayName: 'Ada' },
      degraded: true,
    })
  })

  it('treats a non-string name as empty', () => {
    expect(resolveProfile({ role: 'student', display_name: null }, null).profile.displayName).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/classroom/roles.test.ts src/store/profile.test.ts`
Expected: FAIL — cannot resolve `./roles` / `./profile`.

- [ ] **Step 3: Implement `roles.ts` and `profile.ts`**

`src/classroom/roles.ts`:

```ts
/**
 * The three account types.
 *
 * Every type keeps the deck tools; the type only decides which extra area the
 * rail offers — Classroom for a teacher, My classes for a student. Chosen at
 * sign-up and changeable later, with no verification that a teacher is one.
 */
export type Role = 'general' | 'teacher' | 'student'

export const ROLES: readonly Role[] = ['general', 'teacher', 'student']

export const ROLE_LABEL: Record<Role, string> = {
  general: 'General',
  teacher: 'Teacher',
  student: 'Student',
}

export const ROLE_HINT: Record<Role, string> = {
  general: 'Create and present decks.',
  teacher: 'Decks, plus classes, students and quizzes.',
  student: "Decks, plus joining your teachers' classes.",
}

export function parseRole(value: unknown): Role | null {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : null
}

/** Whether an account of `role` may open a page reserved for `required`. */
export function canAccess(role: Role, required: Role): boolean {
  return role === required
}
```

`src/store/profile.ts`:

```ts
import { parseRole, type Role } from '@/classroom/roles'

export interface AccountProfile {
  role: Role
  displayName: string
}

const FALLBACK_ROLE: Role = 'general'

/**
 * A `profiles` row (or the failure to read one) as the profile the app runs on.
 *
 * Anything unusable — a read error, no row, a role this build does not know —
 * resolves to General, which is exactly the app as it was before account types
 * existed. `degraded` tells the caller to log it; this stays pure so the rule
 * is testable.
 */
export function resolveProfile(
  row: { role?: unknown; display_name?: unknown } | null | undefined,
  error: unknown,
): { profile: AccountProfile; degraded: boolean } {
  if (error || !row) {
    return { profile: { role: FALLBACK_ROLE, displayName: '' }, degraded: true }
  }
  const displayName = typeof row.display_name === 'string' ? row.display_name : ''
  const role = parseRole(row.role)
  if (!role) return { profile: { role: FALLBACK_ROLE, displayName }, degraded: true }
  return { profile: { role, displayName }, degraded: false }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/classroom/roles.test.ts src/store/profile.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Rewrite `src/store/authStore.ts`**

Replace the whole file with:

```ts
import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'
import type { Role } from '@/classroom/roles'
import { resolveProfile, type AccountProfile } from './profile'

export interface SignUpDetails {
  role: Role
  displayName: string
}

interface AuthState {
  user: User | null
  /** The account's type and name. `null` until it has resolved, and while signed out. */
  profile: AccountProfile | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  signUp: (
    email: string,
    password: string,
    details: SignUpDetails,
  ) => Promise<{ error: string | null; needsVerification: boolean }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPasswordForEmail: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
  updateRole: (role: Role) => Promise<{ error: string | null }>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  status: supabaseConfigured ? 'loading' : 'unauthenticated',

  async signUp(email, password, details) {
    if (!supabase) return { error: 'Supabase is not configured.', needsVerification: false }
    // The profiles insert trigger (migration 0009) reads these two keys.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role: details.role, display_name: details.displayName.trim() } },
    })
    if (error) return { error: error.message, needsVerification: false }
    return { error: null, needsVerification: !data.session }
  },

  async signIn(email, password) {
    if (!supabase) return { error: 'Supabase is not configured.' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  },

  async signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  },

  async resetPasswordForEmail(email) {
    if (!supabase) return
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  },

  async updatePassword(newPassword) {
    if (!supabase) return { error: 'Supabase is not configured.' }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error: error ? error.message : null }
  },

  async updateRole(role) {
    const user = get().user
    if (!supabase || !user) return { error: 'Log in to change your account type.' }
    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', user.id)
      .select('role, display_name')
      .maybeSingle()
    // The guard trigger's refusal ("Delete or hand off your classes…") is
    // already a sentence the user can act on, so it is shown as-is.
    if (error) return { error: error.message }
    if (!data) {
      return {
        error:
          "Your account profile isn't set up yet — the classroom database migration (0009) may not have been applied.",
      }
    }
    set({ profile: resolveProfile(data, null).profile })
    return { error: null }
  },
}))

// A leftover anonymous session (from before this login feature existed)
// must not count as authenticated — anonymous auth is fully removed.
function realUser(session: Session | null): User | null {
  return session && !session.user.is_anonymous ? session.user : null
}

let profileRequest = 0

/*
  Resolves a session into `user` + `profile` + `status`.

  `status` stays 'loading' until the profile arrives, so RequireAuth never
  renders a page before the account type is known. The one exception is
  load-bearing: Supabase re-emits the session on every token refresh, and
  flipping a signed-in user back to 'loading' then would unmount whatever page
  they are on — the editor included. A refresh for the same user with a profile
  already in hand only swaps the `user` object.

  `profileRequest` discards a read that a newer session has overtaken, so a
  fast sign-out/sign-in cannot apply the previous account's type.
*/
async function applySession(session: Session | null) {
  const user = realUser(session)
  if (!user || !supabase) {
    profileRequest++
    useAuthStore.setState({ user: null, profile: null, status: 'unauthenticated' })
    return
  }

  const current = useAuthStore.getState()
  if (current.user?.id === user.id && current.profile) {
    useAuthStore.setState({ user })
    return
  }

  const request = ++profileRequest
  useAuthStore.setState({ user, profile: null, status: 'loading' })
  const { data, error } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .maybeSingle()
  if (request !== profileRequest) return

  const { profile, degraded } = resolveProfile(data, error)
  if (degraded) {
    console.warn('[auth] No usable profile for this account; treating it as General.', error ?? data)
  }
  useAuthStore.setState({ profile, status: 'authenticated' })
}

// Runs once at module load (this store is an app-wide singleton, same as
// usePresentationStore) — hydrates the current session, then keeps state live
// for login, logout, and the session Supabase creates when a user clicks an
// email-confirmation or password-reset link.
if (supabaseConfigured && supabase) {
  void supabase.auth.getSession().then(({ data }) => applySession(data.session))
  supabase.auth.onAuthStateChange((_event, session) => {
    // Deferred: Supabase documents that awaiting another client call inside
    // this callback can deadlock the auth lock.
    setTimeout(() => void applySession(session), 0)
  })
}
```

- [ ] **Step 6: Create `src/components/auth/RequireRole.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { canAccess, type Role } from '@/classroom/roles'

/**
 * Guards a page reserved for one account type. Always nested inside
 * `RequireAuth`, which has already waited for the profile to resolve.
 *
 * The wrong type is sent home rather than shown an error — nothing is broken,
 * the page just isn't theirs.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const current = useAuthStore((s) => s.profile?.role ?? 'general')
  if (!canAccess(current, role)) return <Navigate to="/" replace />
  return <>{children}</>
}
```

- [ ] **Step 7: Keep the existing `signUp` call compiling**

In `src/pages/LoginPage.tsx`, change

```ts
      const { error, needsVerification } = await signUp(email, password)
```

to

```ts
      const { error, needsVerification } = await signUp(email, password, {
        role: 'general',
        displayName: '',
      })
```

Task 6 replaces these literals with the form's values.

- [ ] **Step 8: Verify**

Run: `npm run build` — Expected: exit 0.
Run: `npm run test` — Expected: all pass (the 8 new tests included).
Run: `npm run lint` — Expected: 0 errors (pre-existing warnings only).

Manual: with the dev server running, log in as an existing account. The dashboard loads as before, and the console shows no `[auth]` warning once migration 0009 is applied (with it unapplied, one warning and the dashboard still loads).

- [ ] **Step 9: Commit**

```bash
git add src/classroom/roles.ts src/classroom/roles.test.ts src/store/profile.ts src/store/profile.test.ts src/store/authStore.ts src/components/auth/RequireRole.tsx src/pages/LoginPage.tsx
git commit -m "Account types: load profile with the session, role guard, updateRole

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 3: Classroom domain types and pure logic

**Files:**
- Create: `src/classroom/types.ts`
- Create: `src/classroom/joinCode.ts`, `src/classroom/joinCode.test.ts`
- Create: `src/classroom/slideRange.ts`, `src/classroom/slideRange.test.ts`
- Create: `src/classroom/format.ts`, `src/classroom/format.test.ts`
- Create: `src/classroom/stats.ts`, `src/classroom/stats.test.ts`
- Create: `src/classroom/select.ts`, `src/classroom/select.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (exact names later tasks import):
  - `types.ts`: `Person`, `ClassRoom`, `ClassDetails`, `Member`, `Announcement`, `AnnouncementDetails`, `QuizSummary`, `Posting`, `Attempt`, `TeacherClassroom`, `StudentClassroom`
  - `joinCode.ts`: `JOIN_CODE_ALPHABET`, `JOIN_CODE_LENGTH`, `normalizeJoinCode(input: string): string`, `joinCodeProblem(input: string): string | null`
  - `slideRange.ts`: `formatSlideRange(numbers: readonly number[]): string`
  - `format.ts`: `formatPercent(ratio: number | null): string`, `formatCompletion(s: { expected: number; submitted: number }): string`, `personLabel(p: Person): string`, `matchesQuery(query: string, ...fields: string[]): boolean`, `describeTrend(t: Trend): string`, `plural(count: number, one: string, many?: string): string`, `formatDate(iso: string): string`
  - `stats.ts`: `TREND_WINDOW`, `TREND_THRESHOLD`, `type Trend`, `type TrendDirection`, `HistoryEntry`, `ScorePoint`, `StudentStats`, `ClassroomRecords`, `RosterEntry`, `studentStats(studentId, records, classId?)`, `trendOf(scores)`, `rosterOf(members, people, classId?)`
  - `select.ts`: `type QuizSort = 'newest' | 'oldest'`, `selectQuizzes(quizzes, postings, options: { query: string; classId: string; sort: QuizSort }): QuizSummary[]` (`classId === ''` means all classes)

- [ ] **Step 1: Create `src/classroom/types.ts`**

```ts
/*
  The classroom as the app sees it — camelCase, parsed, never a raw row.
  Rows become these in `rows.ts`; nothing else in the app touches row shapes.
  Timestamps stay ISO strings as Supabase returns them.
*/

/** Anyone shown by name: a student on a roster, a teacher on a class card. */
export interface Person {
  id: string
  displayName: string
  email: string
}

export interface ClassRoom {
  id: string
  teacherId: string
  name: string
  description: string
  joinCode: string
  createdAt: string
}

export interface ClassDetails {
  name: string
  description: string
}

export interface Member {
  classId: string
  studentId: string
  joinedAt: string
}

export interface Announcement {
  id: string
  classId: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface AnnouncementDetails {
  title: string
  body: string
}

export interface QuizSummary {
  id: string
  title: string
  deckTitle: string
  /** `null` once the source deck has been deleted. */
  presentationId: string | null
  createdAt: string
  /** 1-based slide numbers the questions cite, one entry per question. */
  slideNumbers: number[]
}

/** A quiz posted to a class. */
export interface Posting {
  quizId: string
  classId: string
  postedAt: string
}

export interface Attempt {
  quizId: string
  classId: string
  studentId: string
  /** 0–1. */
  score: number
  submittedAt: string
}

/** Everything a teacher's classroom pages read, loaded in one go. */
export interface TeacherClassroom {
  classes: ClassRoom[]
  members: Member[]
  students: Person[]
  announcements: Announcement[]
  quizzes: QuizSummary[]
  postings: Posting[]
  attempts: Attempt[]
}

/** Everything a student's class pages read. */
export interface StudentClassroom {
  classes: ClassRoom[]
  teachers: Person[]
  announcements: Announcement[]
}
```

- [ ] **Step 2: Write the failing tests for `joinCode`, `slideRange`, `format`**

`src/classroom/joinCode.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { JOIN_CODE_ALPHABET, joinCodeProblem, normalizeJoinCode } from './joinCode'

describe('normalizeJoinCode', () => {
  it('uppercases and strips every kind of whitespace, so a pasted code just works', () => {
    expect(normalizeJoinCode(' qw ert9\n')).toBe('QWERT9')
  })
})

describe('joinCodeProblem', () => {
  it('accepts a well-formed code in any case', () => {
    expect(joinCodeProblem('qwert9')).toBeNull()
  })

  it('asks for a code when the field is empty', () => {
    expect(joinCodeProblem('   ')).toBe('Enter the code your teacher gave you.')
  })

  it('rejects the wrong length', () => {
    expect(joinCodeProblem('QWERT')).toBe('Class codes are 6 characters.')
    expect(joinCodeProblem('QWERT99')).toBe('Class codes are 6 characters.')
  })

  it('rejects the lookalike characters codes never contain', () => {
    for (const lookalike of ['0', 'O', '1', 'I', 'L']) {
      expect(JOIN_CODE_ALPHABET).not.toContain(lookalike)
      expect(joinCodeProblem(`QWER${lookalike}9`)).toMatch(/never use/)
    }
  })
})
```

`src/classroom/slideRange.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatSlideRange } from './slideRange'

describe('formatSlideRange', () => {
  it('is empty when no slide is cited', () => {
    expect(formatSlideRange([])).toBe('')
  })

  it('names a single slide in the singular', () => {
    expect(formatSlideRange([3])).toBe('slide 3')
  })

  it('collapses a contiguous run', () => {
    expect(formatSlideRange([2, 3, 4, 5])).toBe('slides 2–5')
  })

  it('keeps separate runs and singles apart', () => {
    expect(formatSlideRange([2, 3, 4, 5, 8])).toBe('slides 2–5, 8')
  })

  it('sorts, and counts a slide cited by several questions once', () => {
    expect(formatSlideRange([5, 2, 2, 3, 4])).toBe('slides 2–5')
  })

  it('treats one slide cited twice as a single slide', () => {
    expect(formatSlideRange([4, 4])).toBe('slide 4')
  })
})
```

`src/classroom/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { describeTrend, formatCompletion, formatPercent, matchesQuery, personLabel, plural } from './format'

describe('formatPercent', () => {
  it('shows a dash, not 0%, when there is nothing to average', () => {
    expect(formatPercent(null)).toBe('—')
  })

  it('rounds to a whole percent', () => {
    expect(formatPercent(0.826)).toBe('83%')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
  })
})

describe('formatCompletion', () => {
  it('shows a dash when nothing was expected', () => {
    expect(formatCompletion({ expected: 0, submitted: 0 })).toBe('—')
  })

  it('shows submitted out of expected', () => {
    expect(formatCompletion({ expected: 9, submitted: 7 })).toBe('7 / 9')
  })
})

describe('personLabel', () => {
  const person = { id: 'p', displayName: '', email: '' }

  it('prefers the display name', () => {
    expect(personLabel({ ...person, displayName: ' Sam ', email: 'sam@x.test' })).toBe('Sam')
  })

  it('falls back to the email, then to a placeholder', () => {
    expect(personLabel({ ...person, email: 'sam@x.test' })).toBe('sam@x.test')
    expect(personLabel(person)).toBe('Unnamed account')
  })
})

describe('matchesQuery', () => {
  it('matches everything on a blank query', () => {
    expect(matchesQuery('  ', 'anything')).toBe(true)
  })

  it('matches any field, case-insensitively', () => {
    expect(matchesQuery('BIO', 'Chemistry', 'Biology')).toBe(true)
    expect(matchesQuery('physics', 'Chemistry', 'Biology')).toBe(false)
  })
})

describe('describeTrend', () => {
  it('says so when there are too few scores', () => {
    expect(describeTrend({ kind: 'insufficient' })).toBe('Not enough data')
  })

  it('reports direction and size in percentage points', () => {
    expect(describeTrend({ kind: 'trend', direction: 'improving', delta: 0.083 })).toBe('Improving (+8 pts)')
    expect(describeTrend({ kind: 'trend', direction: 'slipping', delta: -0.06 })).toBe('Slipping (−6 pts)')
    expect(describeTrend({ kind: 'trend', direction: 'steady', delta: 0.01 })).toBe('Steady')
  })
})

describe('plural', () => {
  it('picks the form by count', () => {
    expect(plural(1, 'student')).toBe('1 student')
    expect(plural(0, 'student')).toBe('0 students')
    expect(plural(2, 'quiz', 'quizzes')).toBe('2 quizzes')
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/classroom/joinCode.test.ts src/classroom/slideRange.test.ts src/classroom/format.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `joinCode.ts`, `slideRange.ts`, `format.ts`**

`src/classroom/joinCode.ts`:

```ts
/*
  Must match generate_join_code() in migration 0009 exactly. The alphabet leaves
  out 0/O, 1/I and L because codes are read off a projector and typed by hand.
*/
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const JOIN_CODE_LENGTH = 6

export function normalizeJoinCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}

/** Why a typed code cannot be right, checked before asking the server. `null` when it could be. */
export function joinCodeProblem(input: string): string | null {
  const code = normalizeJoinCode(input)
  if (!code) return 'Enter the code your teacher gave you.'
  if (code.length !== JOIN_CODE_LENGTH) return `Class codes are ${JOIN_CODE_LENGTH} characters.`
  if ([...code].some((ch) => !JOIN_CODE_ALPHABET.includes(ch))) {
    return "That isn't a valid class code. Codes never use 0, O, 1, I or L — check for a lookalike."
  }
  return null
}
```

`src/classroom/slideRange.ts`:

```ts
/**
 * "slides 2–5, 8" — which slides a quiz's questions came from.
 *
 * Several questions often cite one slide, so duplicates count once, and the
 * singular form depends on distinct slides rather than on questions.
 */
export function formatSlideRange(numbers: readonly number[]): string {
  const slides = [...new Set(numbers)]
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b)
  if (slides.length === 0) return ''

  const runs: string[] = []
  let start = slides[0]
  let previous = slides[0]
  const close = () => runs.push(start === previous ? `${start}` : `${start}–${previous}`)

  for (const n of slides.slice(1)) {
    if (n === previous + 1) {
      previous = n
      continue
    }
    close()
    start = n
    previous = n
  }
  close()

  return `${slides.length === 1 ? 'slide' : 'slides'} ${runs.join(', ')}`
}
```

`src/classroom/format.ts`:

```ts
import type { Trend } from './stats'
import type { Person } from './types'

/** A 0–1 ratio as a whole percent; `null` (nothing to measure) as a dash, never 0%. */
export function formatPercent(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)}%`
}

/** "7 / 9", or a dash when nothing was expected — no quizzes posted is not failing. */
export function formatCompletion(stats: { expected: number; submitted: number }): string {
  return stats.expected === 0 ? '—' : `${stats.submitted} / ${stats.expected}`
}

export function personLabel(person: Person): string {
  return person.displayName.trim() || person.email.trim() || 'Unnamed account'
}

/** Case-insensitive substring match on any field. A blank query matches everything. */
export function matchesQuery(query: string, ...fields: string[]): boolean {
  const q = query.trim().toLowerCase()
  return !q || fields.some((field) => field.toLowerCase().includes(q))
}

export function describeTrend(trend: Trend): string {
  if (trend.kind === 'insufficient') return 'Not enough data'
  if (trend.direction === 'steady') return 'Steady'
  const points = Math.round(Math.abs(trend.delta) * 100)
  return trend.direction === 'improving' ? `Improving (+${points} pts)` : `Slipping (−${points} pts)`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run src/classroom/joinCode.test.ts src/classroom/slideRange.test.ts src/classroom/format.test.ts`
Expected: PASS (22 tests). `format.ts` imports `Trend` from `./stats` with `import type`, which Vitest erases, so the missing `stats.ts` does not break these; `npm run build` would, which is why the build check waits until Step 10.

- [ ] **Step 6: Write the failing tests for `stats` and `select`**

`src/classroom/stats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rosterOf, studentStats, trendOf } from './stats'
import type { Attempt, Member, Person, Posting } from './types'

const day = (d: number, hour = 9) => `2026-09-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+00:00`
const member = (studentId: string, classId: string): Member => ({ studentId, classId, joinedAt: day(1) })
const posting = (quizId: string, classId: string, d: number): Posting => ({ quizId, classId, postedAt: day(d) })
const attempt = (quizId: string, classId: string, studentId: string, score: number, d: number): Attempt => ({
  quizId,
  classId,
  studentId,
  score,
  submittedAt: day(d, 15),
})

describe('studentStats', () => {
  it('reports nothing expected as null completion and null average, not zeroes', () => {
    const stats = studentStats('s1', { members: [member('s1', 'A')], postings: [], attempts: [] })
    expect(stats.expected).toBe(0)
    expect(stats.completion).toBeNull()
    expect(stats.average).toBeNull()
    expect(stats.trend).toEqual({ kind: 'insufficient' })
  })

  it('lets a missing quiz lower completion but never the average', () => {
    const stats = studentStats('s1', {
      members: [member('s1', 'A')],
      postings: [posting('q1', 'A', 2), posting('q2', 'A', 3)],
      attempts: [attempt('q1', 'A', 's1', 0.9, 2)],
    })
    expect(stats.expected).toBe(2)
    expect(stats.submitted).toBe(1)
    expect(stats.completion).toBe(0.5)
    expect(stats.average).toBe(0.9)
  })

  it('counts a quiz posted to two of the student’s classes once per class', () => {
    const stats = studentStats('s1', {
      members: [member('s1', 'A'), member('s1', 'B')],
      postings: [posting('q1', 'A', 2), posting('q1', 'B', 2)],
      attempts: [attempt('q1', 'A', 's1', 0.7, 3)],
    })
    expect(stats.expected).toBe(2)
    expect(stats.submitted).toBe(1)
  })

  it('scopes to one class when given a classId', () => {
    const records = {
      members: [member('s1', 'A'), member('s1', 'B')],
      postings: [posting('q1', 'A', 2), posting('q2', 'B', 2)],
      attempts: [attempt('q1', 'A', 's1', 0.6, 3), attempt('q2', 'B', 's1', 1, 3)],
    }
    const scoped = studentStats('s1', records, 'B')
    expect(scoped.expected).toBe(1)
    expect(scoped.average).toBe(1)
  })

  it('ignores attempts in a class the student is no longer a member of', () => {
    const stats = studentStats('s1', {
      members: [member('s1', 'A')],
      postings: [posting('q1', 'A', 2), posting('q2', 'B', 2)],
      attempts: [attempt('q2', 'B', 's1', 0.1, 3)],
    })
    expect(stats.expected).toBe(1)
    expect(stats.submitted).toBe(0)
    expect(stats.average).toBeNull()
  })

  it('ignores other students’ attempts', () => {
    const stats = studentStats('s1', {
      members: [member('s1', 'A'), member('s2', 'A')],
      postings: [posting('q1', 'A', 2)],
      attempts: [attempt('q1', 'A', 's2', 1, 3)],
    })
    expect(stats.submitted).toBe(0)
  })

  it('lists history newest posting first, marks missing quizzes, and orders points chronologically', () => {
    const stats = studentStats('s1', {
      members: [member('s1', 'A')],
      postings: [posting('q1', 'A', 2), posting('q2', 'A', 5), posting('q3', 'A', 8)],
      attempts: [attempt('q3', 'A', 's1', 0.5, 9), attempt('q1', 'A', 's1', 0.9, 3)],
    })
    expect(stats.history.map((h) => h.quizId)).toEqual(['q3', 'q2', 'q1'])
    expect(stats.history[1].attempt).toBeNull()
    expect(stats.points.map((p) => p.score)).toEqual([0.9, 0.5])
  })
})

describe('trendOf', () => {
  it('needs at least four scores', () => {
    expect(trendOf([])).toEqual({ kind: 'insufficient' })
    expect(trendOf([0.5, 0.6, 0.7])).toEqual({ kind: 'insufficient' })
  })

  it('compares the latest three with what came before, even when fewer than three came before', () => {
    expect(trendOf([0.4, 0.8, 0.8, 0.8])).toMatchObject({ kind: 'trend', direction: 'improving' })
  })

  it('treats exactly five points as steady, despite floating-point noise', () => {
    expect(trendOf([0.7, 0.7, 0.7, 0.75, 0.75, 0.75])).toMatchObject({ direction: 'steady', delta: 0.05 })
  })

  it('calls more than five points improving or slipping', () => {
    expect(trendOf([0.7, 0.7, 0.7, 0.76, 0.76, 0.76])).toMatchObject({ direction: 'improving' })
    expect(trendOf([0.7, 0.7, 0.7, 0.64, 0.64, 0.64])).toMatchObject({ direction: 'slipping' })
  })

  it('looks only at the last six scores', () => {
    expect(trendOf([0, 0, 0, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8])).toMatchObject({ direction: 'steady' })
  })
})

describe('rosterOf', () => {
  const people: Person[] = [
    { id: 's1', displayName: 'Zoe', email: 'zoe@x.test' },
    { id: 's2', displayName: 'Adam', email: 'adam@x.test' },
  ]

  it('lists each student once with every class they are in, sorted by name', () => {
    const roster = rosterOf([member('s1', 'A'), member('s2', 'A'), member('s1', 'B')], people)
    expect(roster.map((r) => r.student.displayName)).toEqual(['Adam', 'Zoe'])
    expect(roster[1].classIds).toEqual(['A', 'B'])
  })

  it('scopes to one class', () => {
    expect(rosterOf([member('s1', 'A'), member('s2', 'B')], people, 'B').map((r) => r.student.id)).toEqual(['s2'])
  })

  it('keeps a member whose profile could not be read rather than hiding them', () => {
    const roster = rosterOf([member('ghost', 'A')], people)
    expect(roster).toEqual([{ student: { id: 'ghost', displayName: '', email: '' }, classIds: ['A'] }])
  })
})
```

`src/classroom/select.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { selectQuizzes } from './select'
import type { Posting, QuizSummary } from './types'

const quiz = (id: string, title: string, createdAt: string): QuizSummary => ({
  id,
  title,
  deckTitle: `${title} deck`,
  presentationId: null,
  createdAt,
  slideNumbers: [],
})

const quizzes = [
  quiz('q1', 'Cells', '2026-09-01T00:00:00+00:00'),
  quiz('q2', 'Atoms', '2026-09-05T00:00:00+00:00'),
  quiz('q3', 'Plants', '2026-09-03T00:00:00+00:00'),
]
const postings: Posting[] = [{ quizId: 'q3', classId: 'A', postedAt: '2026-09-04T00:00:00+00:00' }]

describe('selectQuizzes', () => {
  it('sorts newest first by default order option', () => {
    expect(selectQuizzes(quizzes, postings, { query: '', classId: '', sort: 'newest' }).map((q) => q.id)).toEqual([
      'q2',
      'q3',
      'q1',
    ])
  })

  it('sorts oldest first', () => {
    expect(selectQuizzes(quizzes, postings, { query: '', classId: '', sort: 'oldest' }).map((q) => q.id)).toEqual([
      'q1',
      'q3',
      'q2',
    ])
  })

  it('keeps only quizzes posted to the chosen class', () => {
    expect(selectQuizzes(quizzes, postings, { query: '', classId: 'A', sort: 'newest' }).map((q) => q.id)).toEqual(['q3'])
  })

  it('searches the title and the deck title', () => {
    expect(selectQuizzes(quizzes, postings, { query: 'atoms DECK', classId: '', sort: 'newest' }).map((q) => q.id)).toEqual(['q2'])
  })

  it('does not reorder the array it was given', () => {
    const input = [...quizzes]
    selectQuizzes(input, postings, { query: '', classId: '', sort: 'newest' })
    expect(input.map((q) => q.id)).toEqual(['q1', 'q2', 'q3'])
  })
})
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run src/classroom/stats.test.ts src/classroom/select.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 8: Implement `stats.ts` and `select.ts`**

`src/classroom/stats.ts`:

```ts
import { personLabel } from './format'
import type { Attempt, Member, Person, Posting } from './types'

/*
  Every performance statistic, defined once.

  - Expected: every (quiz, class) posting for a class the student is in. There
    are no due dates, so joining late still expects earlier quizzes.
  - Completion: submitted ÷ expected; `null` when nothing is expected, because
    a student with nothing posted is not failing.
  - Average: mean of submitted scores only. A missing quiz is already counted
    by completion; scoring it as zero too would punish one absence twice.
  - Trend: the latest TREND_WINDOW scores against the up-to-TREND_WINDOW before
    them. Needs more than TREND_WINDOW scores.

  An attempt only counts against a posting the student is currently expected
  to take, so leaving a class takes its scores out of the picture with it.
*/

export const TREND_WINDOW = 3
/** Five percentage points, as a 0–1 ratio. */
export const TREND_THRESHOLD = 0.05

export type TrendDirection = 'improving' | 'steady' | 'slipping'
export type Trend = { kind: 'insufficient' } | { kind: 'trend'; direction: TrendDirection; delta: number }

export interface HistoryEntry {
  quizId: string
  classId: string
  postedAt: string
  attempt: Attempt | null
}

export interface ScorePoint {
  submittedAt: string
  score: number
}

export interface StudentStats {
  expected: number
  submitted: number
  completion: number | null
  average: number | null
  trend: Trend
  /** Submitted scores, oldest first — what a chart draws. */
  points: ScorePoint[]
  /** One entry per expected posting, newest posting first. */
  history: HistoryEntry[]
}

export interface ClassroomRecords {
  members: readonly Member[]
  postings: readonly Posting[]
  attempts: readonly Attempt[]
}

export interface RosterEntry {
  student: Person
  classIds: string[]
}

const time = (iso: string) => Date.parse(iso)
const keyOf = (quizId: string, classId: string) => `${quizId}|${classId}`
const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

export function studentStats(studentId: string, records: ClassroomRecords, classId?: string): StudentStats {
  const classIds = new Set(
    records.members
      .filter((m) => m.studentId === studentId && (classId === undefined || m.classId === classId))
      .map((m) => m.classId),
  )
  const attempts = new Map(
    records.attempts.filter((a) => a.studentId === studentId).map((a) => [keyOf(a.quizId, a.classId), a]),
  )

  const history: HistoryEntry[] = records.postings
    .filter((p) => classIds.has(p.classId))
    .map((p) => ({
      quizId: p.quizId,
      classId: p.classId,
      postedAt: p.postedAt,
      attempt: attempts.get(keyOf(p.quizId, p.classId)) ?? null,
    }))
    .sort((a, b) => time(b.postedAt) - time(a.postedAt))

  const points: ScorePoint[] = history
    .flatMap((entry) => (entry.attempt ? [{ submittedAt: entry.attempt.submittedAt, score: entry.attempt.score }] : []))
    .sort((a, b) => time(a.submittedAt) - time(b.submittedAt))

  const expected = history.length
  const submitted = points.length
  const scores = points.map((p) => p.score)

  return {
    expected,
    submitted,
    completion: expected === 0 ? null : submitted / expected,
    average: submitted === 0 ? null : mean(scores),
    trend: trendOf(scores),
    points,
    history,
  }
}

export function trendOf(scores: readonly number[]): Trend {
  if (scores.length <= TREND_WINDOW) return { kind: 'insufficient' }
  const recent = scores.slice(-TREND_WINDOW)
  const before = scores.slice(-2 * TREND_WINDOW, -TREND_WINDOW)
  // Rounded so a difference of exactly five points is not tipped over the
  // threshold by floating-point noise (0.75 - 0.7 is 0.05000000000000004).
  const delta = Math.round((mean(recent) - mean(before)) * 1e9) / 1e9
  const direction: TrendDirection =
    delta > TREND_THRESHOLD ? 'improving' : delta < -TREND_THRESHOLD ? 'slipping' : 'steady'
  return { kind: 'trend', direction, delta }
}

/**
 * Each student once, with the classes they are in, sorted by name.
 *
 * A member whose profile did not come back is kept under a blank Person
 * rather than dropped — a roster that silently loses a student is worse than
 * one that shows "Unnamed account".
 */
export function rosterOf(
  members: readonly Member[],
  people: readonly Person[],
  classId?: string,
): RosterEntry[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const classesByStudent = new Map<string, string[]>()
  for (const m of members) {
    if (classId !== undefined && m.classId !== classId) continue
    const list = classesByStudent.get(m.studentId) ?? []
    list.push(m.classId)
    classesByStudent.set(m.studentId, list)
  }
  return [...classesByStudent]
    .map(([id, classIds]) => ({
      student: byId.get(id) ?? { id, displayName: '', email: '' },
      classIds,
    }))
    .sort((a, b) => personLabel(a.student).localeCompare(personLabel(b.student)))
}
```

`src/classroom/select.ts`:

```ts
import { matchesQuery } from './format'
import type { Posting, QuizSummary } from './types'

export type QuizSort = 'newest' | 'oldest'

/** Search + class filter + sort for the Quizzes list, in one pass. `classId === ''` is all classes. */
export function selectQuizzes(
  quizzes: readonly QuizSummary[],
  postings: readonly Posting[],
  options: { query: string; classId: string; sort: QuizSort },
): QuizSummary[] {
  const inClass = options.classId
    ? new Set(postings.filter((p) => p.classId === options.classId).map((p) => p.quizId))
    : null
  const direction = options.sort === 'newest' ? -1 : 1
  return quizzes
    .filter((q) => (!inClass || inClass.has(q.id)) && matchesQuery(options.query, q.title, q.deckTitle))
    .sort((a, b) => direction * (Date.parse(a.createdAt) - Date.parse(b.createdAt)))
}
```

- [ ] **Step 9: Run every classroom test to verify they pass**

Run: `npx vitest run src/classroom`
Expected: PASS — joinCode (5), slideRange (6), format (11), stats (15), select (5), roles (3).

- [ ] **Step 10: Typecheck and lint**

Run: `npm run build` — Expected: exit 0.
Run: `npm run lint` — Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add src/classroom/types.ts src/classroom/joinCode.ts src/classroom/joinCode.test.ts src/classroom/slideRange.ts src/classroom/slideRange.test.ts src/classroom/format.ts src/classroom/format.test.ts src/classroom/stats.ts src/classroom/stats.test.ts src/classroom/select.ts src/classroom/select.test.ts
git commit -m "Classroom domain: types, join codes, slide ranges, stats, formatting

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 4: Row mapping, data access, loading hooks

**Files:**
- Create: `src/classroom/rows.ts`, `src/classroom/rows.test.ts`
- Create: `src/classroom/api.ts`
- Create: `src/classroom/useAsync.ts`
- Create: `src/classroom/useMyClasses.ts`

**Interfaces:**
- Consumes: Task 1 tables/RPCs; Task 3 `types.ts`, `normalizeJoinCode`; `supabase`, `supabaseConfigured`, `ensureSession` from `@/lib/supabaseClient`; `describeError` from `@/store/presentationStore`.
- Produces:
  - `api.ts`: `listMyClasses(): Promise<ClassRoom[]>`, `loadTeacherClassroom(): Promise<TeacherClassroom>`, `loadStudentClassroom(): Promise<StudentClassroom>`, `createClass(d: ClassDetails): Promise<ClassRoom>`, `updateClass(id: string, d: ClassDetails): Promise<void>`, `deleteClass(id: string): Promise<void>`, `regenerateJoinCode(classId: string): Promise<string>`, `joinClass(code: string): Promise<string>`, `removeMembership(classId: string, studentId: string): Promise<void>`, `createAnnouncement(classId: string, d: AnnouncementDetails): Promise<void>`, `updateAnnouncement(id: string, d: AnnouncementDetails): Promise<void>`, `deleteAnnouncement(id: string): Promise<void>`
  - `useAsync.ts`: `type AsyncState<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: T }`, `useAsync<T>(load: () => Promise<T>, key: string): { state: AsyncState<T>; reload: () => void }`
  - `useMyClasses.ts`: `useMyClasses(userId: string | null, enabled: boolean): ClassRoom[] | null`, `invalidateMyClasses(): void`

- [ ] **Step 1: Write the failing test**

`src/classroom/rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { announcementFromRow, attemptFromRow, classFromRow, memberFromRow, personFromRow, postingFromRow, quizFromRow } from './rows'

describe('row mapping', () => {
  it('maps a class, defaulting a null description to empty', () => {
    expect(
      classFromRow({
        id: 'c1',
        teacher_id: 't1',
        name: 'Biology',
        description: null,
        join_code: 'QWERT9',
        created_at: '2026-09-01T00:00:00+00:00',
      }),
    ).toEqual({ id: 'c1', teacherId: 't1', name: 'Biology', description: '', joinCode: 'QWERT9', createdAt: '2026-09-01T00:00:00+00:00' })
  })

  it('maps a person with missing name and email to empty strings', () => {
    expect(personFromRow({ id: 'p1', display_name: null, email: null })).toEqual({ id: 'p1', displayName: '', email: '' })
  })

  it('keeps a quiz whose deck was deleted, and collects cited slides', () => {
    expect(
      quizFromRow({
        id: 'q1',
        title: 'Cells quiz',
        deck_title: 'Cells',
        presentation_id: null,
        created_at: '2026-09-02T00:00:00+00:00',
        quiz_questions: [{ slide_number: 2 }, { slide_number: 3 }],
      }),
    ).toEqual({ id: 'q1', title: 'Cells quiz', deckTitle: 'Cells', presentationId: null, createdAt: '2026-09-02T00:00:00+00:00', slideNumbers: [2, 3] })
  })

  it('treats absent embedded questions as no slides', () => {
    expect(
      quizFromRow({ id: 'q1', title: 't', deck_title: 'd', presentation_id: 'p1', created_at: 'x', quiz_questions: null }).slideNumbers,
    ).toEqual([])
  })

  it('reads a numeric score that arrives as a string', () => {
    expect(
      attemptFromRow({ quiz_id: 'q1', class_id: 'c1', student_id: 's1', score: '0.85', submitted_at: 'x' }).score,
    ).toBe(0.85)
  })

  it('maps members, postings and announcements', () => {
    expect(memberFromRow({ class_id: 'c1', student_id: 's1', joined_at: 'j' })).toEqual({ classId: 'c1', studentId: 's1', joinedAt: 'j' })
    expect(postingFromRow({ quiz_id: 'q1', class_id: 'c1', posted_at: 'p' })).toEqual({ quizId: 'q1', classId: 'c1', postedAt: 'p' })
    expect(
      announcementFromRow({ id: 'a1', class_id: 'c1', title: 'Hi', body: null, created_at: 'c', updated_at: 'u' }),
    ).toEqual({ id: 'a1', classId: 'c1', title: 'Hi', body: '', createdAt: 'c', updatedAt: 'u' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/classroom/rows.test.ts`
Expected: FAIL — cannot resolve `./rows`.

- [ ] **Step 3: Implement `rows.ts`**

```ts
import type { Announcement, Attempt, ClassRoom, Member, Person, Posting, QuizSummary } from './types'

/*
  Row shapes exactly as PostgREST returns them, the column lists that request
  them, and the mapping to app types. Kept together so a column cannot be
  selected under one name and read under another.
*/

export const PERSON_COLUMNS = 'id, display_name, email'
export const CLASS_COLUMNS = 'id, teacher_id, name, description, join_code, created_at'
export const MEMBER_COLUMNS = 'class_id, student_id, joined_at'
export const ANNOUNCEMENT_COLUMNS = 'id, class_id, title, body, created_at, updated_at'
export const QUIZ_COLUMNS = 'id, title, deck_title, presentation_id, created_at, quiz_questions(slide_number)'
export const POSTING_COLUMNS = 'quiz_id, class_id, posted_at'
export const ATTEMPT_COLUMNS = 'quiz_id, class_id, student_id, score, submitted_at'

export interface PersonRow {
  id: string
  display_name: string | null
  email: string | null
}

export interface ClassRow {
  id: string
  teacher_id: string
  name: string
  description: string | null
  join_code: string
  created_at: string
}

export interface MemberRow {
  class_id: string
  student_id: string
  joined_at: string
}

export interface AnnouncementRow {
  id: string
  class_id: string
  title: string
  body: string | null
  created_at: string
  updated_at: string
}

export interface QuizRow {
  id: string
  title: string
  deck_title: string
  presentation_id: string | null
  created_at: string
  quiz_questions?: { slide_number: number }[] | null
}

export interface PostingRow {
  quiz_id: string
  class_id: string
  posted_at: string
}

export interface AttemptRow {
  quiz_id: string
  class_id: string
  student_id: string
  /** Postgres `numeric` — a number in JSON, but read defensively. */
  score: number | string
  submitted_at: string
}

export function personFromRow(row: PersonRow): Person {
  return { id: row.id, displayName: row.display_name ?? '', email: row.email ?? '' }
}

export function classFromRow(row: ClassRow): ClassRoom {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    name: row.name,
    description: row.description ?? '',
    joinCode: row.join_code,
    createdAt: row.created_at,
  }
}

export function memberFromRow(row: MemberRow): Member {
  return { classId: row.class_id, studentId: row.student_id, joinedAt: row.joined_at }
}

export function announcementFromRow(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    body: row.body ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function quizFromRow(row: QuizRow): QuizSummary {
  return {
    id: row.id,
    title: row.title,
    deckTitle: row.deck_title,
    presentationId: row.presentation_id,
    createdAt: row.created_at,
    slideNumbers: (row.quiz_questions ?? []).map((q) => q.slide_number),
  }
}

export function postingFromRow(row: PostingRow): Posting {
  return { quizId: row.quiz_id, classId: row.class_id, postedAt: row.posted_at }
}

export function attemptFromRow(row: AttemptRow): Attempt {
  return {
    quizId: row.quiz_id,
    classId: row.class_id,
    studentId: row.student_id,
    score: Number(row.score),
    submittedAt: row.submitted_at,
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/classroom/rows.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement `api.ts`**

```ts
import { ensureSession, supabase, supabaseConfigured } from '@/lib/supabaseClient'
import { normalizeJoinCode } from './joinCode'
import {
  ANNOUNCEMENT_COLUMNS,
  ATTEMPT_COLUMNS,
  CLASS_COLUMNS,
  MEMBER_COLUMNS,
  PERSON_COLUMNS,
  POSTING_COLUMNS,
  QUIZ_COLUMNS,
  announcementFromRow,
  attemptFromRow,
  classFromRow,
  memberFromRow,
  personFromRow,
  postingFromRow,
  quizFromRow,
  type AnnouncementRow,
  type AttemptRow,
  type ClassRow,
  type MemberRow,
  type PersonRow,
  type PostingRow,
  type QuizRow,
} from './rows'
import type {
  AnnouncementDetails,
  ClassDetails,
  ClassRoom,
  StudentClassroom,
  TeacherClassroom,
} from './types'

/*
  Every classroom read and write. Pages call these and never build a query —
  the same rule briefDrafts.ts follows — so RLS assumptions live in one file.

  Errors are thrown as Supabase hands them back (plain objects); pages pass
  them through `describeError`. RPC refusals are re-thrown as `Error` with the
  bare message, because the SQL raises sentences meant for the user and the
  error code appended by `describeError` would only clutter them.
*/

type Result = { data: unknown; error: unknown }

async function db() {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  await ensureSession()
  return supabase
}

function many<T>(result: Result): T[] {
  if (result.error) throw result.error
  return (result.data ?? []) as T[]
}

/**
 * For an update or delete: RLS turns a write the caller may not make into
 * "0 rows affected" rather than an error, which would otherwise read as success.
 */
function changed(result: Result): void {
  if (result.error) throw result.error
  if (!Array.isArray(result.data) || result.data.length === 0) {
    throw new Error("That change wasn't saved — it may already be gone. Reload and try again.")
  }
}

function rpcValue<T>(result: Result): T {
  if (result.error) {
    const message = (result.error as { message?: unknown }).message
    throw new Error(typeof message === 'string' && message ? message : 'Something went wrong.')
  }
  return result.data as T
}

/** RLS scopes this: a teacher gets the classes they own, a student the ones they are in. */
export async function listMyClasses(): Promise<ClassRoom[]> {
  const client = await db()
  return many<ClassRow>(
    await client.from('classes').select(CLASS_COLUMNS).order('created_at', { ascending: false }),
  ).map(classFromRow)
}

export async function loadTeacherClassroom(): Promise<TeacherClassroom> {
  const client = await db()
  const classes = await listMyClasses()
  const classIds = classes.map((c) => c.id)

  const quizzesRequest = client.from('quizzes').select(QUIZ_COLUMNS).order('created_at', { ascending: false })

  if (classIds.length === 0) {
    const quizzes = many<QuizRow>(await quizzesRequest).map(quizFromRow)
    return { classes, members: [], students: [], announcements: [], quizzes, postings: [], attempts: [] }
  }

  const [memberResult, announcementResult, quizResult, postingResult, attemptResult] = await Promise.all([
    client.from('class_members').select(MEMBER_COLUMNS).in('class_id', classIds),
    client
      .from('announcements')
      .select(ANNOUNCEMENT_COLUMNS)
      .in('class_id', classIds)
      .order('created_at', { ascending: false }),
    quizzesRequest,
    client.from('quiz_classes').select(POSTING_COLUMNS).in('class_id', classIds),
    client.from('quiz_attempts').select(ATTEMPT_COLUMNS).in('class_id', classIds),
  ])

  const members = many<MemberRow>(memberResult).map(memberFromRow)
  const studentIds = [...new Set(members.map((m) => m.studentId))]
  const students =
    studentIds.length === 0
      ? []
      : many<PersonRow>(await client.from('profiles').select(PERSON_COLUMNS).in('id', studentIds)).map(personFromRow)

  return {
    classes,
    members,
    students,
    announcements: many<AnnouncementRow>(announcementResult).map(announcementFromRow),
    quizzes: many<QuizRow>(quizResult).map(quizFromRow),
    postings: many<PostingRow>(postingResult).map(postingFromRow),
    attempts: many<AttemptRow>(attemptResult).map(attemptFromRow),
  }
}

export async function loadStudentClassroom(): Promise<StudentClassroom> {
  const client = await db()
  const classes = await listMyClasses()
  if (classes.length === 0) return { classes, teachers: [], announcements: [] }

  const teacherIds = [...new Set(classes.map((c) => c.teacherId))]
  const [teacherResult, announcementResult] = await Promise.all([
    client.from('profiles').select(PERSON_COLUMNS).in('id', teacherIds),
    client
      .from('announcements')
      .select(ANNOUNCEMENT_COLUMNS)
      .in('class_id', classes.map((c) => c.id))
      .order('created_at', { ascending: false }),
  ])

  return {
    classes,
    teachers: many<PersonRow>(teacherResult).map(personFromRow),
    announcements: many<AnnouncementRow>(announcementResult).map(announcementFromRow),
  }
}

export async function createClass(details: ClassDetails): Promise<ClassRoom> {
  const client = await db()
  const [row] = many<ClassRow>(
    await client
      .from('classes')
      .insert({ name: details.name.trim(), description: details.description.trim() })
      .select(CLASS_COLUMNS),
  )
  if (!row) throw new Error('The class was not created.')
  return classFromRow(row)
}

export async function updateClass(id: string, details: ClassDetails): Promise<void> {
  const client = await db()
  changed(
    await client
      .from('classes')
      .update({ name: details.name.trim(), description: details.description.trim() })
      .eq('id', id)
      .select('id'),
  )
}

export async function deleteClass(id: string): Promise<void> {
  const client = await db()
  changed(await client.from('classes').delete().eq('id', id).select('id'))
}

export async function regenerateJoinCode(classId: string): Promise<string> {
  const client = await db()
  return rpcValue<string>(await client.rpc('regenerate_join_code', { p_class_id: classId }))
}

/** Joins by code and returns the class id. */
export async function joinClass(code: string): Promise<string> {
  const client = await db()
  return rpcValue<string>(await client.rpc('join_class', { p_code: normalizeJoinCode(code) }))
}

/** A teacher removing a student, or a student leaving — RLS allows both. */
export async function removeMembership(classId: string, studentId: string): Promise<void> {
  const client = await db()
  changed(
    await client
      .from('class_members')
      .delete()
      .eq('class_id', classId)
      .eq('student_id', studentId)
      .select('class_id'),
  )
}

export async function createAnnouncement(classId: string, details: AnnouncementDetails): Promise<void> {
  const client = await db()
  many(
    await client
      .from('announcements')
      .insert({ class_id: classId, title: details.title.trim(), body: details.body.trim() })
      .select('id'),
  )
}

export async function updateAnnouncement(id: string, details: AnnouncementDetails): Promise<void> {
  const client = await db()
  changed(
    await client
      .from('announcements')
      .update({ title: details.title.trim(), body: details.body.trim() })
      .eq('id', id)
      .select('id'),
  )
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const client = await db()
  changed(await client.from('announcements').delete().eq('id', id).select('id'))
}
```

If `tsc` rejects passing a builder result to `many`/`changed` because its inferred type is not assignable to `Result`, keep the helpers and cast at the call site: `many<ClassRow>((await …) as Result)`. Do not add a generated `Database` type in this task.

- [ ] **Step 6: Implement `useAsync.ts`**

```ts
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { describeError } from '@/store/presentationStore'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T }

/**
 * A page's one load, with retry.
 *
 * `reload` keeps the current data on screen while the fresh copy arrives, so
 * the list does not flash a skeleton after every write; only a retry from the
 * error state goes back to loading. `key` restarts the load when it changes
 * (the signed-in user's id, in practice).
 */
export function useAsync<T>(load: () => Promise<T>, key: string): { state: AsyncState<T>; reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const loadRef = useRef(load)

  useLayoutEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let cancelled = false
    loadRef.current().then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data })
      },
      (err: unknown) => {
        console.error('[classroom] Load failed.', err)
        if (!cancelled) setState({ status: 'error', error: describeError(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, version])

  const reload = useCallback(() => {
    setState((current) => (current.status === 'error' ? { status: 'loading' } : current))
    setVersion((v) => v + 1)
  }, [])

  return { state, reload }
}
```

- [ ] **Step 7: Implement `useMyClasses.ts`**

```ts
import { useEffect, useSyncExternalStore } from 'react'
import { listMyClasses } from './api'
import type { ClassRoom } from './types'

/*
  The rail's class list, shared by every page that renders the rail — read
  here rather than threaded through each page, the way the Drafts badge is.

  Keyed by user id so a sign-out/sign-in never shows the previous account's
  classes. Any write that changes the list calls `invalidateMyClasses()`.
  `generation` discards a response that an invalidation has overtaken.
*/

type Snapshot = { userId: string; classes: ClassRoom[] } | null

let snapshot: Snapshot = null
let pendingFor: string | null = null
let generation = 0
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Snapshot {
  return snapshot
}

function fetchFor(userId: string) {
  if (pendingFor === userId) return
  pendingFor = userId
  const mine = ++generation
  listMyClasses().then(
    (classes) => {
      if (mine !== generation) return
      pendingFor = null
      snapshot = { userId, classes }
      emit()
    },
    (err: unknown) => {
      if (mine !== generation) return
      pendingFor = null
      console.warn('[classroom] Could not load classes for the sidebar.', err)
      snapshot = { userId, classes: [] }
      emit()
    },
  )
}

export function invalidateMyClasses() {
  generation++
  pendingFor = null
  snapshot = null
  emit()
}

/** The signed-in account's classes, or `null` while loading or when `enabled` is false. */
export function useMyClasses(userId: string | null, enabled: boolean): ClassRoom[] | null {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const fresh = current && current.userId === userId ? current : null

  useEffect(() => {
    if (enabled && userId && !fresh) fetchFor(userId)
  }, [enabled, userId, fresh])

  return enabled && fresh ? fresh.classes : null
}
```

- [ ] **Step 8: Verify**

Run: `npm run build` — Expected: exit 0.
Run: `npm run test` — Expected: all pass.
Run: `npm run lint` — Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/classroom/rows.ts src/classroom/rows.test.ts src/classroom/api.ts src/classroom/useAsync.ts src/classroom/useMyClasses.ts
git commit -m "Classroom data access: row mapping, Supabase API, page and sidebar loaders

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 5: `DashboardShell` — one page frame for every dashboard page

**Files:**
- Create: `src/components/home/DashboardShell.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/pages/DraftsPage.tsx`

**Interfaces:**
- Consumes: `AppSidebar` (unchanged props: `query`, `onQueryChange`, `email`, `onSignOut`, `open`, `onClose`), `useAuthStore`.
- Produces: `DashboardShell({ title: ReactNode; subtitle?: ReactNode; query: string; onQueryChange: (value: string) => void; children: ReactNode })`. `children` renders below the title block, inside the centred `max-w-7xl` column; modals may be rendered as children (they are `position: fixed`).

This is a refactor with **no visual change**. Verification is by eye against the current pages.

- [ ] **Step 1: Create `src/components/home/DashboardShell.tsx`**

```tsx
import { useState, type ReactNode } from 'react'
import { useAuthStore } from '@/store/authStore'
import { AppSidebar } from './AppSidebar'

/**
 * The frame every dashboard page shares: the dark rail (an off-canvas drawer
 * below `lg`), the mobile menu button, and the title block above the page's
 * own content.
 *
 * Extracted before the classroom pages were added, because HomePage and
 * DraftsPage each assembled this by hand and six more copies would drift.
 * Search is the page's: the rail's field searches whatever the page filters.
 */
export function DashboardShell({
  title,
  subtitle,
  query,
  onQueryChange,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  query: string
  onQueryChange: (value: string) => void
  children: ReactNode
}) {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-app-canvas">
      <AppSidebar
        query={query}
        onQueryChange={onQueryChange}
        email={user?.email}
        onSignOut={() => void signOut()}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <main className="scrollbar-subtle min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
          <div className="mb-6 flex items-start gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="mt-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-app-sm border border-app-border bg-app-background text-app-foreground transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent lg:hidden"
            >
              <svg
                className="size-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
              </svg>
            </button>

            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-app-foreground sm:text-3xl">
                {title}
              </h1>
              {subtitle && <p className="mt-1.5 text-sm text-app-muted">{subtitle}</p>}
            </div>
          </div>

          {children}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Move `DraftsPage` onto the shell**

In `src/pages/DraftsPage.tsx`:

1. Replace the imports

```tsx
import { useAuthStore } from '@/store/authStore'
import { AppSidebar } from '@/components/home/AppSidebar'
```

with

```tsx
import { DashboardShell } from '@/components/home/DashboardShell'
```

2. Delete these three lines from the component body:

```tsx
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
```

```tsx
  const [menuOpen, setMenuOpen] = useState(false)
```

3. Replace everything from `  return (` up to and including the closing `</div>` of the `mb-6 flex items-start gap-3` title block (the lines ending just before `<section className="overflow-hidden rounded-app …`) with:

```tsx
  return (
    <DashboardShell
      title="Drafts"
      subtitle={
        hasDrafts
          ? `${drafts.length} unfinished ${drafts.length === 1 ? 'brief' : 'briefs'} · Saved on this device`
          : 'Briefs you started but never generated show up here'
      }
      query={query}
      onQueryChange={setQuery}
    >
```

4. Leave the `<section>…</section>` block unchanged. Replace the tail that follows it — currently

```tsx
          </section>
        </div>
      </main>

      {pendingDelete && (
```

— with

```tsx
          </section>

      {pendingDelete && (
```

5. Replace the file's final lines

```tsx
      )}
    </div>
  )
}
```

with

```tsx
      )}
    </DashboardShell>
  )
}
```

6. Re-indent the file (`npx prettier --write src/pages/DraftsPage.tsx` if Prettier is available; otherwise leave indentation — it does not affect the build).

- [ ] **Step 3: Move `HomePage` onto the shell**

In `src/pages/HomePage.tsx`:

1. Replace

```tsx
import { useAuthStore } from '@/store/authStore'
import { AppSidebar } from '@/components/home/AppSidebar'
```

with

```tsx
import { DashboardShell } from '@/components/home/DashboardShell'
```

2. Delete from the component body:

```tsx
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
```

```tsx
  const [menuOpen, setMenuOpen] = useState(false)
```

3. Replace everything from `  return (` through the closing `</div>` of the `mb-6 flex items-start gap-3` title block (just before the `{/* the working surface …*/}` comment) with:

```tsx
  return (
    <DashboardShell
      title="Your presentations"
      subtitle={
        loading
          ? 'Loading your workspace…'
          : hasDecks
            ? `${decks.length} ${decks.length === 1 ? 'presentation' : 'presentations'} · Describe a topic, get a finished deck`
            : 'Describe a topic, get a finished deck'
      }
      query={query}
      onQueryChange={setQuery}
    >
```

4. Keep the comment and the `<section>…</section>` unchanged. Replace

```tsx
          </section>
        </div>
      </main>

      {deckPendingDelete && (
```

with

```tsx
          </section>

      {deckPendingDelete && (
```

5. Replace the final

```tsx
      )}
    </div>
  )
}
```

with

```tsx
      )}
    </DashboardShell>
  )
}
```

- [ ] **Step 4: Verify**

Run: `npm run build` — Expected: exit 0 (fails if `useState` or another import became unused in a way `tsc` rejects — remove the unused import).
Run: `npm run lint` — Expected: 0 errors.

Manual, with `npm run dev`: open `/` and `/drafts` at desktop width and at ~400px width. Title, subtitle, panel, search (`Ctrl F` / `⌘F`), the mobile drawer open/close, Log out and the delete modals all behave exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/DashboardShell.tsx src/pages/HomePage.tsx src/pages/DraftsPage.tsx
git commit -m "Extract DashboardShell from HomePage and DraftsPage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 6: Sign-up account type, Account type modal, sidebar sections

**Files:**
- Create: `src/components/auth/RoleChoice.tsx`
- Create: `src/components/auth/AccountTypeModal.tsx`
- Modify: `src/pages/LoginPage.tsx`
- Modify: `src/components/home/AppSidebar.tsx`

**Interfaces:**
- Consumes: `Role`, `ROLES`, `ROLE_LABEL`, `ROLE_HINT` (Task 2); `useAuthStore().profile`, `.updateRole`, `.signUp(email, password, { role, displayName })` (Task 2); `useMyClasses`, `invalidateMyClasses` (Task 4); `Modal`, `Button`, `Alert`, `Field`, `Input`.
- Produces: `RoleChoice({ value: Role; onChange: (role: Role) => void; name: string })`; `AccountTypeModal({ onClose: () => void })`. Rail links to `/classroom/classes`, `/classroom/students`, `/classroom/quizzes`, `/classes`, `/classes/:id` (routes arrive in Tasks 7–11; until then those links land on a blank route, which is expected mid-plan).

- [ ] **Step 1: Create `src/components/auth/RoleChoice.tsx`**

```tsx
import { ROLE_HINT, ROLE_LABEL, ROLES, type Role } from '@/classroom/roles'

/** The three account types as a radio group — shared by sign-up and the Account type modal. */
export function RoleChoice({
  value,
  onChange,
  name,
}: {
  value: Role
  onChange: (role: Role) => void
  name: string
}) {
  return (
    <div role="radiogroup" aria-label="Account type" className="flex flex-col gap-2">
      <span className="block text-xs font-medium text-app-muted">I'm using LekturaC as…</span>
      {ROLES.map((role) => {
        const selected = role === value
        return (
          <label
            key={role}
            className={`flex cursor-pointer items-start gap-3 rounded-app-sm border px-3 py-2.5 transition-colors ${
              selected ? 'border-app-accent bg-app-accent/8' : 'border-app-border hover:bg-app-surface'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={role}
              checked={selected}
              onChange={() => onChange(role)}
              className="mt-0.5 accent-[var(--app-accent)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-app-foreground">{ROLE_LABEL[role]}</span>
              <span className="block text-xs text-app-muted">{ROLE_HINT[role]}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Add Name and account type to sign-up in `src/pages/LoginPage.tsx`**

1. Add imports:

```tsx
import { RoleChoice } from '@/components/auth/RoleChoice'
import type { Role } from '@/classroom/roles'
```

2. Below `validatePassword`, add:

```tsx
function validateName(value: string): string | null {
  return value.trim() ? null : 'Enter your name.'
}
```

3. Below `const [password, setPassword] = useState('')`, add:

```tsx
  const [displayName, setDisplayName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [role, setRole] = useState<Role>('general')
```

4. In `switchMode`, below `setPasswordError(null)`, add `setNameError(null)`.

5. In `handleSubmit`, replace

```tsx
    const nextPasswordError = validatePassword(password, mode)
    setPasswordError(nextPasswordError)
    if (nextEmailError || nextPasswordError) return
```

with

```tsx
    const nextPasswordError = validatePassword(password, mode)
    setPasswordError(nextPasswordError)
    const nextNameError = mode === 'signup' ? validateName(displayName) : null
    setNameError(nextNameError)
    if (nextEmailError || nextPasswordError || nextNameError) return
```

6. Replace the Task 2 placeholder call

```tsx
      const { error, needsVerification } = await signUp(email, password, {
        role: 'general',
        displayName: '',
      })
```

with

```tsx
      const { error, needsVerification } = await signUp(email, password, { role, displayName })
```

7. In the form, directly after `<form key={mode} …>`, insert:

```tsx
        {mode === 'signup' && (
          <Field
            label="Name"
            error={nameError}
            render={(fieldProps) => (
              <Input
                {...fieldProps}
                type="text"
                autoComplete="name"
                autoFocus
                placeholder="Your name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  if (nameError) setNameError(null)
                }}
              />
            )}
          />
        )}
```

8. On the Email `<Input>`, change `autoFocus` to `autoFocus={mode !== 'signup'}`.

9. Directly after the Password `Field` block (`{mode !== 'forgot' && ( … )}`), insert:

```tsx
        {mode === 'signup' && <RoleChoice name="signup-role" value={role} onChange={setRole} />}
```

- [ ] **Step 3: Create `src/components/auth/AccountTypeModal.tsx`**

```tsx
import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import type { Role } from '@/classroom/roles'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { RoleChoice } from './RoleChoice'

/**
 * Changes the signed-in account's type. The database refuses while the account
 * still owns classes (teacher) or belongs to one (student); that refusal is
 * shown here as-is, and nothing changes until the save succeeds.
 */
export function AccountTypeModal({ onClose }: { onClose: () => void }) {
  const current = useAuthStore((s) => s.profile?.role ?? 'general')
  const updateRole = useAuthStore((s) => s.updateRole)
  const [role, setRole] = useState<Role>(current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (role === current) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    const result = await updateRole(role)
    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    invalidateMyClasses()
    onClose()
  }

  return (
    <Modal title="Account type" onClose={saving ? () => {} : onClose}>
      <RoleChoice name="account-type" value={role} onChange={setRole} />
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Add the classroom sections and the footer changes to `src/components/home/AppSidebar.tsx`**

1. Change the first import line to `import { useEffect, useRef, useState } from 'react'` and add:

```tsx
import { useAuthStore } from '@/store/authStore'
import { useMyClasses } from '@/classroom/useMyClasses'
import { ROLE_LABEL } from '@/classroom/roles'
import { AccountTypeModal } from '@/components/auth/AccountTypeModal'
```

2. Below `DraftsIcon`, add these icons:

```tsx
function ClassesIcon() {
  return (
    <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z" />
    </svg>
  )
}

function StudentsIcon() {
  return (
    <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.8 13.5c.6-2.3 2.2-3.5 4.2-3.5s3.6 1.2 4.2 3.5" />
      <path d="M10.5 3.2a2.4 2.4 0 010 4.6M12 10.2c1.1.5 1.8 1.6 2.2 3.3" />
    </svg>
  )
}

function QuizzesIcon() {
  return (
    <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <path d="M5.5 6l1 1 2-2M5.5 10.5l1 1 2-2M10 6.2h.5M10 10.7h.5" />
    </svg>
  )
}

function JoinIcon() {
  return (
    <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5.2v5.6M5.2 8h5.6" />
    </svg>
  )
}

/** How many classes the student rail lists by name before "All classes". */
const RAIL_CLASS_LIMIT = 5
```

3. In the `AppSidebar` body, below `const draftCount = useDrafts().length`, add:

```tsx
  const profile = useAuthStore((s) => s.profile)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const role = profile?.role ?? 'general'
  const myClasses = useMyClasses(userId, role !== 'general')
  const [accountTypeOpen, setAccountTypeOpen] = useState(false)
  const name = profile?.displayName.trim() || email

  function go(path: string) {
    void navigate(path)
    onClose()
  }
```

4. Replace the commented-out block that begins `{/*` with `More groups go here.` and ends `*/}` (just before `</nav>`) with:

```tsx
          {role === 'teacher' && (
            <SidebarSection label="Classroom">
              <SidebarLink
                label="Classes"
                icon={<ClassesIcon />}
                active={pathname.startsWith('/classroom/classes')}
                badge={myClasses && myClasses.length > 0 ? myClasses.length : undefined}
                onClick={() => go('/classroom/classes')}
              />
              <SidebarLink
                label="Students"
                icon={<StudentsIcon />}
                active={pathname === '/classroom/students'}
                onClick={() => go('/classroom/students')}
              />
              <SidebarLink
                label="Quizzes"
                icon={<QuizzesIcon />}
                active={pathname === '/classroom/quizzes'}
                onClick={() => go('/classroom/quizzes')}
              />
            </SidebarSection>
          )}

          {role === 'student' && (
            <SidebarSection label="My classes">
              {(myClasses ?? []).slice(0, RAIL_CLASS_LIMIT).map((c) => (
                <SidebarLink
                  key={c.id}
                  label={c.name}
                  icon={<ClassesIcon />}
                  active={pathname === `/classes/${c.id}`}
                  onClick={() => go(`/classes/${c.id}`)}
                />
              ))}
              {myClasses && myClasses.length > RAIL_CLASS_LIMIT && (
                <SidebarLink
                  label="All classes"
                  active={pathname === '/classes'}
                  onClick={() => go('/classes')}
                />
              )}
              <SidebarLink
                label="Join a class"
                icon={<JoinIcon />}
                active={pathname === '/classes' && !(myClasses && myClasses.length > RAIL_CLASS_LIMIT)}
                onClick={() => go('/classes')}
              />
            </SidebarSection>
          )}
```

5. Replace the footer's avatar-and-text block — from `<span aria-hidden="true" className="grid size-8 …">` through the closing `</div>` of `flex min-w-0 flex-1 flex-col text-xs` — with:

```tsx
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-app-highlight text-sm font-semibold text-app-highlight-foreground"
            >
              {name?.charAt(0).toUpperCase() ?? '?'}
            </span>
            <div className="flex min-w-0 flex-1 flex-col text-xs">
              {name && <span className="truncate text-white/80">{name}</span>}
              <span className="text-white/45">{ROLE_LABEL[role]}</span>
              <div className="mt-0.5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setAccountTypeOpen(true)}
                  className="cursor-pointer rounded text-white/45 transition-colors hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
                >
                  Account type
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="cursor-pointer rounded text-white/45 transition-colors hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
                >
                  Log out
                </button>
              </div>
            </div>
```

6. Directly before the component's final `</>`, add:

```tsx
      {accountTypeOpen && <AccountTypeModal onClose={() => setAccountTypeOpen(false)} />}
```

7. Replace the Workspace links' `onClick` bodies with `onClick={() => go('/')}` and `onClick={() => go('/drafts')}`.

- [ ] **Step 5: Verify**

Run: `npm run build` — Expected: exit 0.
Run: `npm run lint` — Expected: 0 errors.
Run: `npm run test` — Expected: all pass.

Manual (migration 0009 applied, `npm run dev`):
1. `/login` → Sign up: Name field is first and focused, the account-type choice sits under Password, submitting with an empty name shows "Enter your name."
2. Sign up a Teacher account (confirm the email). After login the rail shows **Classroom** (Classes / Students / Quizzes) and the footer reads the name with "Teacher" beneath.
3. Sign up a Student account: the rail shows **My classes** with only "Join a class".
4. An existing account shows "General" and no extra section.
5. Footer → Account type → switch General to Teacher → Save: the modal closes and the Classroom section appears without a reload.

- [ ] **Step 6: Commit**

```bash
git add src/components/auth/RoleChoice.tsx src/components/auth/AccountTypeModal.tsx src/pages/LoginPage.tsx src/components/home/AppSidebar.tsx
git commit -m "Pick account type at sign-up; rail shows Classroom or My classes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 7: Shared classroom UI and the Classes page

**Files:**
- Modify: `src/components/home/relativeTime.ts`
- Create: `src/components/classroom/Panel.tsx`
- Create: `src/components/classroom/ConfirmModal.tsx`
- Create: `src/components/classroom/ClassFormModal.tsx`
- Create: `src/components/classroom/JoinCodeChip.tsx`
- Create: `src/components/classroom/ClassChip.tsx`
- Create: `src/components/classroom/ClassFilter.tsx`
- Create: `src/components/classroom/ClassCard.tsx`
- Create: `src/pages/classroom/ClassesPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `DashboardShell` (Task 5); `loadTeacherClassroom`, `createClass`, `deleteClass` (Task 4); `useAsync`, `invalidateMyClasses` (Task 4); `matchesQuery`, `plural` (Task 3); `RequireRole` (Task 2); `ViewTabs`, `DeckView` from `components/home`; `describeError`.
- Produces (used by Tasks 8–11):
  - `relativePostedAt(iso: string): string`
  - `Panel({ toolbar?: ReactNode; children: ReactNode })`, `PanelMessage({ title: string; body?: ReactNode; action?: ReactNode })`, `LoadError({ message: string; onRetry: () => void })`, `RowsSkeleton({ count?: number })`, `ClassUnavailable({ backTo: string; backLabel: string })`
  - `ConfirmModal({ title: string; children: ReactNode; confirmLabel: string; pendingLabel: string; danger?: boolean; onCancel: () => void; onConfirm: () => Promise<void> })` — `onConfirm` must close the modal itself on success; a throw is shown inline
  - `ClassFormModal({ title: string; submitLabel: string; initial?: ClassDetails; onCancel: () => void; onSubmit: (details: ClassDetails) => Promise<void> })`
  - `JoinCodeChip({ code: string })`, `ClassChip({ name: string })`, `ClassFilter({ classes: ClassRoom[]; value: string; onChange: (classId: string) => void })`
  - Route helper in `App.tsx`: `teacherOnly(element: ReactNode)`

- [ ] **Step 1: Add `relativePostedAt` to `src/components/home/relativeTime.ts`**

Append:

```ts
/** "Posted 3 days ago" — announcements. */
export function relativePostedAt(iso: string): string {
  const ago = relativeAgo(new Date(iso).getTime())
  return ago ? `Posted ${ago}` : 'Posted just now'
}
```

- [ ] **Step 2: Create `src/components/classroom/Panel.tsx`**

```tsx
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

/** The dashboard's bordered working surface, with an optional toolbar strip. */
export function Panel({ toolbar, children }: { toolbar?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-app border border-app-border bg-app-background shadow-md">
      {toolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-4 py-3 sm:px-5">
          {toolbar}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

/** A centred empty/zero-result/error message inside a panel. */
export function PanelMessage({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-app-foreground">{title}</h2>
      {body && <p className="mt-2 max-w-sm text-sm text-app-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PanelMessage
      title="Couldn't load this page"
      body={message}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  )
}

/** Row-shaped placeholders, so the list does not jolt when data arrives. */
export function RowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-app-sm border border-app-border px-4 py-3">
          <div className="dash-skeleton h-4 w-2/5 rounded-app-sm bg-app-surface" />
          <div className="dash-skeleton ml-auto h-3 w-16 rounded-app-sm bg-app-surface" />
          <div className="dash-skeleton h-3 w-16 rounded-app-sm bg-app-surface" />
        </div>
      ))}
    </div>
  )
}

/**
 * A class id that does not exist or is not visible to the caller. Deliberately
 * does not say which — "deleted" and "not yours" read the same from outside.
 */
export function ClassUnavailable({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  const navigate = useNavigate()
  return (
    <Panel>
      <PanelMessage
        title="This class isn't available"
        body="It may have been deleted, or you may no longer have access to it."
        action={
          <Button variant="secondary" onClick={() => void navigate(backTo)}>
            {backLabel}
          </Button>
        }
      />
    </Panel>
  )
}
```

- [ ] **Step 3: Create `src/components/classroom/ConfirmModal.tsx`**

```tsx
import { useState, type ReactNode } from 'react'
import { describeError } from '@/store/presentationStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

/**
 * A yes/no for a write that cannot be taken back. Stays open and shows the
 * error if `onConfirm` throws; on success the caller unmounts it.
 */
export function ConfirmModal({
  title,
  children,
  confirmLabel,
  pendingLabel,
  danger = true,
  onCancel,
  onConfirm,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  pendingLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(describeError(err))
      setPending(false)
    }
  }

  return (
    <Modal title={title} onClose={pending ? () => {} : onCancel}>
      <div className="text-sm text-app-muted">{children}</div>
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={() => void confirm()} loading={pending}>
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Create `src/components/classroom/ClassFormModal.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import { describeError } from '@/store/presentationStore'
import type { ClassDetails } from '@/classroom/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Field, Input, Textarea } from '@/components/ui/Input'

/** New class and Edit details share this form. The join code is never edited here. */
export function ClassFormModal({
  title,
  submitLabel,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string
  submitLabel: string
  initial?: ClassDetails
  onCancel: () => void
  onSubmit: (details: ClassDetails) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setNameError('Give the class a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name, description })
    } catch (err) {
      setError(describeError(err))
      setSaving(false)
    }
  }

  return (
    <Modal title={title} onClose={saving ? () => {} : onCancel}>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <Field
          label="Name"
          error={nameError}
          render={(fieldProps) => (
            <Input
              {...fieldProps}
              autoFocus
              maxLength={120}
              placeholder="e.g. Biology — Period 3"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError(null)
              }}
            />
          )}
        />
        <Field
          label="Description (optional)"
          render={(fieldProps) => (
            <Textarea
              id={fieldProps.id}
              aria-describedby={fieldProps['aria-describedby']}
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 5: Create the three small pieces**

`src/components/classroom/JoinCodeChip.tsx`:

```tsx
import { useEffect, useState } from 'react'

/** The class's join code, click to copy. Clipboard can be blocked; the code is still on screen to read. */
export function JoinCodeChip({ code }: { code: string }) {
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
      // Blocked clipboard: nothing to do — the code is visible.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="Copy join code"
      className="inline-flex cursor-pointer items-center gap-2 rounded-app-sm border border-app-border bg-app-surface px-2.5 py-1 text-xs text-app-foreground transition-colors hover:bg-app-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
    >
      <span className="font-mono tracking-[0.2em]">{code}</span>
      <span className="text-app-muted" aria-live="polite">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  )
}
```

`src/components/classroom/ClassChip.tsx`:

```tsx
export function ClassChip({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-[12rem] items-center truncate rounded-full border border-app-border bg-app-surface px-2 py-0.5 text-[11px] text-app-foreground">
      {name}
    </span>
  )
}
```

`src/components/classroom/ClassFilter.tsx`:

```tsx
import type { ClassRoom } from '@/classroom/types'

/** `''` means all classes. */
export function ClassFilter({
  classes,
  value,
  onChange,
}: {
  classes: ClassRoom[]
  value: string
  onChange: (classId: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-app-muted">
      <span>Class</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-app-sm border border-app-border bg-app-background px-2.5 py-1.5 text-sm text-app-foreground outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/25"
      >
        <option value="">All classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 6: Create `src/components/classroom/ClassCard.tsx`**

```tsx
import type { ClassRoom } from '@/classroom/types'
import { plural } from '@/classroom/format'
import { relativePostedAt } from '@/components/home/relativeTime'
import { Button } from '@/components/ui/Button'
import { JoinCodeChip } from './JoinCodeChip'

export function ClassCard({
  classRoom,
  studentCount,
  quizCount,
  latestAnnouncementAt,
  onOpen,
  onDelete,
}: {
  classRoom: ClassRoom
  studentCount: number
  quizCount: number
  latestAnnouncementAt: string | null
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <article className="flex flex-col rounded-app border border-app-border bg-app-background shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 cursor-pointer flex-col items-start gap-1 rounded-t-app px-5 pt-5 pb-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        <h3 className="text-base font-semibold text-app-foreground">{classRoom.name}</h3>
        {classRoom.description && <p className="line-clamp-2 text-sm text-app-muted">{classRoom.description}</p>}
        <p className="mt-2 text-xs text-app-muted">
          {plural(studentCount, 'student')} · {plural(quizCount, 'quiz', 'quizzes')} ·{' '}
          {latestAnnouncementAt ? relativePostedAt(latestAnnouncementAt) : 'No announcements yet'}
        </p>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-app-border px-5 py-3">
        <JoinCodeChip code={classRoom.joinCode} />
        <Button variant="ghost" onClick={onDelete} className="px-2 py-1 text-xs text-red-600 dark:text-red-400">
          Delete
        </Button>
      </div>
    </article>
  )
}
```

- [ ] **Step 7: Create `src/pages/classroom/ClassesPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { createClass, deleteClass, loadTeacherClassroom } from '@/classroom/api'
import { matchesQuery, plural } from '@/classroom/format'
import { useAsync } from '@/classroom/useAsync'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import type { ClassRoom } from '@/classroom/types'
import { DashboardShell } from '@/components/home/DashboardShell'
import { ViewTabs } from '@/components/home/ViewTabs'
import type { DeckView } from '@/components/home/deckFilters'
import { ClassCard } from '@/components/classroom/ClassCard'
import { ClassFormModal } from '@/components/classroom/ClassFormModal'
import { ConfirmModal } from '@/components/classroom/ConfirmModal'
import { LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { Button } from '@/components/ui/Button'

export function ClassesPage() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadTeacherClassroom, userId)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<DeckView>('grid')
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ClassRoom | null>(null)

  const data = state.status === 'ready' ? state.data : null
  const visible = useMemo(
    () => (data ? data.classes.filter((c) => matchesQuery(query, c.name, c.description)) : []),
    [data, query],
  )

  const subtitle = data
    ? data.classes.length > 0
      ? `${plural(data.classes.length, 'class', 'classes')} · Students join with a class code`
      : 'Create a class, then share its code with your students'
    : 'Loading your classes…'

  return (
    <DashboardShell title="Classes" subtitle={subtitle} query={query} onQueryChange={setQuery}>
      <Panel
        toolbar={
          <>
            <ViewTabs value={view} onChange={setView} />
            <Button variant="primary" onClick={() => setCreating(true)}>
              + New class
            </Button>
          </>
        }
      >
        {state.status === 'loading' ? (
          <RowsSkeleton />
        ) : state.status === 'error' ? (
          <LoadError message={state.error} onRetry={reload} />
        ) : state.data.classes.length === 0 ? (
          <PanelMessage
            title="Create your first class"
            body="Each class gets a short code. Students sign up as a Student, enter the code, and appear on your roster."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                + New class
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <PanelMessage
            title={`No classes match “${query.trim()}”`}
            action={
              <Button variant="secondary" onClick={() => setQuery('')}>
                Clear search
              </Button>
            }
          />
        ) : (
          <div className={view === 'list' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3'}>
            {visible.map((c) => (
              <ClassCard
                key={c.id}
                classRoom={c}
                studentCount={state.data.members.filter((m) => m.classId === c.id).length}
                quizCount={state.data.postings.filter((p) => p.classId === c.id).length}
                latestAnnouncementAt={state.data.announcements.find((a) => a.classId === c.id)?.createdAt ?? null}
                onOpen={() => void navigate(`/classroom/classes/${c.id}`)}
                onDelete={() => setPendingDelete(c)}
              />
            ))}
          </div>
        )}
      </Panel>

      {creating && (
        <ClassFormModal
          title="New class"
          submitLabel="Create class"
          onCancel={() => setCreating(false)}
          onSubmit={async (details) => {
            const created = await createClass(details)
            invalidateMyClasses()
            void navigate(`/classroom/classes/${created.id}`)
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete class"
          confirmLabel="Delete class"
          pendingLabel="Deleting…"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await deleteClass(pendingDelete.id)
            setPendingDelete(null)
            invalidateMyClasses()
            reload()
          }}
        >
          <p>
            Delete <span className="font-medium text-app-foreground">“{pendingDelete.name}”</span>? Its roster,
            announcements, quiz postings and the scores students earned in it are removed. Your quizzes and your
            students' accounts are kept. This can't be undone.
          </p>
        </ConfirmModal>
      )}
    </DashboardShell>
  )
}
```

(`announcements` arrive newest-first from `loadTeacherClassroom`, so `find` returns the latest.)

- [ ] **Step 8: Add route helpers and the first classroom routes to `src/App.tsx`**

1. Change the router import to `import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'`, add `import type { ReactNode } from 'react'`, and add:

```tsx
import { RequireRole } from '@/components/auth/RequireRole'
import { ClassesPage } from '@/pages/classroom/ClassesPage'
```

2. Above `function App()`, add:

```tsx
function teacherOnly(element: ReactNode) {
  return (
    <RequireAuth>
      <RequireRole role="teacher">{element}</RequireRole>
    </RequireAuth>
  )
}
```

(`studentOnly` is added in Task 11, when it has a caller — `tsconfig.app.json`'s unused-locals check would fail the build on an unused helper.)

3. Inside `<Routes>`, after the `/deck/:id/narrate` route, add:

```tsx
        <Route path="/classroom" element={teacherOnly(<Navigate to="/classroom/classes" replace />)} />
        <Route path="/classroom/classes" element={teacherOnly(<ClassesPage />)} />
```

- [ ] **Step 9: Verify**

Run: `npm run build` — Expected: exit 0.
Run: `npm run lint` — Expected: 0 errors.

Manual (Teacher account, migration applied):
1. Rail → Classes: empty state "Create your first class".
2. New class with an empty name → "Give the class a name."; with "Biology" → lands on `/classroom/classes/<id>` (blank until Task 10 — expected), and the rail's Classes badge shows 1.
3. Back to Classes: the card shows "0 students · 0 quizzes · No announcements yet" and a 6-character code; Copy changes to "Copied".
4. Grid/List switch works; search in the rail filters cards; Delete → confirm → the card disappears and the badge updates.
5. As a General or Student account, visiting `/classroom/classes` redirects to `/`.

- [ ] **Step 10: Commit**

```bash
git add src/components/home/relativeTime.ts src/components/classroom src/pages/classroom/ClassesPage.tsx src/App.tsx
git commit -m "Classroom: Classes page, shared panel, confirm and class form modals

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 8: Student rows, charts, and the Students page

**Files:**
- Create: `src/components/classroom/charts.tsx`
- Create: `src/components/classroom/StudentRow.tsx`
- Create: `src/pages/classroom/StudentsPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `studentStats`, `rosterOf`, `RosterEntry`, `ClassroomRecords`, `ScorePoint`, `Trend` (Task 3); `formatPercent`, `formatCompletion`, `personLabel`, `describeTrend`, `formatDate`, `matchesQuery`, `plural` (Task 3); `formatSlideRange` (Task 3); `loadTeacherClassroom`, `useAsync` (Task 4); `Panel`, `PanelMessage`, `LoadError`, `RowsSkeleton`, `ClassChip`, `ClassFilter` (Task 7); `teacherOnly` (Task 7).
- Produces: `Sparkline({ scores: number[]; label: string })`, `ScoreChart({ points: ScorePoint[] })`, `TrendBadge({ trend: Trend })`; `StudentRow({ entry: RosterEntry; classes: ClassRoom[]; quizzes: QuizSummary[]; records: ClassroomRecords; scopeClassId?: string; expanded: boolean; onToggle: () => void; onRemove?: () => void })` (reused by the class folder in Task 10).

Before writing chart code, invoke the `dataviz` skill and apply anything it requires that this task's code does not already do (it is a guide, not a reason to add a dependency).

- [ ] **Step 1: Create `src/components/classroom/charts.tsx`**

```tsx
import { describeTrend, formatDate, formatPercent } from '@/classroom/format'
import type { ScorePoint, Trend } from '@/classroom/stats'

/*
  Hand-drawn SVG — one sparkline per row does not justify a chart library.
  Colours come from app-* tokens so both light and dark modes work. Every
  chart has a text equivalent nearby (the history table, or an aria-label),
  so nothing is conveyed by the drawing alone.
*/

const STROKE = 'var(--app-accent-text)'

export function Sparkline({ scores, label }: { scores: number[]; label: string }) {
  const width = 72
  const height = 24
  if (scores.length < 2) {
    return <span className="inline-block w-[72px] text-center text-xs text-app-muted">—</span>
  }
  const points = scores
    .map((score, i) => {
      const x = 2 + (i * (width - 4)) / (scores.length - 1)
      const y = height - 2 - score * (height - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function ScoreChart({ points }: { points: ScorePoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-app-muted">No submitted quizzes yet.</p>
  }
  const W = 480
  const H = 160
  const padX = 36
  const padY = 14
  const x = (i: number) => (points.length === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (points.length - 1))
  const y = (score: number) => padY + (1 - score) * (H - padY * 2)
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full max-w-xl"
      role="img"
      aria-label={`Scores over time: ${points.map((p) => formatPercent(p.score)).join(', ')}`}
    >
      {[0, 0.5, 1].map((tick) => (
        <g key={tick}>
          <line
            x1={padX}
            x2={W - padX}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--app-border)"
            strokeDasharray={tick === 0 ? undefined : '3 4'}
          />
          <text x={padX - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--app-muted)">
            {tick * 100}%
          </text>
        </g>
      ))}
      {points.length > 1 && (
        <polyline points={line} fill="none" stroke={STROKE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.score)} r="3.5" fill="var(--app-background)" stroke={STROKE} strokeWidth="2">
          <title>{`${formatDate(p.submittedAt)}: ${formatPercent(p.score)}`}</title>
        </circle>
      ))}
    </svg>
  )
}

const TREND_TONE = {
  improving: 'text-app-highlight-text',
  steady: 'text-app-muted',
  slipping: 'text-red-600 dark:text-red-400',
} as const

const TREND_ARROW = { improving: '↑', steady: '→', slipping: '↓' } as const

export function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.kind === 'insufficient') {
    return <span className="text-xs text-app-muted">Not enough data</span>
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${TREND_TONE[trend.direction]}`}>
      <span aria-hidden="true">{TREND_ARROW[trend.direction]}</span>
      {describeTrend(trend)}
    </span>
  )
}
```

- [ ] **Step 2: Create `src/components/classroom/StudentRow.tsx`**

```tsx
import { useId, useMemo } from 'react'
import { formatCompletion, formatDate, formatPercent, personLabel, describeTrend } from '@/classroom/format'
import { formatSlideRange } from '@/classroom/slideRange'
import { studentStats, type ClassroomRecords, type RosterEntry } from '@/classroom/stats'
import type { ClassRoom, QuizSummary } from '@/classroom/types'
import { Button } from '@/components/ui/Button'
import { ClassChip } from './ClassChip'
import { ScoreChart, Sparkline, TrendBadge } from './charts'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] text-app-muted">{label}</span>
      <span className="text-sm font-medium tabular-nums text-app-foreground">{value}</span>
    </span>
  )
}

/**
 * One student: a summary line that expands in place into the detailed view.
 *
 * `scopeClassId` computes every statistic within one class (the class folder);
 * without it they span all of the teacher's classes and the detail adds a
 * per-class breakdown. The toggle and Remove are sibling buttons — a button
 * inside a button is invalid and breaks keyboard focus.
 */
export function StudentRow({
  entry,
  classes,
  quizzes,
  records,
  scopeClassId,
  expanded,
  onToggle,
  onRemove,
}: {
  entry: RosterEntry
  classes: ClassRoom[]
  quizzes: QuizSummary[]
  records: ClassroomRecords
  scopeClassId?: string
  expanded: boolean
  onToggle: () => void
  onRemove?: () => void
}) {
  const panelId = useId()
  const studentId = entry.student.id
  const stats = useMemo(() => studentStats(studentId, records, scopeClassId), [studentId, records, scopeClassId])
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])
  const quizById = useMemo(() => new Map(quizzes.map((q) => [q.id, q])), [quizzes])
  const name = personLabel(entry.student)
  const scores = stats.points.map((p) => p.score)
  const showBreakdown = !scopeClassId && entry.classIds.length > 1

  return (
    <div className="rounded-app-sm border border-app-border">
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-6 gap-y-2 rounded-app-sm px-4 py-3 text-left transition-colors hover:bg-app-surface/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          <span className="min-w-0 flex-1 basis-48">
            <span className="block truncate text-sm font-medium text-app-foreground">{name}</span>
            <span className="block truncate text-xs text-app-muted">{entry.student.email}</span>
            {!scopeClassId && (
              <span className="mt-1 flex flex-wrap gap-1">
                {entry.classIds.map((id) => (
                  <ClassChip key={id} name={classById.get(id)?.name ?? 'Class'} />
                ))}
              </span>
            )}
          </span>
          <Metric label="Average" value={formatPercent(stats.average)} />
          <Metric label="Completed" value={formatCompletion(stats)} />
          <span className="flex items-center gap-2">
            <Sparkline scores={scores} label={`${name}: ${describeTrend(stats.trend)}`} />
            <TrendBadge trend={stats.trend} />
          </span>
          <svg
            className={`size-4 shrink-0 text-app-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        {onRemove && (
          <Button variant="ghost" onClick={onRemove} className="px-2 py-1 text-xs">
            Remove
          </Button>
        )}
      </div>

      <div id={panelId} hidden={!expanded} className="border-t border-app-border px-4 py-4">
        {expanded && (
          <div className="flex flex-col gap-6">
            <section>
              <h4 className="mb-2 text-xs font-medium tracking-wide text-app-muted uppercase">Scores over time</h4>
              <ScoreChart points={stats.points} />
            </section>

            {showBreakdown && (
              <section>
                <h4 className="mb-2 text-xs font-medium tracking-wide text-app-muted uppercase">By class</h4>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[20rem] text-left text-sm">
                    <thead className="text-xs text-app-muted">
                      <tr>
                        <th className="py-1.5 pr-4 font-medium">Class</th>
                        <th className="py-1.5 pr-4 font-medium">Average</th>
                        <th className="py-1.5 font-medium">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.classIds.map((classId) => {
                        const perClass = studentStats(studentId, records, classId)
                        return (
                          <tr key={classId} className="border-t border-app-border">
                            <td className="py-1.5 pr-4 text-app-foreground">{classById.get(classId)?.name ?? 'Class'}</td>
                            <td className="py-1.5 pr-4 tabular-nums">{formatPercent(perClass.average)}</td>
                            <td className="py-1.5 tabular-nums">{formatCompletion(perClass)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section>
              <h4 className="mb-2 text-xs font-medium tracking-wide text-app-muted uppercase">Quiz history</h4>
              {stats.history.length === 0 ? (
                <p className="text-sm text-app-muted">No quizzes have been posted to {scopeClassId ? 'this class' : "this student's classes"} yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="text-xs text-app-muted">
                      <tr>
                        <th className="py-1.5 pr-4 font-medium">Quiz</th>
                        <th className="py-1.5 pr-4 font-medium">Class</th>
                        <th className="py-1.5 pr-4 font-medium">Slides</th>
                        <th className="py-1.5 pr-4 font-medium">Score</th>
                        <th className="py-1.5 font-medium">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.history.map((h) => {
                        const quiz = quizById.get(h.quizId)
                        return (
                          <tr key={`${h.quizId}-${h.classId}`} className="border-t border-app-border">
                            <td className="py-1.5 pr-4 text-app-foreground">{quiz?.title ?? 'Quiz'}</td>
                            <td className="py-1.5 pr-4">{classById.get(h.classId)?.name ?? 'Class'}</td>
                            <td className="py-1.5 pr-4 text-app-muted">{quiz ? formatSlideRange(quiz.slideNumbers) || '—' : '—'}</td>
                            <td className="py-1.5 pr-4 tabular-nums">
                              {h.attempt ? (
                                formatPercent(h.attempt.score)
                              ) : (
                                <span className="font-medium text-red-600 dark:text-red-400">Missing</span>
                              )}
                            </td>
                            <td className="py-1.5 text-app-muted">{h.attempt ? formatDate(h.attempt.submittedAt) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/pages/classroom/StudentsPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { loadTeacherClassroom } from '@/classroom/api'
import { matchesQuery, plural } from '@/classroom/format'
import { rosterOf } from '@/classroom/stats'
import { useAsync } from '@/classroom/useAsync'
import { DashboardShell } from '@/components/home/DashboardShell'
import { ClassFilter } from '@/components/classroom/ClassFilter'
import { LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { StudentRow } from '@/components/classroom/StudentRow'
import { Button } from '@/components/ui/Button'

export function StudentsPage() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadTeacherClassroom, userId)
  const [query, setQuery] = useState('')
  const [classId, setClassId] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const data = state.status === 'ready' ? state.data : null
  const everyone = useMemo(() => (data ? rosterOf(data.members, data.students) : []), [data])
  const roster = useMemo(
    () =>
      everyone.filter(
        (e) =>
          (!classId || e.classIds.includes(classId)) &&
          matchesQuery(query, e.student.displayName, e.student.email),
      ),
    [everyone, classId, query],
  )

  const subtitle = data
    ? everyone.length > 0
      ? `${plural(everyone.length, 'student')} across your classes · Select a student for details`
      : 'Students appear here once they join one of your classes'
    : 'Loading your students…'

  return (
    <DashboardShell title="Students" subtitle={subtitle} query={query} onQueryChange={setQuery}>
      <Panel toolbar={data && data.classes.length > 0 ? <ClassFilter classes={data.classes} value={classId} onChange={setClassId} /> : undefined}>
        {state.status === 'loading' ? (
          <RowsSkeleton />
        ) : state.status === 'error' ? (
          <LoadError message={state.error} onRetry={reload} />
        ) : state.data.classes.length === 0 ? (
          <PanelMessage
            title="No classes yet"
            body="Create a class and share its code — students show up here as they join."
            action={
              <Button variant="primary" onClick={() => void navigate('/classroom/classes')}>
                Go to Classes
              </Button>
            }
          />
        ) : everyone.length === 0 ? (
          <PanelMessage
            title="No students yet"
            body="Share a class's join code. Students sign up as a Student account and enter it."
          />
        ) : roster.length === 0 ? (
          <PanelMessage
            title="No students match"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('')
                  setClassId('')
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {roster.map((entry) => (
              <StudentRow
                key={entry.student.id}
                entry={entry}
                classes={state.data.classes}
                quizzes={state.data.quizzes}
                records={state.data}
                scopeClassId={classId || undefined}
                expanded={expandedId === entry.student.id}
                onToggle={() => setExpandedId((open) => (open === entry.student.id ? null : entry.student.id))}
              />
            ))}
          </div>
        )}
      </Panel>
    </DashboardShell>
  )
}
```

`records={state.data}` works because `TeacherClassroom` structurally satisfies `ClassroomRecords` (it has `members`, `postings`, `attempts`).

- [ ] **Step 4: Add the route in `src/App.tsx`**

Add `import { StudentsPage } from '@/pages/classroom/StudentsPage'` and, after the `/classroom/classes` route:

```tsx
        <Route path="/classroom/students" element={teacherOnly(<StudentsPage />)} />
```

- [ ] **Step 5: Verify**

Run: `npm run build` — Expected: exit 0.
Run: `npm run lint` — Expected: 0 errors.

Manual (Teacher with a class; a Student account that has joined it — joining UI arrives in Task 11, so for now insert a membership in the Supabase SQL editor: `insert into class_members (class_id, student_id) values ('<class id>', '<student user id>');`):
1. `/classroom/students` lists the student once with a class chip, Average `—`, Completed `—`, sparkline `—`, "Not enough data".
2. Click the row: it expands (chevron flips), showing "No submitted quizzes yet." and the no-quizzes message. Click again: it collapses. Opening another row closes the first. Tab to a row and press Enter/Space: it toggles.
3. To see real numbers, seed data as postgres in the SQL editor (a quiz, a question, a `quiz_classes` posting, 4+ `quiz_attempts` with varied scores and `submitted_at`). Reload: the average, completion, sparkline, trend arrow, the chart and the history table (including a **Missing** row for an unattempted posting) all render. Delete the seed rows afterwards.
4. Class filter narrows the list and re-scopes the numbers; search in the rail filters by name/email.

- [ ] **Step 6: Commit**

```bash
git add src/components/classroom/charts.tsx src/components/classroom/StudentRow.tsx src/pages/classroom/StudentsPage.tsx src/App.tsx
git commit -m "Classroom: Students page with expandable performance rows

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 9: Quiz rows and the Quizzes page

**Files:**
- Create: `src/components/classroom/QuizRow.tsx`
- Create: `src/pages/classroom/QuizzesPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `selectQuizzes`, `QuizSort` (Task 3); `formatSlideRange`, `formatDate`, `plural` (Task 3); `loadTeacherClassroom`, `useAsync` (Task 4); `Panel`, `PanelMessage`, `LoadError`, `RowsSkeleton`, `ClassChip`, `ClassFilter`, `teacherOnly` (Task 7).
- Produces: `QuizRow({ quiz: QuizSummary; postedIn: ClassRoom[] })` (reused by the class folder in Task 10).

- [ ] **Step 1: Create `src/components/classroom/QuizRow.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { formatDate } from '@/classroom/format'
import { formatSlideRange } from '@/classroom/slideRange'
import type { ClassRoom, QuizSummary } from '@/classroom/types'
import { ClassChip } from './ClassChip'

/** Which slides a quiz came from, where it is posted, and when it was generated. */
export function QuizRow({ quiz, postedIn }: { quiz: QuizSummary; postedIn: ClassRoom[] }) {
  const slides = formatSlideRange(quiz.slideNumbers)

  return (
    <div className="flex flex-col gap-2 rounded-app-sm border border-app-border px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-app-foreground">{quiz.title}</p>
        <p className="truncate text-xs text-app-muted">
          From{' '}
          {quiz.presentationId ? (
            <Link to={`/deck/${quiz.presentationId}`} className="font-medium text-app-accent-text hover:underline">
              {quiz.deckTitle}
            </Link>
          ) : (
            <>
              <span className="font-medium text-app-foreground">{quiz.deckTitle}</span> (deck deleted)
            </>
          )}
          {slides && ` · ${slides}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {postedIn.length === 0 ? (
          <span className="text-xs text-app-muted">Not posted</span>
        ) : (
          postedIn.map((c) => <ClassChip key={c.id} name={c.name} />)
        )}
      </div>
      <p className="shrink-0 text-xs text-app-muted">Generated {formatDate(quiz.createdAt)}</p>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/pages/classroom/QuizzesPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { loadTeacherClassroom } from '@/classroom/api'
import { plural } from '@/classroom/format'
import { selectQuizzes, type QuizSort } from '@/classroom/select'
import { useAsync } from '@/classroom/useAsync'
import { DashboardShell } from '@/components/home/DashboardShell'
import { ClassFilter } from '@/components/classroom/ClassFilter'
import { LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { QuizRow } from '@/components/classroom/QuizRow'
import { Button } from '@/components/ui/Button'

export function QuizzesPage() {
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadTeacherClassroom, userId)
  const [query, setQuery] = useState('')
  const [classId, setClassId] = useState('')
  const [sort, setSort] = useState<QuizSort>('newest')

  const data = state.status === 'ready' ? state.data : null
  const visible = useMemo(
    () => (data ? selectQuizzes(data.quizzes, data.postings, { query, classId, sort }) : []),
    [data, query, classId, sort],
  )

  const subtitle = data
    ? data.quizzes.length > 0
      ? `${plural(data.quizzes.length, 'quiz', 'quizzes')} · Generated from your decks`
      : 'Quizzes you generate from a deck will show up here'
    : 'Loading your quizzes…'

  return (
    <DashboardShell title="Quizzes" subtitle={subtitle} query={query} onQueryChange={setQuery}>
      <Panel
        toolbar={
          data && data.quizzes.length > 0 ? (
            <>
              <ClassFilter classes={data.classes} value={classId} onChange={setClassId} />
              <label className="flex items-center gap-2 text-sm text-app-muted">
                <span>Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as QuizSort)}
                  className="rounded-app-sm border border-app-border bg-app-background px-2.5 py-1.5 text-sm text-app-foreground outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/25"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
            </>
          ) : undefined
        }
      >
        {state.status === 'loading' ? (
          <RowsSkeleton />
        ) : state.status === 'error' ? (
          <LoadError message={state.error} onRetry={reload} />
        ) : state.data.quizzes.length === 0 ? (
          <PanelMessage
            title="No quizzes yet"
            body="Quizzes you generate from a deck will show up here, with the slides they came from and the classes they're posted in."
          />
        ) : visible.length === 0 ? (
          <PanelMessage
            title="No quizzes match"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('')
                  setClassId('')
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((quiz) => {
              const postedClassIds = new Set(
                state.data.postings.filter((p) => p.quizId === quiz.id).map((p) => p.classId),
              )
              return (
                <QuizRow
                  key={quiz.id}
                  quiz={quiz}
                  postedIn={state.data.classes.filter((c) => postedClassIds.has(c.id))}
                />
              )
            })}
          </div>
        )}
      </Panel>
    </DashboardShell>
  )
}
```

- [ ] **Step 3: Add the route in `src/App.tsx`**

Add `import { QuizzesPage } from '@/pages/classroom/QuizzesPage'` and, after the `/classroom/students` route:

```tsx
        <Route path="/classroom/quizzes" element={teacherOnly(<QuizzesPage />)} />
```

- [ ] **Step 4: Verify**

Run: `npm run build` — Expected: exit 0.
Run: `npm run lint` — Expected: 0 errors.

Manual (Teacher):
1. `/classroom/quizzes` with no quizzes shows "No quizzes yet" and no toolbar.
2. Seed as postgres: two quizzes for this teacher (one with `presentation_id` of a real deck, one with `null`), questions citing slides `2, 3, 4, 5, 8` on the first, and a `quiz_classes` posting for the first only. Reload: the first reads "From <deck link> · slides 2–5, 8", shows its class chip and "Generated <date>"; the second reads "From <deck title> (deck deleted)" and "Not posted". The deck link opens the editor.
3. Class filter shows only the posted quiz; Sort flips order; rail search matches title or deck title. Delete the seed rows afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/components/classroom/QuizRow.tsx src/pages/classroom/QuizzesPage.tsx src/App.tsx
git commit -m "Classroom: Quizzes page with source slides, postings and date generated

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 10: Announcements and the class folder

**Files:**
- Create: `src/components/classroom/AnnouncementList.tsx`
- Create: `src/pages/classroom/ClassFolderPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `loadTeacherClassroom`, `updateClass`, `regenerateJoinCode`, `removeMembership`, `createAnnouncement`, `updateAnnouncement`, `deleteAnnouncement`, `useAsync`, `invalidateMyClasses` (Task 4); `rosterOf`, `RosterEntry`, `matchesQuery`, `plural`, `formatDate` (Task 3); `StudentRow` (Task 8); `QuizRow` (Task 9); `Panel`, `PanelMessage`, `LoadError`, `RowsSkeleton`, `ClassUnavailable`, `ConfirmModal`, `ClassFormModal`, `JoinCodeChip`, `teacherOnly` (Task 7).
- Produces: `AnnouncementList({ announcements: Announcement[]; emptyMessage: string; editable?: { onCreate: (d: AnnouncementDetails) => Promise<void>; onUpdate: (id: string, d: AnnouncementDetails) => Promise<void>; onDelete: (a: Announcement) => void } })` — omit `editable` for the read-only student view (Task 11).

- [ ] **Step 1: Create `src/components/classroom/AnnouncementList.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import { describeError } from '@/store/presentationStore'
import { formatDate } from '@/classroom/format'
import type { Announcement, AnnouncementDetails } from '@/classroom/types'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'

function AnnouncementForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: AnnouncementDetails
  submitLabel: string
  onSubmit: (details: AnnouncementDetails) => Promise<void>
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setTitleError('Give the announcement a title.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ title, body })
      if (!initial) {
        setTitle('')
        setBody('')
      }
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3">
      <Field
        label="Title"
        error={titleError}
        render={(fieldProps) => (
          <Input
            {...fieldProps}
            maxLength={160}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (titleError) setTitleError(null)
            }}
          />
        )}
      />
      <Field
        label="Message"
        render={(fieldProps) => (
          <Textarea
            id={fieldProps.id}
            aria-describedby={fieldProps['aria-describedby']}
            rows={3}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        )}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** A class's announcements, newest first. With `editable`, a composer on top and Edit/Delete on each. */
export function AnnouncementList({
  announcements,
  emptyMessage,
  editable,
}: {
  announcements: Announcement[]
  emptyMessage: string
  editable?: {
    onCreate: (details: AnnouncementDetails) => Promise<void>
    onUpdate: (id: string, details: AnnouncementDetails) => Promise<void>
    onDelete: (announcement: Announcement) => void
  }
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <div className="rounded-app-sm border border-app-border bg-app-surface/40 p-4">
          <AnnouncementForm submitLabel="Post announcement" onSubmit={editable.onCreate} />
        </div>
      )}

      {announcements.length === 0 ? (
        <p className="py-6 text-center text-sm text-app-muted">{emptyMessage}</p>
      ) : (
        announcements.map((a) =>
          editable && editingId === a.id ? (
            <div key={a.id} className="rounded-app-sm border border-app-accent/50 p-4">
              <AnnouncementForm
                initial={{ title: a.title, body: a.body }}
                submitLabel="Save changes"
                onCancel={() => setEditingId(null)}
                onSubmit={async (details) => {
                  await editable.onUpdate(a.id, details)
                  setEditingId(null)
                }}
              />
            </div>
          ) : (
            <article key={a.id} className="rounded-app-sm border border-app-border px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-app-foreground">{a.title}</h3>
                  <p className="text-xs text-app-muted">
                    {formatDate(a.createdAt)}
                    {a.updatedAt !== a.createdAt && ' · edited'}
                  </p>
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditingId(a.id)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs text-red-600 dark:text-red-400"
                      onClick={() => editable.onDelete(a)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
              {a.body && <p className="mt-2 text-sm whitespace-pre-line text-app-foreground/90">{a.body}</p>}
            </article>
          ),
        )
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/pages/classroom/ClassFolderPage.tsx`**

```tsx
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import {
  createAnnouncement,
  deleteAnnouncement,
  loadTeacherClassroom,
  regenerateJoinCode,
  removeMembership,
  updateAnnouncement,
  updateClass,
} from '@/classroom/api'
import { matchesQuery, personLabel, plural } from '@/classroom/format'
import { rosterOf, type RosterEntry } from '@/classroom/stats'
import type { Announcement } from '@/classroom/types'
import { useAsync } from '@/classroom/useAsync'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import { DashboardShell } from '@/components/home/DashboardShell'
import { AnnouncementList } from '@/components/classroom/AnnouncementList'
import { ClassFormModal } from '@/components/classroom/ClassFormModal'
import { ConfirmModal } from '@/components/classroom/ConfirmModal'
import { JoinCodeChip } from '@/components/classroom/JoinCodeChip'
import { ClassUnavailable, LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { QuizRow } from '@/components/classroom/QuizRow'
import { StudentRow } from '@/components/classroom/StudentRow'
import { Button } from '@/components/ui/Button'

type Tab = 'students' | 'announcements' | 'quizzes'

/** Unknown or missing `?tab=` lands on Students rather than an empty panel. */
function parseTab(value: string | null): Tab {
  return value === 'announcements' || value === 'quizzes' ? value : 'students'
}

/**
 * One class as a folder: its students, announcements and quizzes behind tabs.
 * The tab lives in the URL so a reload or a shared link opens the same one.
 */
export function ClassFolderPage() {
  const { classId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = parseTab(params.get('tab'))
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadTeacherClassroom, userId)
  const [query, setQuery] = useState('')
  const [editingDetails, setEditingDetails] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<RosterEntry | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (state.status !== 'ready') {
    return (
      <DashboardShell title="Class" query={query} onQueryChange={setQuery}>
        <Panel>
          {state.status === 'loading' ? <RowsSkeleton /> : <LoadError message={state.error} onRetry={reload} />}
        </Panel>
      </DashboardShell>
    )
  }

  const data = state.data
  const classRoom = data.classes.find((c) => c.id === classId)
  if (!classRoom) {
    return (
      <DashboardShell title="Class" query={query} onQueryChange={setQuery}>
        <ClassUnavailable backTo="/classroom/classes" backLabel="Back to Classes" />
      </DashboardShell>
    )
  }

  const fullRoster = rosterOf(data.members, data.students, classRoom.id)
  const roster = fullRoster.filter((e) => matchesQuery(query, e.student.displayName, e.student.email))
  const classAnnouncements = data.announcements.filter((a) => a.classId === classRoom.id)
  const announcements = classAnnouncements.filter((a) => matchesQuery(query, a.title, a.body))
  const postedQuizIds = new Set(data.postings.filter((p) => p.classId === classRoom.id).map((p) => p.quizId))
  const classQuizzes = data.quizzes.filter((q) => postedQuizIds.has(q.id))
  const quizzes = classQuizzes.filter((q) => matchesQuery(query, q.title, q.deckTitle))

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'students', label: 'Students', count: fullRoster.length },
    { value: 'announcements', label: 'Announcements', count: classAnnouncements.length },
    { value: 'quizzes', label: 'Quizzes', count: classQuizzes.length },
  ]

  return (
    <DashboardShell
      title={classRoom.name}
      subtitle={classRoom.description || `${plural(fullRoster.length, 'student')} · Share the code below to add students`}
      query={query}
      onQueryChange={setQuery}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-app-muted">Join code</span>
        <JoinCodeChip code={classRoom.joinCode} />
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setConfirmRegenerate(true)}>
          Regenerate
        </Button>
        <Button variant="secondary" className="ml-auto px-3 py-1.5 text-xs" onClick={() => setEditingDetails(true)}>
          Edit details
        </Button>
      </div>

      <Panel
        toolbar={
          <div role="tablist" aria-label="Class sections" className="flex flex-wrap gap-1 rounded-app-sm bg-app-surface p-1">
            {tabs.map((t) => {
              const active = t.value === tab
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParams({ tab: t.value }, { replace: true })}
                  className={`flex cursor-pointer items-center gap-2 rounded-[calc(var(--app-radius-sm)-2px)] px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
                    active ? 'bg-app-background font-medium text-app-foreground shadow-sm' : 'text-app-muted hover:text-app-foreground'
                  }`}
                >
                  {t.label}
                  <span className="text-xs text-app-muted tabular-nums">{t.count}</span>
                </button>
              )
            })}
          </div>
        }
      >
        <div role="tabpanel">
          {tab === 'students' &&
            (fullRoster.length === 0 ? (
              <PanelMessage
                title="No students yet"
                body={`Students join by signing up as a Student and entering ${classRoom.joinCode}.`}
              />
            ) : roster.length === 0 ? (
              <PanelMessage title="No students match your search" />
            ) : (
              <div className="flex flex-col gap-2">
                {roster.map((entry) => (
                  <StudentRow
                    key={entry.student.id}
                    entry={entry}
                    classes={data.classes}
                    quizzes={data.quizzes}
                    records={data}
                    scopeClassId={classRoom.id}
                    expanded={expandedId === entry.student.id}
                    onToggle={() => setExpandedId((open) => (open === entry.student.id ? null : entry.student.id))}
                    onRemove={() => setPendingRemoval(entry)}
                  />
                ))}
              </div>
            ))}

          {tab === 'announcements' && (
            <AnnouncementList
              announcements={announcements}
              emptyMessage={classAnnouncements.length === 0 ? 'No announcements yet.' : 'No announcements match your search.'}
              editable={{
                onCreate: async (details) => {
                  await createAnnouncement(classRoom.id, details)
                  reload()
                },
                onUpdate: async (id, details) => {
                  await updateAnnouncement(id, details)
                  reload()
                },
                onDelete: setPendingDelete,
              }}
            />
          )}

          {tab === 'quizzes' &&
            (classQuizzes.length === 0 ? (
              <PanelMessage title="No quizzes posted" body="Quizzes will appear here once they're generated and posted to this class." />
            ) : quizzes.length === 0 ? (
              <PanelMessage title="No quizzes match your search" />
            ) : (
              <div className="flex flex-col gap-2">
                {quizzes.map((quiz) => {
                  const postedClassIds = new Set(data.postings.filter((p) => p.quizId === quiz.id).map((p) => p.classId))
                  return (
                    <QuizRow key={quiz.id} quiz={quiz} postedIn={data.classes.filter((c) => postedClassIds.has(c.id))} />
                  )
                })}
              </div>
            ))}
        </div>
      </Panel>

      {editingDetails && (
        <ClassFormModal
          title="Edit class details"
          submitLabel="Save changes"
          initial={{ name: classRoom.name, description: classRoom.description }}
          onCancel={() => setEditingDetails(false)}
          onSubmit={async (details) => {
            await updateClass(classRoom.id, details)
            setEditingDetails(false)
            invalidateMyClasses()
            reload()
          }}
        />
      )}

      {confirmRegenerate && (
        <ConfirmModal
          title="Regenerate join code"
          confirmLabel="Regenerate"
          pendingLabel="Regenerating…"
          danger={false}
          onCancel={() => setConfirmRegenerate(false)}
          onConfirm={async () => {
            await regenerateJoinCode(classRoom.id)
            setConfirmRegenerate(false)
            reload()
          }}
        >
          <p>
            <span className="font-mono text-app-foreground">{classRoom.joinCode}</span> will stop working immediately.
            Students already in the class stay in it.
          </p>
        </ConfirmModal>
      )}

      {pendingRemoval && (
        <ConfirmModal
          title="Remove student"
          confirmLabel="Remove"
          pendingLabel="Removing…"
          onCancel={() => setPendingRemoval(null)}
          onConfirm={async () => {
            await removeMembership(classRoom.id, pendingRemoval.student.id)
            setPendingRemoval(null)
            setExpandedId(null)
            reload()
          }}
        >
          <p>
            Remove <span className="font-medium text-app-foreground">{personLabel(pendingRemoval.student)}</span> from{' '}
            {classRoom.name}? They can rejoin with the class code. Their scores in this class stop showing here while
            they are out of it.
          </p>
        </ConfirmModal>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete announcement"
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await deleteAnnouncement(pendingDelete.id)
            setPendingDelete(null)
            reload()
          }}
        >
          <p>
            Delete <span className="font-medium text-app-foreground">“{pendingDelete.title}”</span>? Students will no
            longer see it. This can't be undone.
          </p>
        </ConfirmModal>
      )}
    </DashboardShell>
  )
}
```

- [ ] **Step 3: Add the route in `src/App.tsx`**

Add `import { ClassFolderPage } from '@/pages/classroom/ClassFolderPage'` and, after the `/classroom/classes` route:

```tsx
        <Route path="/classroom/classes/:classId" element={teacherOnly(<ClassFolderPage />)} />
```

- [ ] **Step 4: Verify**

Run: `npm run build` — Expected: exit 0.
Run: `npm run lint` — Expected: 0 errors (this page declares all hooks before its early returns; if `react-hooks/rules-of-hooks` fires, a hook was added below them — move it up).

Manual (Teacher, one class):
1. Open a class from Classes: title is the class name, join code chip + Regenerate + Edit details above the panel; tabs show counts.
2. `?tab=announcements` in the URL survives a reload. An unknown `?tab=x` shows Students.
3. Announcements: posting with an empty title shows "Give the announcement a title."; a valid post appears at the top and the composer clears; Edit → Save shows "· edited"; Delete asks, then removes it.
4. Regenerate → confirm: the chip shows a new code.
5. Edit details: renaming updates the title and the rail badge list without a reload.
6. Students tab (with a membership inserted as in Task 8): row expands scoped to this class; Remove → confirm → the student disappears.
7. `/classroom/classes/00000000-0000-0000-0000-000000000000` shows "This class isn't available" with a working Back to Classes button.

- [ ] **Step 5: Commit**

```bash
git add src/components/classroom/AnnouncementList.tsx src/pages/classroom/ClassFolderPage.tsx src/App.tsx
git commit -m "Classroom: class folder with students, announcements and quizzes tabs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 11: Student side — join a class, my classes, a class's announcements

**Files:**
- Create: `src/pages/classroom/MyClassesPage.tsx`
- Create: `src/pages/classroom/StudentClassPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `loadStudentClassroom`, `joinClass`, `removeMembership`, `useAsync`, `invalidateMyClasses` (Task 4); `joinCodeProblem`, `normalizeJoinCode`, `JOIN_CODE_LENGTH`, `matchesQuery`, `personLabel`, `plural` (Task 3); `relativePostedAt`, `Panel`, `PanelMessage`, `LoadError`, `RowsSkeleton`, `ClassUnavailable`, `ConfirmModal` (Task 7); `AnnouncementList` read-only (Task 10); `RequireRole` (Task 2).
- Produces: routes `/classes` and `/classes/:classId`; `studentOnly(element: ReactNode)` in `App.tsx`.

- [ ] **Step 1: Create `src/pages/classroom/MyClassesPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { describeError } from '@/store/presentationStore'
import { joinClass, loadStudentClassroom } from '@/classroom/api'
import { matchesQuery, personLabel, plural } from '@/classroom/format'
import { JOIN_CODE_LENGTH, joinCodeProblem, normalizeJoinCode } from '@/classroom/joinCode'
import { useAsync } from '@/classroom/useAsync'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import { DashboardShell } from '@/components/home/DashboardShell'
import { relativePostedAt } from '@/components/home/relativeTime'
import { LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

export function MyClassesPage() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadStudentClassroom, userId)
  const [query, setQuery] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  async function join(e: FormEvent) {
    e.preventDefault()
    const problem = joinCodeProblem(code)
    if (problem) {
      setCodeError(problem)
      return
    }
    setJoining(true)
    setCodeError(null)
    try {
      const classId = await joinClass(code)
      invalidateMyClasses()
      void navigate(`/classes/${classId}`)
    } catch (err) {
      setCodeError(describeError(err))
      setJoining(false)
    }
  }

  const data = state.status === 'ready' ? state.data : null
  const visible = data ? data.classes.filter((c) => matchesQuery(query, c.name, c.description)) : []

  return (
    <DashboardShell
      title="My classes"
      subtitle={data ? (data.classes.length > 0 ? plural(data.classes.length, 'class', 'classes') : 'Join a class with the code your teacher shares') : 'Loading your classes…'}
      query={query}
      onQueryChange={setQuery}
    >
      <div className="mb-6 rounded-app border border-app-border bg-app-background p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-app-foreground">Join a class</h2>
        <form onSubmit={(e) => void join(e)} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="sm:w-60">
            <Field
              label="Class code"
              error={codeError}
              render={(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={code}
                  onChange={(e) => {
                    setCode(normalizeJoinCode(e.target.value).slice(0, JOIN_CODE_LENGTH))
                    if (codeError) setCodeError(null)
                  }}
                  placeholder="e.g. QWERT9"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="font-mono tracking-[0.2em]"
                />
              )}
            />
          </div>
          <Button type="submit" variant="primary" loading={joining} className="sm:mt-5">
            {joining ? 'Joining…' : 'Join class'}
          </Button>
        </form>
      </div>

      <Panel>
        {state.status === 'loading' ? (
          <RowsSkeleton count={3} />
        ) : state.status === 'error' ? (
          <LoadError message={state.error} onRetry={reload} />
        ) : state.data.classes.length === 0 ? (
          <PanelMessage title="You're not in any classes yet" body="Ask your teacher for the class code and enter it above." />
        ) : visible.length === 0 ? (
          <PanelMessage
            title={`No classes match “${query.trim()}”`}
            action={
              <Button variant="secondary" onClick={() => setQuery('')}>
                Clear search
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => {
              const teacher = state.data.teachers.find((t) => t.id === c.teacherId)
              const latest = state.data.announcements.find((a) => a.classId === c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void navigate(`/classes/${c.id}`)}
                  className="flex cursor-pointer flex-col items-start gap-1 rounded-app border border-app-border bg-app-background px-5 py-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                >
                  <span className="text-base font-semibold text-app-foreground">{c.name}</span>
                  <span className="text-xs text-app-muted">{teacher ? `Taught by ${personLabel(teacher)}` : 'Your teacher'}</span>
                  <span className="mt-2 line-clamp-2 text-sm text-app-muted">
                    {latest ? `${latest.title} · ${relativePostedAt(latest.createdAt)}` : 'No announcements yet'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Panel>
    </DashboardShell>
  )
}
```

- [ ] **Step 2: Create `src/pages/classroom/StudentClassPage.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { loadStudentClassroom, removeMembership } from '@/classroom/api'
import { matchesQuery, personLabel } from '@/classroom/format'
import { useAsync } from '@/classroom/useAsync'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import { DashboardShell } from '@/components/home/DashboardShell'
import { AnnouncementList } from '@/components/classroom/AnnouncementList'
import { ConfirmModal } from '@/components/classroom/ConfirmModal'
import { ClassUnavailable, LoadError, Panel, RowsSkeleton } from '@/components/classroom/Panel'
import { Button } from '@/components/ui/Button'

export function StudentClassPage() {
  const { classId = '' } = useParams()
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadStudentClassroom, userId)
  const [query, setQuery] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)

  if (state.status !== 'ready') {
    return (
      <DashboardShell title="Class" query={query} onQueryChange={setQuery}>
        <Panel>
          {state.status === 'loading' ? <RowsSkeleton count={3} /> : <LoadError message={state.error} onRetry={reload} />}
        </Panel>
      </DashboardShell>
    )
  }

  const classRoom = state.data.classes.find((c) => c.id === classId)
  if (!classRoom) {
    return (
      <DashboardShell title="Class" query={query} onQueryChange={setQuery}>
        <ClassUnavailable backTo="/classes" backLabel="Back to My classes" />
      </DashboardShell>
    )
  }

  const teacher = state.data.teachers.find((t) => t.id === classRoom.teacherId)
  const classAnnouncements = state.data.announcements.filter((a) => a.classId === classRoom.id)
  const announcements = classAnnouncements.filter((a) => matchesQuery(query, a.title, a.body))

  return (
    <DashboardShell
      title={classRoom.name}
      subtitle={`Taught by ${teacher ? personLabel(teacher) : 'your teacher'}${classRoom.description ? ` · ${classRoom.description}` : ''}`}
      query={query}
      onQueryChange={setQuery}
    >
      <Panel
        toolbar={
          <>
            <h2 className="text-sm font-semibold text-app-foreground">Announcements</h2>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setConfirmLeave(true)}>
              Leave class
            </Button>
          </>
        }
      >
        <AnnouncementList
          announcements={announcements}
          emptyMessage={classAnnouncements.length === 0 ? 'Your teacher hasn\'t posted anything yet.' : 'No announcements match your search.'}
        />
      </Panel>

      {confirmLeave && (
        <ConfirmModal
          title="Leave class"
          confirmLabel="Leave class"
          pendingLabel="Leaving…"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={async () => {
            await removeMembership(classRoom.id, userId)
            invalidateMyClasses()
            void navigate('/classes')
          }}
        >
          <p>
            Leave <span className="font-medium text-app-foreground">{classRoom.name}</span>? You can rejoin later with the
            class code.
          </p>
        </ConfirmModal>
      )}
    </DashboardShell>
  )
}
```

- [ ] **Step 3: Add `studentOnly` and the routes in `src/App.tsx`**

Below `teacherOnly`, add:

```tsx
function studentOnly(element: ReactNode) {
  return (
    <RequireAuth>
      <RequireRole role="student">{element}</RequireRole>
    </RequireAuth>
  )
}
```

Add imports:

```tsx
import { MyClassesPage } from '@/pages/classroom/MyClassesPage'
import { StudentClassPage } from '@/pages/classroom/StudentClassPage'
```

After the teacher routes, add:

```tsx
        <Route path="/classes" element={studentOnly(<MyClassesPage />)} />
        <Route path="/classes/:classId" element={studentOnly(<StudentClassPage />)} />
```

- [ ] **Step 4: Verify**

Run: `npm run build` — Expected: exit 0.
Run: `npm run lint` — Expected: 0 errors.

Manual, end to end with two browsers (or a normal and a private window):
1. Teacher creates "Biology" and posts an announcement "Welcome".
2. Student → rail "Join a class": typing lowercase shows uppercase; `QWER0` → "Class codes are 6 characters."; `QWERO9` → the lookalike message; a well-formed code nobody has → "No class with that code." (no `(P0001)` suffix).
3. Student enters the teacher's code → lands on `/classes/<id>`: title Biology, "Taught by <teacher name>", the Welcome announcement, no Edit/Delete buttons. The rail lists Biology under My classes.
4. Teacher reloads Students: the student appears.
5. Student → Leave class → confirm → back on `/classes`, the rail no longer lists Biology.
6. Student → Account type → Teacher while still in a class → "Leave your classes before changing account type." After leaving, the change succeeds.
7. Teacher visiting `/classes` is redirected to `/`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/classroom/MyClassesPage.tsx src/pages/classroom/StudentClassPage.tsx src/App.tsx
git commit -m "Classroom: students join by code, see their classes and announcements

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

### Task 12: Document the classroom and verify the whole feature

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above. Produces nothing new.

- [ ] **Step 1: Extend the test-coverage list in `CLAUDE.md`**

In the Commands section's coverage paragraph, directly before ` No component/integration tests.`, insert:

```markdown
, plus the classroom's pure logic: `classroom/roles.test.ts` and `store/profile.test.ts` (that anything unreadable resolves to a General account rather than a locked one), `classroom/stats.test.ts` (completion is `—` with nothing expected, a missing quiz never lowers the average, the trend's four-score minimum and its ±5-point boundary under floating-point noise, per-class scoping), `classroom/slideRange.test.ts`, `classroom/joinCode.test.ts`, `classroom/format.test.ts`, `classroom/select.test.ts` and `classroom/rows.test.ts`. RLS is checked by hand with `supabase/tests/0009_classroom_rls.sql`
```

(Adjust the surrounding punctuation so the sentence still reads correctly.)

- [ ] **Step 2: Add a Classroom section to `CLAUDE.md`**

Insert this section immediately before `### PPTX export (`src/export/`)`:

```markdown
### Classroom (`src/classroom/`, `pages/classroom/`, `components/classroom/`)

Accounts have a type — **General, Teacher or Student** — picked at sign-up and changeable from the rail's Account type item. Every type keeps the deck tools; a teacher's rail adds **Classroom** (Classes, Students, Quizzes) and a student's adds **My classes**. Design doc: `docs/superpowers/specs/2026-09-14-teacher-classroom-design.md`. **Migration 0009 is required** before sign-up with a type, or any classroom page, works.

- **The type lives in `profiles`, created by a trigger on `auth.users`** from the sign-up metadata (`role`, `display_name`). `profiles.email` is a copy because the client cannot read `auth.users` and a roster has to say who someone is. A guard trigger pins `id`/`email`, and refuses to change type away from Teacher while the account owns a class, or away from Student while it is in one — otherwise a class would be left with a non-teacher owner or a non-student member.
- **`authStore` holds `status` at `'loading'` until the profile resolves**, so `RequireAuth` never renders a page before the type is known. The exception is load-bearing: a token refresh for the same user with a profile already loaded only swaps `user`. Flipping back to `'loading'` there would unmount the page on every refresh, the editor included.
- **Anything unreadable resolves to General** (`resolveProfile`): a failed read, no row, an unknown role. General is exactly the app before account types, so an un-migrated database degrades rather than locks everyone out.
- **No RLS policy selects from another RLS table.** "Read a class if you're a member" and "read members if you teach the class" reference each other and Postgres recurses. Every check goes through the `security definer` helpers `is_class_teacher`, `is_class_member`, `teaches_student`, `is_my_teacher`, `owns_quiz`, `can_read_quiz`. Adding a policy that joins tables directly will reintroduce the recursion.
- **Joining is only `join_class(p_code)`** — students have no insert policy on `class_members`, because a student cannot read a class they are not yet in. Codes use an alphabet without `0 O 1 I L` (`classroom/joinCode.ts` must match `generate_join_code()`).
- **Students cannot read `quiz_questions` at all**, because each row carries its `answer`. Quiz taking must add a `security definer` RPC that returns questions without answers and scores server-side — not a select policy.
- **Questions store their own text** (`prompt`, `slide_number`, `slide_heading`) rather than referencing live cards: students cannot read a teacher's cards, and editing a slide must not change a quiz that has already been scored. `quizzes.deck_title` is a snapshot for the same reason, and `presentation_id`/`card_id` are `on delete set null` links back.
- **An attempt records its class**, so a quiz posted to two of a student's classes keeps completion and per-class averages honest.
- **Statistics are defined once, in `classroom/stats.ts`**: expected = every posting in the student's current classes (no due dates, so late joiners are still expected); completion = submitted ÷ expected, `null` (shown `—`) when nothing is expected; average = submitted scores only, never counting a missing quiz as zero; trend = latest 3 vs the up-to-3 before, needs ≥ 4 scores, ±5 points, delta rounded before comparing. Attempts outside the student's current classes are ignored.
- **All reads/writes go through `classroom/api.ts`.** Update and delete writes `select` the affected rows and throw on zero, because RLS reports a forbidden write as "0 rows" rather than an error. RPC refusals are rethrown as `Error` with the bare message, since the SQL raises sentences meant for the user.
- **Pages load with `useAsync`**, which keeps data on screen during a reload after a write. There are no optimistic updates. The rail's class list is a separate `useSyncExternalStore` cache (`useMyClasses`) that every write changing the list must invalidate.
- **Every dashboard page renders through `DashboardShell`** (rail, drawer, title block); the rail's search filters whatever the page passes.
- **Nothing writes quizzes, questions, postings or attempts yet.** The Quizzes list, the class folder's Quizzes tab and every statistic show honest empty states until quiz generation and taking exist.
```

- [ ] **Step 3: Full verification**

Run: `npm run build` — Expected: exit 0.
Run: `npm run lint` — Expected: 0 errors.
Run: `npm run test` — Expected: every test passes; report the counts.

Ask the user to re-run `supabase/tests/0009_classroom_rls.sql` in the SQL editor. Expected: `classroom RLS checks passed`.

Manual regression pass (`npm run dev`), because Tasks 2, 5 and 6 touched shared code:
1. A General account: dashboard, create a deck, open the editor, stay idle past a token refresh (or call `supabase.auth.refreshSession()` from the console) — the editor does not flash "Loading…" or lose state.
2. Present, Narrate, Export, Drafts all still work; sign out and back in.
3. Mobile width (~400px): the rail drawer opens and closes on Home, Drafts, Classes, Students, Quizzes, a class folder, My classes and a student's class page.
4. Light and dark app theme on every classroom page: text, chips, charts and error states are readable.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Document account types and the classroom in CLAUDE.md

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CLoRQ8xmdGJK4nWpeuWso7"
```

- [ ] **Step 5: Hand off**

Use superpowers:finishing-a-development-branch to decide how the branch is integrated.
