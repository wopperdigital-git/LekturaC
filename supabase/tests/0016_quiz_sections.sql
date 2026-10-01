-- Hand-run checks for 0016_quiz_sections.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying
-- 0009-0016. One transaction that rolls back; any failed check raises with a
-- message naming it; a clean run ends by printing "quiz sections checks passed".
-- Refusals are matched by message so a typo here can't pass as "refused".

begin;

-- ── fixtures (as postgres) ──────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000000601', 's-teacher@example.test', '{"role":"teacher","display_name":"Tess Teacher"}'),
  ('00000000-0000-4000-a000-000000000602', 's-student@example.test', '{"role":"student","display_name":"Stu Student"}');

insert into presentations (id, owner_id, title, theme)
values ('00000000-0000-4000-e000-000000000601', '00000000-0000-4000-a000-000000000601', 'Cells', '{}');

insert into classes (id, teacher_id, name, join_code)
values ('00000000-0000-4000-b000-000000000601', '00000000-0000-4000-a000-000000000601', 'Sections Bio', 'SCBIO2');
insert into class_members (class_id, student_id)
values ('00000000-0000-4000-b000-000000000601', '00000000-0000-4000-a000-000000000602');

-- A legacy-shaped quiz: inserted without question_type, as 0012 code did.
insert into quizzes (id, teacher_id, title, deck_title, quiz_type, settings, code) values
  ('00000000-0000-4000-d000-000000000601', '00000000-0000-4000-a000-000000000601', 'Legacy blanks', 'Cells', 'fill_blank', '{"wordBox":true}', 'LGCYBK22');
insert into quiz_questions (id, quiz_id, order_index, slide_number, prompt, choices, answer) values
  ('00000000-0000-4000-f000-000000000601', '00000000-0000-4000-d000-000000000601', 0, 2, 'The ___ makes ATP.', '[]', '{"text":"Mitochondria","accepted":[]}');
insert into quiz_classes (quiz_id, class_id)
values ('00000000-0000-4000-d000-000000000601', '00000000-0000-4000-b000-000000000601');

-- 1. legacy rows: the trigger filled question_type and section_index defaulted
do $$ begin
  if (select question_type from quiz_questions where id = '00000000-0000-4000-f000-000000000601') <> 'fill_blank'
     or (select section_index from quiz_questions where id = '00000000-0000-4000-f000-000000000601') <> 0 then
    raise exception 'legacy: question_type / section_index not filled';
  end if;
  if exists (select 1 from quiz_questions where question_type is null) then
    raise exception 'migration: a question has no type after backfill';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000601","role":"authenticated"}', true);

-- 2. a mixed quiz saves with its tests, types and order
do $$
declare
  res jsonb;
  qid uuid;
  mc jsonb := '{"slide_number":2,"slide_heading":"Organelles","prompt":"Which organelle makes ATP?","choices":["Nucleus","Mitochondrion","Ribosome"],"answer":1}';
  tf jsonb := '{"slide_number":3,"slide_heading":"Nuclei","prompt":"Cells have nuclei.","answer":true}';
  fb jsonb := '{"slide_number":4,"slide_heading":"Energy","prompt":"The _____ makes ATP.","answer":{"text":"mitochondria","accepted":[]}}';
begin
  res := create_quiz('00000000-0000-4000-e000-000000000601', 'Cells quiz', 'Cells', jsonb_build_array(
    jsonb_build_object('title', ' Part A ', 'instructions', 'Pick one.', 'type', 'multiple_choice',
                       'settings', '{"choiceCount":3,"title":"hijack"}'::jsonb, 'questions', jsonb_build_array(mc)),
    jsonb_build_object('title', 'Part B', 'instructions', '', 'type', 'true_false',
                       'settings', '{"notation":"letter"}'::jsonb, 'questions', jsonb_build_array(tf, tf)),
    jsonb_build_object('title', 'Part C', 'instructions', 'Use the box.', 'type', 'fill_blank',
                       'settings', '{"wordBox":true}'::jsonb, 'questions', jsonb_build_array(fb))
  ));
  qid := (res->>'id')::uuid;
  perform set_config('sectest.id', res->>'id', true);
  perform set_config('sectest.code', res->>'code', true);

  if (select quiz_type from quizzes where id = qid) <> 'mixed' then
    raise exception 'create: quiz_type should be mixed';
  end if;
  if (select settings->'sections'->0->>'title' from quizzes where id = qid) <> 'Part A'
     or (select settings->'sections'->0->>'type' from quizzes where id = qid) <> 'multiple_choice'
     or (select settings->'sections'->0->'choiceCount' from quizzes where id = qid) <> '3'::jsonb
     or (select settings->'sections'->2->'wordBox' from quizzes where id = qid) <> 'true'::jsonb then
    raise exception 'create: stored sections are wrong: %', (select settings from quizzes where id = qid);
  end if;
  if (select array_agg(section_index || ':' || question_type || ':' || order_index order by order_index)
        from quiz_questions where quiz_id = qid)
     <> array['0:multiple_choice:0', '1:true_false:1', '1:true_false:2', '2:fill_blank:3'] then
    raise exception 'create: question rows are wrong';
  end if;
  if (select choices from quiz_questions where quiz_id = qid and question_type = 'true_false' limit 1) <> '[]'::jsonb then
    raise exception 'create: non-MC questions must store no choices';
  end if;

  -- a single-type quiz keeps that type as its summary
  res := create_quiz('00000000-0000-4000-e000-000000000601', 'TF only', 'Cells', jsonb_build_array(
    jsonb_build_object('title', 'Test 1', 'instructions', '', 'type', 'true_false', 'settings', '{}'::jsonb, 'questions', jsonb_build_array(tf)),
    jsonb_build_object('title', 'Test 2', 'instructions', '', 'type', 'true_false', 'settings', '{}'::jsonb, 'questions', jsonb_build_array(tf))
  ));
  if (select quiz_type from quizzes where id = (res->>'id')::uuid) <> 'true_false' then
    raise exception 'create: a single-type quiz should keep its type';
  end if;
end $$;

-- 3. refusals
do $$
declare
  tf jsonb := '{"slide_number":3,"prompt":"Cells have nuclei.","answer":true}';
  one jsonb;
  msg text;
  twentyone jsonb;
begin
  one := jsonb_build_object('title', 'T', 'instructions', '', 'type', 'true_false', 'settings', '{}'::jsonb, 'questions', jsonb_build_array(tf));

  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', jsonb_build_array(one, one, one, one));
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'A quiz has between 1 and 3 tests.' then raise exception 'refuse 4 tests: %', msg; end if;

  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', '[]');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'A quiz has between 1 and 3 tests.' then raise exception 'refuse 0 tests: %', msg; end if;

  select jsonb_agg(tf) into twentyone from generate_series(1, 21);
  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', jsonb_build_array(
    jsonb_set(one, '{questions}', twentyone)));
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Each test has between 1 and 20 questions.' then raise exception 'refuse 21 questions: %', msg; end if;

  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', jsonb_build_array(
    jsonb_set(one, '{type}', '"multiple_choice"')));
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'A multiple-choice question needs choices.' then raise exception 'refuse wrong shape: %', msg; end if;

  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', jsonb_build_array(
    jsonb_set(one, '{title}', '"   "')));
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Every test needs a title.' then raise exception 'refuse blank title: %', msg; end if;

  msg := null;
  begin perform create_quiz('00000000-0000-4000-e000-000000000601', 'X', 'Cells', jsonb_build_array(
    jsonb_set(one, '{type}', '"mixed"')));
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Unknown quiz type.' then raise exception 'refuse mixed section type: %', msg; end if;
end $$;

-- post the mixed quiz (teacher owns it)
insert into quiz_classes (quiz_id, class_id)
values (current_setting('sectest.id')::uuid, '00000000-0000-4000-b000-000000000601');

-- ── student ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000602","role":"authenticated"}', true);

-- 4. taking: no answers, per-question section and type, a word box only for Part C
do $$
declare
  res jsonb;
begin
  if exists (select 1 from quiz_questions) then
    raise exception 'student: must not read quiz questions directly';
  end if;
  res := get_quiz_for_taking(current_setting('sectest.code'));
  if res::text ~ '"answer"' then raise exception 'student: an answer leaked: %', res; end if;
  if res ? 'word_box' then raise exception 'student: old word_box key still returned'; end if;
  if (select array_agg((q->>'section_index') || ':' || (q->>'question_type'))
        from jsonb_array_elements(res->'questions') q)
     <> array['0:multiple_choice', '1:true_false', '1:true_false', '2:fill_blank'] then
    raise exception 'student: question sections/types wrong: %', res->'questions';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(res->'word_boxes') k) <> array['2']
     or res->'word_boxes'->'2' <> '["mitochondria"]'::jsonb then
    raise exception 'student: word boxes wrong: %', res->'word_boxes';
  end if;

  -- legacy quiz: its box comes back under "0"
  res := get_quiz_for_taking('LGCYBK22');
  if res->'word_boxes'->'0' <> '["Mitochondria"]'::jsonb then
    raise exception 'student: legacy word box wrong: %', res->'word_boxes';
  end if;
end $$;

-- 5. scoring is per question type: MC right, TF right + wrong, blank right → 3 of 4
do $$
declare
  res jsonb;
  ids uuid[];
begin
  -- the student can't read question ids directly; take them from the taking payload
  select array_agg((q->>'id')::uuid order by (q->>'order_index')::int) into ids
    from jsonb_array_elements(get_quiz_for_taking(current_setting('sectest.code'))->'questions') q;
  res := submit_quiz_attempt(current_setting('sectest.code'), '00000000-0000-4000-b000-000000000601',
    jsonb_build_object(ids[1]::text, 1, ids[2]::text, true, ids[3]::text, false, ids[4]::text, ' Mitochondria. '));
  if (res->>'correct')::int <> 3 or (res->>'total')::int <> 4 then
    raise exception 'scoring: expected 3 of 4, got %', res;
  end if;
  if res->'results' <> '[true,true,false,true]'::jsonb then
    raise exception 'scoring: wrong per-question results %', res->'results';
  end if;
end $$;

rollback;

select 'quiz sections checks passed' as result;
