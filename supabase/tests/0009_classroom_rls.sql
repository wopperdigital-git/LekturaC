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

do $$ declare touched integer; begin
  update classes set name = 'x' where id = '00000000-0000-4000-b000-000000000001';
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'teacher2: updated another teacher''s class'; end if;

  delete from classes where id = '00000000-0000-4000-b000-000000000001';
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'teacher2: deleted another teacher''s class'; end if;
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

  failed := false;
  begin
    insert into class_members (class_id, student_id)
    values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003');
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'outsider: inserted a membership directly'; end if;

  failed := false;
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

-- ── student 2 after outsider joins: classmate privacy ──────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from class_members) <> 1 then
    raise exception 'student: must see only their own membership, not a classmate''s'; end if;
  if (select count(*) from profiles where id = '00000000-0000-4000-a000-000000000003') <> 0 then
    raise exception 'student: must not read a classmate''s profile'; end if;
end $$;

do $$ declare touched integer; begin
  delete from class_members
  where class_id = '00000000-0000-4000-b000-000000000001'
    and student_id = '00000000-0000-4000-a000-000000000003';
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'student: deleted a classmate''s membership'; end if;
end $$;

-- ── teacher removes a member; a student leaves ──────────────────────────────
-- Kept last: both mutate class_members, which earlier counts above depend on.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

do $$ declare touched integer; begin
  delete from class_members
  where class_id = '00000000-0000-4000-b000-000000000001'
    and student_id = '00000000-0000-4000-a000-000000000003';
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'teacher: removing a member should affect exactly one row'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);

do $$ declare touched integer; begin
  delete from class_members
  where class_id = '00000000-0000-4000-b000-000000000001'
    and student_id = '00000000-0000-4000-a000-000000000002';
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'student: leaving their own class should affect exactly one row'; end if;
end $$;

rollback;

select 'classroom RLS checks passed' as result;
