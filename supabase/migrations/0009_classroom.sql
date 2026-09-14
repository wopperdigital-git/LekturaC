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
