-- Account type is chosen at sign-up and permanent, with exactly one exception:
-- a General account that joins a class becomes a Student.
--
-- 0009 let anyone update their own profiles.role and used the guard trigger to
-- refuse the two transitions that would strand rows (a class whose teacher is
-- no longer a teacher, a membership whose student is no longer a student).
-- Pinning the column closes the whole class of problem instead of enumerating
-- it, and removes a decision the user had no way to get right.
--
-- Run after 0009. Requires 0001 (presentations, themes).

-- The pin. `role` joins id/email/created_at as a column an update cannot move.
--
-- The one legal transition is performed inside join_class(), which announces
-- itself by setting a transaction-local flag to the id of the account being
-- promoted. Keying the flag to an id rather than a bare '1' means a promotion
-- authorized for one account cannot ride along and promote another in the same
-- transaction.
--
-- A hand-made change is pinned rather than rejected: the account type is no
-- longer something the user can act on, so an exception would report a failure
-- for an action no part of the UI offers. 0009's two "hand off your classes
-- first" exceptions are unreachable once the column can't move by hand, so
-- they come out with it.
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

  if new.role is distinct from old.role
     and coalesce(current_setting('app.role_promotion', true), '') <> old.id::text then
    new.role := old.role;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_update on profiles;
create trigger profiles_guard_update
  before update on profiles
  for each row execute function guard_profile_update();

-- Joining is still the only way into class_members, and still refuses a
-- teacher. What changes: a General account is promoted to Student instead of
-- being turned away, in the same transaction as the membership insert.
--
-- Both halves have to land together. A General account that joined without
-- being promoted would sit in a class it can read (is_class_member) while the
-- rail offers it no way to see it; a promotion without a membership would
-- change the account type for nothing. The promotion also has to come first,
-- because class_members_require_student() rejects a non-student insert.
create or replace function join_class(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  caller_role text;
begin
  if auth.uid() is null then
    raise exception 'Log in to join a class.';
  end if;

  select role into caller_role from profiles where id = auth.uid();
  if caller_role is null then
    raise exception 'Your account profile isn''t set up yet.';
  end if;

  -- A teacher becoming a student would leave every class they own with an
  -- owner who is no longer a teacher.
  if caller_role = 'teacher' then
    raise exception 'Teacher accounts cannot join a class.';
  end if;

  select id into target from classes where join_code = upper(trim(p_code));
  if target is null then
    raise exception 'No class with that code.';
  end if;

  if caller_role = 'general' then
    perform set_config('app.role_promotion', auth.uid()::text, true);
    update profiles set role = 'student' where id = auth.uid();
    perform set_config('app.role_promotion', '', true);
  end if;

  insert into class_members (class_id, student_id)
  values (target, auth.uid())
  on conflict do nothing;

  return target;
end;
$$;

-- Account deletion. The anon key cannot touch auth.users, so this is the only
-- route, and it is deliberately caller-scoped: it takes no argument and reads
-- auth.uid(), so it cannot be aimed at anyone else.
--
-- presentations has no foreign key to auth.users, so deleting the user alone
-- would leave its decks as rows no account can ever read again (RLS scopes
-- them to owner_id = auth.uid()). They are deleted explicitly; cards cascade
-- from presentations. profiles cascades from auth.users, and classes,
-- class_members, announcements, quizzes, quiz_questions, quiz_classes and
-- quiz_attempts all cascade from profiles -- so deleting a teacher also
-- deletes the classes they own and everything posted in them.
create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Log in to delete your account.';
  end if;

  delete from presentations where owner_id = me;
  delete from themes where owner_id = me;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function delete_own_account() from public, anon;
grant execute on function delete_own_account() to authenticated;
