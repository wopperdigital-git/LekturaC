-- Hand-run checks for 0010_lock_account_type.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying 0010.
-- Everything happens inside one transaction that rolls back, so no fixture
-- survives. Any failed check raises and aborts with a message naming it; a
-- clean run ends by printing "account type lock checks passed".
--
-- Same shape as 0009_classroom_rls.sql: fixtures as postgres, then each check
-- under `set local role authenticated` with a forged jwt claim, because these
-- functions all read auth.uid().

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a100-000000000001', 'lock-general@example.test',  '{"display_name":"Gene General"}'),
  ('00000000-0000-4000-a100-000000000002', 'lock-teacher@example.test',  '{"role":"teacher","display_name":"Tess Teacher"}'),
  ('00000000-0000-4000-a100-000000000003', 'lock-student@example.test',  '{"role":"student","display_name":"Sam Student"}'),
  ('00000000-0000-4000-a100-000000000004', 'lock-general2@example.test', '{"display_name":"Gus General"}');

insert into classes (id, teacher_id, name, join_code)
values ('00000000-0000-4000-b100-000000000001', '00000000-0000-4000-a100-000000000002', 'Lock Biology', 'ZXCVB8');

-- A deck for the General account, to prove account deletion takes its rows with it.
insert into presentations (id, owner_id, title)
values ('00000000-0000-4000-c100-000000000001', '00000000-0000-4000-a100-000000000004', 'Gus deck');
insert into cards (presentation_id, order_index, blocks)
values ('00000000-0000-4000-c100-000000000001', 0, '[]');

set local role authenticated;

-- ── a hand-made role change is ignored, not errored ─────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a100-000000000001","role":"authenticated"}', true);

do $$ begin
  -- succeeds (no exception) but must not move the column
  update profiles set role = 'teacher' where id = '00000000-0000-4000-a100-000000000001';
  if (select role from profiles where id = '00000000-0000-4000-a100-000000000001') <> 'general' then
    raise exception 'pin: a self-serve update changed the account type';
  end if;

  -- display_name is still editable through the same policy
  update profiles set display_name = 'Renamed' where id = '00000000-0000-4000-a100-000000000001';
  if (select display_name from profiles where id = '00000000-0000-4000-a100-000000000001') <> 'Renamed' then
    raise exception 'pin: display_name should still be editable';
  end if;
end $$;

-- ── the flag alone cannot promote: it must name the account being changed ───
do $$ begin
  perform set_config('app.role_promotion', 'yes', true);
  update profiles set role = 'student' where id = '00000000-0000-4000-a100-000000000001';
  perform set_config('app.role_promotion', '', true);
  if (select role from profiles where id = '00000000-0000-4000-a100-000000000001') <> 'general' then
    raise exception 'pin: a flag not keyed to the row promoted it anyway';
  end if;
end $$;

-- ── General joining a class is promoted exactly once ───────────────────────
do $$
declare
  joined uuid;
begin
  joined := join_class('zxcvb8');  -- lowercase: the code is normalized
  if joined <> '00000000-0000-4000-b100-000000000001' then
    raise exception 'join_class: wrong class returned';
  end if;
  if (select role from profiles where id = '00000000-0000-4000-a100-000000000001') <> 'student' then
    raise exception 'join_class: General was not promoted to Student';
  end if;
  if not exists (
    select 1 from class_members
    where class_id = '00000000-0000-4000-b100-000000000001'
      and student_id = '00000000-0000-4000-a100-000000000001'
  ) then
    raise exception 'join_class: membership row missing';
  end if;

  -- the flag must not outlive the call
  if coalesce(current_setting('app.role_promotion', true), '') <> '' then
    raise exception 'join_class: promotion flag left set after the call';
  end if;

  -- joining again is a no-op, not a second promotion or a duplicate row
  perform join_class('ZXCVB8');
  if (select count(*) from class_members
      where class_id = '00000000-0000-4000-b100-000000000001'
        and student_id = '00000000-0000-4000-a100-000000000001') <> 1 then
    raise exception 'join_class: re-joining duplicated the membership';
  end if;
end $$;

-- ── a Student still joins, and stays a Student ─────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a100-000000000003","role":"authenticated"}', true);

do $$ begin
  perform join_class('ZXCVB8');
  if (select role from profiles where id = '00000000-0000-4000-a100-000000000003') <> 'student' then
    raise exception 'join_class: an existing Student should be unchanged';
  end if;
end $$;

-- ── a Teacher is refused, and keeps both role and classes ──────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a100-000000000002","role":"authenticated"}', true);

do $$
declare
  refused boolean := false;
begin
  begin
    perform join_class('ZXCVB8');
  exception when others then
    refused := true;
  end;
  if not refused then
    raise exception 'join_class: a Teacher was allowed to join';
  end if;
  if (select role from profiles where id = '00000000-0000-4000-a100-000000000002') <> 'teacher' then
    raise exception 'join_class: a refused Teacher was demoted anyway';
  end if;
  if not exists (select 1 from classes where id = '00000000-0000-4000-b100-000000000001') then
    raise exception 'join_class: a refused Teacher lost their class';
  end if;
end $$;

-- ── delete_own_account takes the caller's decks with it ────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a100-000000000004","role":"authenticated"}', true);

do $$ begin
  perform delete_own_account();

  if exists (select 1 from auth.users where id = '00000000-0000-4000-a100-000000000004') then
    raise exception 'delete_own_account: the auth user survived';
  end if;
  if exists (select 1 from profiles where id = '00000000-0000-4000-a100-000000000004') then
    raise exception 'delete_own_account: the profile survived';
  end if;
  -- the orphan case this function exists for: presentations has no FK to auth.users
  if exists (select 1 from presentations where owner_id = '00000000-0000-4000-a100-000000000004') then
    raise exception 'delete_own_account: decks were left orphaned';
  end if;
  if exists (select 1 from cards where presentation_id = '00000000-0000-4000-c100-000000000001') then
    raise exception 'delete_own_account: cards were left behind';
  end if;

  -- and nobody else's rows
  if not exists (select 1 from auth.users where id = '00000000-0000-4000-a100-000000000003') then
    raise exception 'delete_own_account: deleted an account other than the caller';
  end if;
end $$;

do $$ begin raise notice 'account type lock checks passed'; end $$;

rollback;
