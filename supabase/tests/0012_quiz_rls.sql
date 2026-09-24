-- Hand-run checks for 0012_quizzes.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying
-- 0009-0012. Everything happens inside one transaction that rolls back, so no
-- fixture survives. Any failed check raises and aborts with a message naming
-- it; a clean run ends by printing "quiz RLS checks passed".
--
-- Same shape as 0009_classroom_rls.sql: fixtures as postgres, then each check
-- under `set local role authenticated` with a forged jwt claim, because these
-- functions all read auth.uid().
--
-- Values that one check produces and a later one needs (the share code and id
-- of the quiz create_quiz makes) travel in transaction-local settings named
-- quiztest.*, since each `do` block is its own scope.
--
-- Where a check expects a refusal it also compares the message. A bare
-- `exception when others` would let a typo in this file (or an unrelated
-- failure) pass as "refused"; matching the message means the check fails
-- unless the function refused for the reason it is meant to.

begin;

-- ── fixtures (as postgres, which bypasses RLS) ──────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000000101', 'q-teacher@example.test',  '{"role":"teacher","display_name":"Quinn Teacher"}'),
  ('00000000-0000-4000-a000-000000000102', 'q-student@example.test',  '{"role":"student","display_name":"Sasha Student"}'),
  ('00000000-0000-4000-a000-000000000103', 'q-outsider@example.test', '{"role":"student","display_name":"Otto Outsider"}'),
  ('00000000-0000-4000-a000-000000000104', 'q-general@example.test',  '{"display_name":"Gina General"}');

insert into presentations (id, owner_id, title, theme)
values ('00000000-0000-4000-e000-000000000101', '00000000-0000-4000-a000-000000000101', 'Cells', '{}'),
       ('00000000-0000-4000-e000-000000000104', '00000000-0000-4000-a000-000000000104', 'General deck', '{}');

insert into classes (id, teacher_id, name, join_code)
values ('00000000-0000-4000-b000-000000000101', '00000000-0000-4000-a000-000000000101', 'Quiz Biology', 'QZBIO2');
insert into class_members (class_id, student_id)
values ('00000000-0000-4000-b000-000000000101', '00000000-0000-4000-a000-000000000102');

-- Quizzes with known ids, codes and answers, for the scoring checks. All three
-- are posted to the class. The codes are set here on purpose (they are inserted
-- as postgres); the quiz create_quiz makes below gets a generated one.
insert into quizzes (id, teacher_id, title, deck_title, quiz_type, settings, code) values
  ('00000000-0000-4000-d000-000000000101', '00000000-0000-4000-a000-000000000101', 'Fixture MC',    'Cells', 'multiple_choice', '{}',              'FXMCQ222'),
  ('00000000-0000-4000-d000-000000000102', '00000000-0000-4000-a000-000000000101', 'Fixture blanks', 'Cells', 'fill_blank',      '{"wordBox":true}', 'FXBLNK22'),
  ('00000000-0000-4000-d000-000000000103', '00000000-0000-4000-a000-000000000101', 'Fixture T/F',   'Cells', 'true_false',      '{}',              'FXTRFA22');

insert into quiz_questions (id, quiz_id, order_index, slide_number, prompt, choices, answer) values
  -- multiple choice: stored answers are indices 1 and 2
  ('00000000-0000-4000-f000-000000000101', '00000000-0000-4000-d000-000000000101', 0, 2, 'Which organelle makes ATP?',  '["Nucleus","Mitochondrion","Ribosome"]', '1'),
  ('00000000-0000-4000-f000-000000000102', '00000000-0000-4000-d000-000000000101', 1, 3, 'Which organelle makes protein?', '["Nucleus","Golgi","Ribosome"]',       '2'),
  -- fill in the blank: five identical questions, one per way of answering
  ('00000000-0000-4000-f000-000000000111', '00000000-0000-4000-d000-000000000102', 0, 2, 'The ___ is the powerhouse of the cell.', '[]', '{"text":"Mitochondria","accepted":["mitochondrion"]}'),
  ('00000000-0000-4000-f000-000000000112', '00000000-0000-4000-d000-000000000102', 1, 2, 'The ___ is the powerhouse of the cell.', '[]', '{"text":"Mitochondria","accepted":["mitochondrion"]}'),
  ('00000000-0000-4000-f000-000000000113', '00000000-0000-4000-d000-000000000102', 2, 2, 'The ___ is the powerhouse of the cell.', '[]', '{"text":"Mitochondria","accepted":["mitochondrion"]}'),
  ('00000000-0000-4000-f000-000000000114', '00000000-0000-4000-d000-000000000102', 3, 2, 'The ___ is the powerhouse of the cell.', '[]', '{"text":"Mitochondria","accepted":["mitochondrion"]}'),
  ('00000000-0000-4000-f000-000000000115', '00000000-0000-4000-d000-000000000102', 4, 2, 'The ___ is the powerhouse of the cell.', '[]', '{"text":"Mitochondria","accepted":["mitochondrion"]}'),
  -- true / false: stored answers true, then false
  ('00000000-0000-4000-f000-000000000121', '00000000-0000-4000-d000-000000000103', 0, 4, 'Cells have nuclei.',            '[]', 'true'),
  ('00000000-0000-4000-f000-000000000122', '00000000-0000-4000-d000-000000000103', 1, 4, 'Ribosomes make ATP.',           '[]', 'false');

insert into quiz_classes (quiz_id, class_id) values
  ('00000000-0000-4000-d000-000000000101', '00000000-0000-4000-b000-000000000101'),
  ('00000000-0000-4000-d000-000000000102', '00000000-0000-4000-b000-000000000101'),
  ('00000000-0000-4000-d000-000000000103', '00000000-0000-4000-b000-000000000101');

-- 0009's fixtures insert quizzes with no code; the column default has to fill it.
do $$ begin
  if exists (select 1 from quizzes where code is null) then
    raise exception 'migration: a quiz has no code';
  end if;
  insert into quizzes (id, teacher_id, title, deck_title)
  values ('00000000-0000-4000-d000-000000000199', '00000000-0000-4000-a000-000000000101', 'Codeless insert', 'Cells');
  if (select code from quizzes where id = '00000000-0000-4000-d000-000000000199') !~ '^[A-HJKMNP-Z2-9]{8}$' then
    raise exception 'migration: the code default did not fill an insert that omitted it';
  end if;
  if (select quiz_type from quizzes where id = '00000000-0000-4000-d000-000000000199') <> 'multiple_choice'
     or (select settings from quizzes where id = '00000000-0000-4000-d000-000000000199') <> '{}'::jsonb then
    raise exception 'migration: quiz_type / settings defaults are wrong';
  end if;
  delete from quizzes where id = '00000000-0000-4000-d000-000000000199';
end $$;

set local role authenticated;

-- ── teacher: create_quiz ────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000101","role":"authenticated"}', true);

-- 1. a valid quiz is saved, with a well-formed share code
do $$
declare
  res jsonb;
  qid uuid;
  good jsonb := '{"slide_number":2,"slide_heading":"Organelles","prompt":"Which organelle makes ATP?","choices":["Nucleus","Mitochondrion","Ribosome","Golgi"],"answer":1}';
  good2 jsonb := '{"slide_number":3,"slide_heading":"Protein","prompt":"Which organelle makes protein?","choices":["Nucleus","Golgi","Ribosome"],"answer":2}';
begin
  res := create_quiz('00000000-0000-4000-e000-000000000101', 'Cells quiz', 'Cells', 'multiple_choice',
                     '{"choiceCount":4}', jsonb_build_array(good, good2));
  if res->>'id' is null then raise exception 'teacher: create_quiz returned no id'; end if;
  if res->>'code' is null or res->>'code' !~ '^[A-HJKMNP-Z2-9]{8}$' then
    raise exception 'teacher: create_quiz returned a malformed code: %', res->>'code';
  end if;
  qid := (res->>'id')::uuid;
  perform set_config('quiztest.mc_id', res->>'id', true);
  perform set_config('quiztest.mc_code', res->>'code', true);

  if (select count(*) from quizzes where id = qid) <> 1 then
    raise exception 'teacher: the created quiz is not readable by its teacher';
  end if;
  if (select code from quizzes where id = qid) <> res->>'code' then
    raise exception 'teacher: the stored code differs from the returned one';
  end if;
  if (select quiz_type from quizzes where id = qid) <> 'multiple_choice'
     or (select settings from quizzes where id = qid) <> '{"choiceCount":4}'::jsonb
     or (select deck_title from quizzes where id = qid) <> 'Cells'
     or (select teacher_id from quizzes where id = qid) <> '00000000-0000-4000-a000-000000000101' then
    raise exception 'teacher: the created quiz row is wrong';
  end if;
end $$;

-- the question rows, by the id carried in the setting
do $$ declare qid uuid := current_setting('quiztest.mc_id')::uuid; begin
  if (select count(*) from quiz_questions qq where qq.quiz_id = qid) <> 2 then
    raise exception 'teacher: expected exactly 2 questions for the created quiz';
  end if;
  if (select array_agg(qq.order_index order by qq.order_index) from quiz_questions qq where qq.quiz_id = qid) <> array[0, 1] then
    raise exception 'teacher: question order_index should be 0,1';
  end if;
  if (select qq.answer from quiz_questions qq where qq.quiz_id = qid and qq.order_index = 0) <> '1'::jsonb
     or (select qq.answer from quiz_questions qq where qq.quiz_id = qid and qq.order_index = 1) <> '2'::jsonb then
    raise exception 'teacher: stored answers are wrong';
  end if;
  if (select qq.slide_number from quiz_questions qq where qq.quiz_id = qid and qq.order_index = 1) <> 3
     or (select qq.slide_heading from quiz_questions qq where qq.quiz_id = qid and qq.order_index = 0) <> 'Organelles' then
    raise exception 'teacher: slide number / heading not stored';
  end if;
  if (select jsonb_array_length(qq.choices) from quiz_questions qq where qq.quiz_id = qid and qq.order_index = 0) <> 4 then
    raise exception 'teacher: choices not stored';
  end if;
end $$;

-- 2. every malformed request is refused, for the right reason. A field that is
--    absent (not merely wrong) must be refused too: jsonb_typeof of a missing
--    key is NULL and a plain `<>` would let it through.
do $$
declare
  pres constant uuid := '00000000-0000-4000-e000-000000000101';
  good_mc jsonb := '{"slide_number":2,"slide_heading":"Organelles","prompt":"Which organelle makes ATP?","choices":["Nucleus","Mitochondrion","Ribosome","Golgi"],"answer":1}';
  good_fb jsonb := '{"slide_number":3,"slide_heading":"Energy","prompt":"The ___ makes ATP.","choices":[],"answer":{"text":"mitochondrion","accepted":[]}}';
  good_tf jsonb := '{"slide_number":4,"slide_heading":"Nuclei","prompt":"Cells have nuclei.","choices":[],"answer":true}';
  rec record;
  refused boolean;
  msg text;
begin
  for rec in
    select * from (values
      ('zero questions',                    'multiple_choice', '[]'::jsonb,                                                                'between 1 and 20'),
      ('21 questions',                      'multiple_choice', (select jsonb_agg(good_mc) from generate_series(1, 21)),                    'between 1 and 20'),
      ('null questions',                    'multiple_choice', null::jsonb,                                                                'must be a list'),
      ('questions is an object',            'multiple_choice', '{}'::jsonb,                                                                'must be a list'),
      ('question is not an object',         'multiple_choice', '["text"]'::jsonb,                                                          'must be an object'),
      ('no prompt',                         'multiple_choice', jsonb_build_array(good_mc - 'prompt'::text),                                'needs a prompt'),
      ('missing slide_number',              'multiple_choice', jsonb_build_array(good_mc - 'slide_number'::text),                          'slide number'),
      ('slide_number 0',                    'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{slide_number}', '0')),               'slide number'),
      ('slide_number as a string',          'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{slide_number}', '"2"')),             'slide number'),
      ('MC with 2 choices',                 'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{choices}', '["A","B"]')),            '3 or 4 choices'),
      ('MC with 5 choices',                 'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{choices}', '["A","B","C","D","E"]')), '3 or 4 choices'),
      ('MC with no choices key at all',     'multiple_choice', jsonb_build_array(good_mc - 'choices'::text),                               'needs choices'),
      ('MC choices not an array',           'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{choices}', '"A,B,C"')),              'needs choices'),
      ('MC with a blank choice',            'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{choices}', '["A","","C"]')),         'cannot be blank'),
      ('MC with a non-string choice',       'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{choices}', '["A",2,"C"]')),          'cannot be blank'),
      ('MC answer 4 of 4 choices',          'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{answer}', '4')),                     'index of a choice'),
      ('MC answer -1',                      'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{answer}', '-1')),                    'index of a choice'),
      ('MC answer 1.5',                     'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{answer}', '1.5')),                   'index of a choice'),
      ('MC answer as a string',             'multiple_choice', jsonb_build_array(jsonb_set(good_mc, '{answer}', '"1"')),                   'index of a choice'),
      ('MC with no answer key at all',      'multiple_choice', jsonb_build_array(good_mc - 'answer'::text),                                'index of a choice'),
      ('fill-blank prompt with no blank',   'fill_blank',      jsonb_build_array(jsonb_set(good_fb, '{prompt}', '"No gap in this one."')), 'needs a blank'),
      ('fill-blank answer is a bare string','fill_blank',      jsonb_build_array(jsonb_set(good_fb, '{answer}', '"mitochondrion"')),       'needs an answer'),
      ('fill-blank with no answer key',     'fill_blank',      jsonb_build_array(good_fb - 'answer'::text),                                'needs an answer'),
      ('fill-blank answer text is blank',   'fill_blank',      jsonb_build_array(jsonb_set(good_fb, '{answer}', '{"text":"  "}')),         'needs an answer'),
      ('fill-blank accepted is not a list', 'fill_blank',      jsonb_build_array(jsonb_set(good_fb, '{answer}', '{"text":"x","accepted":"y"}')), 'must be a list'),
      ('true/false answer is "yes"',        'true_false',      jsonb_build_array(jsonb_set(good_tf, '{answer}', '"yes"')),                 'true or false answer'),
      ('true/false with no answer key',     'true_false',      jsonb_build_array(good_tf - 'answer'::text),                                'true or false answer'),
      ('MC-shaped question in a fill quiz', 'fill_blank',      jsonb_build_array(good_mc),                                                 'needs a blank'),
      ('unknown quiz type',                 'essay',           jsonb_build_array(good_mc),                                                 'Unknown quiz type')
    ) as t(descr, qtype, payload, expect)
  loop
    refused := false;
    msg := null;
    begin
      perform create_quiz(pres, 'Bad quiz', 'Cells', rec.qtype, '{}', rec.payload);
    exception when others then
      refused := true;
      msg := sqlerrm;
    end;
    if not refused then
      raise exception 'teacher: create_quiz accepted a bad request (%)', rec.descr;
    end if;
    if position(rec.expect in msg) = 0 then
      raise exception 'teacher: create_quiz refused (%) for the wrong reason: %', rec.descr, msg;
    end if;
  end loop;

  -- a blank title
  refused := false;
  begin
    perform create_quiz(pres, '   ', 'Cells', 'true_false', '{}', jsonb_build_array(good_tf));
  exception when others then
    refused := true;
    msg := sqlerrm;
  end;
  if not refused or msg <> 'A quiz needs a title.' then
    raise exception 'teacher: a blank title was not refused correctly (%)', msg;
  end if;

  -- a valid first question does not rescue an invalid second one, and nothing
  -- of a refused request is left behind
  refused := false;
  begin
    perform create_quiz(pres, 'Bad quiz', 'Cells', 'multiple_choice', '{}',
                        jsonb_build_array(good_mc, good_mc - 'answer'::text));
  exception when others then
    refused := true;
  end;
  if not refused then raise exception 'teacher: a partly valid request was accepted'; end if;
  if (select count(*) from quizzes where title = 'Bad quiz') <> 0 then
    raise exception 'teacher: a refused create_quiz left a quiz row behind';
  end if;
end $$;

-- 3. the teacher posts the quiz to their class
do $$ begin
  insert into quiz_classes (quiz_id, class_id)
  values (current_setting('quiztest.mc_id')::uuid, '00000000-0000-4000-b000-000000000101');
  if (select count(*) from quiz_classes where quiz_id = current_setting('quiztest.mc_id')::uuid) <> 1 then
    raise exception 'teacher: posting the quiz to their class did not stick';
  end if;
end $$;

-- ── general account ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000104","role":"authenticated"}', true);

-- 4. a General account can make a quiz from its own deck, but not from anyone
--    else's, and cannot post one to a class it does not teach
do $$
declare
  res jsonb;
  good_tf jsonb := '{"slide_number":1,"slide_heading":"Intro","prompt":"Cells are alive.","choices":[],"answer":true}';
  refused boolean := false;
  msg text;
begin
  res := create_quiz('00000000-0000-4000-e000-000000000104', 'General quiz', 'General deck', 'true_false',
                     '{"notation":"word"}', jsonb_build_array(good_tf));
  if res->>'code' is null or res->>'code' !~ '^[A-HJKMNP-Z2-9]{8}$' then
    raise exception 'general: create_quiz on their own deck returned a bad code';
  end if;
  perform set_config('quiztest.general_id', res->>'id', true);
  perform set_config('quiztest.general_code', res->>'code', true);

  begin
    perform create_quiz('00000000-0000-4000-e000-000000000101', 'Stolen quiz', 'Cells', 'true_false', '{}', jsonb_build_array(good_tf));
  exception when others then
    refused := true;
    msg := sqlerrm;
  end;
  if not refused then raise exception 'general: made a quiz from another user''s deck'; end if;
  if msg <> 'That deck isn''t available.' then raise exception 'general: wrong refusal for another user''s deck: %', msg; end if;

  refused := false;
  begin
    insert into quiz_classes (quiz_id, class_id)
    values (current_setting('quiztest.general_id')::uuid, '00000000-0000-4000-b000-000000000101');
  exception when insufficient_privilege then
    refused := true;
  end;
  if not refused then raise exception 'general: posted a quiz to a class they do not teach'; end if;

  if (select count(*) from quizzes where id = current_setting('quiztest.mc_id')::uuid) <> 0 then
    raise exception 'general: can read the teacher''s unshared-with-them quiz';
  end if;
end $$;

-- ── student in the class ────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000102","role":"authenticated"}', true);

-- 5. the student can take a quiz and never sees an answer
do $$
declare
  res jsonb;
  mc_code text := current_setting('quiztest.mc_code');
begin
  if (select count(*) from quiz_questions) <> 0 then
    raise exception 'student: must not read quiz questions (answers) directly';
  end if;
  if (select count(*) from quizzes where id = current_setting('quiztest.mc_id')::uuid) <> 1 then
    raise exception 'student: should see the quiz posted to their class';
  end if;

  -- lower case and padded: the code is normalised
  res := get_quiz_for_taking(' ' || lower(mc_code) || ' ');
  if res->>'id' <> current_setting('quiztest.mc_id') then raise exception 'student: get_quiz_for_taking returned the wrong quiz'; end if;
  if res->>'title' <> 'Cells quiz' or res->>'quiz_type' <> 'multiple_choice' then
    raise exception 'student: quiz header is wrong';
  end if;
  if jsonb_array_length(res->'questions') <> 2 then raise exception 'student: expected 2 questions'; end if;
  if jsonb_path_exists(res, '$.questions[*].answer') then
    raise exception 'student: an answer key leaked into the questions';
  end if;
  if res::text like '%"answer"%' then
    raise exception 'student: an answer key leaked somewhere in the payload';
  end if;
  if res->'questions'->0->>'prompt' <> 'Which organelle makes ATP?'
     or jsonb_array_length(res->'questions'->0->'choices') <> 4
     or (res->'questions'->0->>'order_index')::int <> 0
     or (res->'questions'->1->>'order_index')::int <> 1 then
    raise exception 'student: questions are out of order or incomplete';
  end if;
  if jsonb_array_length(res->'classes') <> 1
     or res->'classes'->0->>'id' <> '00000000-0000-4000-b000-000000000101'
     or res->'classes'->0->>'name' <> 'Quiz Biology'
     or (res->'classes'->0->>'attempted')::boolean is distinct from false then
    raise exception 'student: classes should list the one class, not yet attempted';
  end if;
  if jsonb_typeof(res->'word_box') <> 'null' then
    raise exception 'student: a multiple-choice quiz must have no word box';
  end if;
end $$;

-- 7. unknown and unposted codes
do $$
declare
  refused boolean;
  msg text;
begin
  refused := false;
  begin
    perform get_quiz_for_taking('ZZZZZZZZ');
  exception when others then refused := true; msg := sqlerrm;
  end;
  if not refused or msg <> 'No quiz with that code.' then
    raise exception 'student: unknown code not refused correctly (%)', msg;
  end if;

  -- the general user's quiz exists but is posted nowhere
  refused := false;
  begin
    perform get_quiz_for_taking(current_setting('quiztest.general_code'));
  exception when others then refused := true; msg := sqlerrm;
  end;
  if not refused or msg <> 'This quiz isn''t available yet.' then
    raise exception 'student: an unposted quiz not refused correctly (%)', msg;
  end if;
end $$;

-- 8. scoring, multiple choice: stored answers are indices 1 and 2
do $$
declare
  res jsonb;
  refused boolean := false;
  msg text;
begin
  res := submit_quiz_attempt('FXMCQ222', '00000000-0000-4000-b000-000000000101',
    '{"00000000-0000-4000-f000-000000000101":1,"00000000-0000-4000-f000-000000000102":0}');
  if (res->>'correct')::int <> 1 or (res->>'total')::int <> 2 then
    raise exception 'MC scoring: expected 1 of 2, got %', res;
  end if;
  if (res->>'score')::numeric <> 0.5 then raise exception 'MC scoring: score should be 0.5, got %', res->>'score'; end if;
  if res->'results' <> '[true,false]'::jsonb then raise exception 'MC scoring: wrong per-question results %', res->'results'; end if;

  if (select count(*) from quiz_attempts
      where quiz_id = '00000000-0000-4000-d000-000000000101'
        and student_id = '00000000-0000-4000-a000-000000000102') <> 1 then
    raise exception 'MC scoring: exactly one attempt row should exist';
  end if;
  if (select score from quiz_attempts where quiz_id = '00000000-0000-4000-d000-000000000101') <> 0.5 then
    raise exception 'MC scoring: stored score should be 0.5';
  end if;

  -- 9. a second attempt for the same class is refused, and writes nothing
  begin
    perform submit_quiz_attempt('FXMCQ222', '00000000-0000-4000-b000-000000000101',
      '{"00000000-0000-4000-f000-000000000101":1,"00000000-0000-4000-f000-000000000102":2}');
  exception when others then refused := true; msg := sqlerrm;
  end;
  if not refused or msg <> 'You''ve already submitted this quiz for this class.' then
    raise exception 'second attempt not refused correctly (%)', msg;
  end if;
  if (select count(*) from quiz_attempts where quiz_id = '00000000-0000-4000-d000-000000000101') <> 1 then
    raise exception 'second attempt: a refused attempt must not add a row';
  end if;

  -- and the taking screen now reports it
  res := get_quiz_for_taking('FXMCQ222');
  if (res->'classes'->0->>'attempted')::boolean is distinct from true then
    raise exception 'student: attempted should now be true';
  end if;
end $$;

-- 10. scoring, fill in the blank. Answer is "Mitochondria", also accepting
--     "mitochondrion". One quiz with five identical questions stands in for five
--     students: the one-attempt rule would otherwise need a fresh student each.
do $$
declare
  res jsonb;
begin
  -- the word box is on for this quiz: it lists the answers
  res := get_quiz_for_taking('FXBLNK22');
  if jsonb_typeof(res->'word_box') <> 'array' or not (res->'word_box' @> '["Mitochondria"]'::jsonb) then
    raise exception 'blank quiz: word_box should list "Mitochondria", got %', res->'word_box';
  end if;
  if jsonb_path_exists(res, '$.questions[*].answer') or res::text like '%"accepted"%' then
    raise exception 'blank quiz: an answer leaked into the payload';
  end if;

  res := submit_quiz_attempt('FXBLNK22', '00000000-0000-4000-b000-000000000101',
    '{"00000000-0000-4000-f000-000000000111":"  the MITOCHONDRIA. ",
      "00000000-0000-4000-f000-000000000112":"mitochondria!",
      "00000000-0000-4000-f000-000000000113":"Mitochondrion",
      "00000000-0000-4000-f000-000000000114":""}');
  -- 111: extra word -> wrong; 112: case + punctuation -> right; 113: accepted
  -- alternative -> right; 114: empty -> wrong; 115: not answered at all -> wrong
  if res->'results' <> '[false,true,true,false,false]'::jsonb then
    raise exception 'blank scoring: wrong per-question results %', res->'results';
  end if;
  if (res->>'correct')::int <> 2 or (res->>'total')::int <> 5 or (res->>'score')::numeric <> 0.4 then
    raise exception 'blank scoring: expected 2 of 5 (0.4), got %', res;
  end if;
end $$;

-- 11. scoring, true/false: stored answers true, then false
do $$
declare
  res jsonb;
  refused boolean := false;
  msg text;
begin
  -- an answers payload that is not an object is refused before anything is written
  begin
    perform submit_quiz_attempt('FXTRFA22', '00000000-0000-4000-b000-000000000101', '[]');
  exception when others then refused := true; msg := sqlerrm;
  end;
  if not refused or msg <> 'Answer every question before submitting.' then
    raise exception 'true/false: a non-object answers payload not refused correctly (%)', msg;
  end if;
  if (select count(*) from quiz_attempts where quiz_id = '00000000-0000-4000-d000-000000000103') <> 0 then
    raise exception 'true/false: a refused submission wrote an attempt';
  end if;

  -- the string "true" is the wrong JSON type for a true stored answer -> wrong;
  -- a boolean false matching a false stored answer -> right
  res := submit_quiz_attempt('FXTRFA22', '00000000-0000-4000-b000-000000000101',
    '{"00000000-0000-4000-f000-000000000121":"true","00000000-0000-4000-f000-000000000122":false}');
  if res->'results' <> '[false,true]'::jsonb then
    raise exception 'true/false scoring: wrong per-question results %', res->'results';
  end if;
  if (res->>'correct')::int <> 1 or (res->>'total')::int <> 2 or (res->>'score')::numeric <> 0.5 then
    raise exception 'true/false scoring: expected 1 of 2, got %', res;
  end if;
end $$;

-- ── student outside the class ───────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000103","role":"authenticated"}', true);

-- 6. an outsider cannot take a quiz posted to a class they have not joined
do $$
declare
  refused boolean := false;
  msg text;
begin
  begin
    perform get_quiz_for_taking(current_setting('quiztest.mc_code'));
  exception when others then refused := true; msg := sqlerrm;
  end;
  if not refused then raise exception 'outsider: took a quiz posted to a class they have not joined'; end if;
  if position('haven''t joined' in msg) = 0 then
    raise exception 'outsider: wrong refusal from get_quiz_for_taking: %', msg;
  end if;

  refused := false;
  begin
    perform submit_quiz_attempt(current_setting('quiztest.mc_code'), '00000000-0000-4000-b000-000000000101', '{}');
  exception when others then refused := true; msg := sqlerrm;
  end;
  if not refused or msg <> 'You''re not in that class.' then
    raise exception 'outsider: submit_quiz_attempt not refused correctly (%)', msg;
  end if;

  -- the fixtures the student did score must not have been reachable either
  refused := false;
  begin
    perform submit_quiz_attempt('FXMCQ222', '00000000-0000-4000-b000-000000000101',
      '{"00000000-0000-4000-f000-000000000101":1,"00000000-0000-4000-f000-000000000102":2}');
  exception when others then refused := true; msg := sqlerrm;
  end;
  if not refused or msg <> 'You''re not in that class.' then
    raise exception 'outsider: submitted to a class they are not in (%)', msg;
  end if;

  if (select count(*) from quiz_attempts) <> 0 then raise exception 'outsider: should see no attempts'; end if;
  if (select count(*) from quiz_questions) <> 0 then raise exception 'outsider: should see no questions'; end if;
end $$;

-- ── teacher sees the results ────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000101","role":"authenticated"}', true);

-- 12. three attempts were written above (multiple choice, blanks, true/false)
do $$ begin
  if (select count(*) from quiz_attempts) <> 3 then
    raise exception 'teacher: expected the 3 attempts written above, saw %', (select count(*) from quiz_attempts);
  end if;
  if (select score from quiz_attempts where quiz_id = '00000000-0000-4000-d000-000000000102') <> 0.4 then
    raise exception 'teacher: the blanks attempt should read 0.4';
  end if;
  -- the teacher still reads their own questions and answers
  if (select count(*) from quiz_questions where quiz_id = '00000000-0000-4000-d000-000000000101') <> 2 then
    raise exception 'teacher: should read the questions of their own quiz';
  end if;
end $$;

-- ── not signed in ───────────────────────────────────────────────────────────
-- A session with no subject: auth.uid() is null, so every entry point refuses.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

do $$
declare
  refused boolean;
  msg text;
begin
  refused := false;
  begin
    perform get_quiz_for_taking('FXMCQ222');
  exception when others then refused := true; msg := sqlerrm;
  end;
  if not refused or msg <> 'Log in to take a quiz.' then raise exception 'no session: get_quiz_for_taking (%)', msg; end if;

  refused := false;
  begin
    perform submit_quiz_attempt('FXMCQ222', '00000000-0000-4000-b000-000000000101', '{}');
  exception when others then refused := true; msg := sqlerrm;
  end;
  if not refused or msg <> 'Log in to take a quiz.' then raise exception 'no session: submit_quiz_attempt (%)', msg; end if;

  refused := false;
  begin
    perform create_quiz('00000000-0000-4000-e000-000000000101', 'x', 'x', 'true_false', '{}',
                        '[{"slide_number":1,"prompt":"p","choices":[],"answer":true}]');
  exception when others then refused := true; msg := sqlerrm;
  end;
  if not refused or msg <> 'Log in to create a quiz.' then raise exception 'no session: create_quiz (%)', msg; end if;
end $$;

-- The anon role has no execute grant on any of them.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  refused boolean;
begin
  refused := false;
  begin
    perform get_quiz_for_taking('FXMCQ222');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'anon: was allowed to call get_quiz_for_taking'; end if;

  refused := false;
  begin
    perform submit_quiz_attempt('FXMCQ222', '00000000-0000-4000-b000-000000000101', '{}');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'anon: was allowed to call submit_quiz_attempt'; end if;

  refused := false;
  begin
    perform create_quiz('00000000-0000-4000-e000-000000000101', 'x', 'x', 'true_false', '{}', '[]');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'anon: was allowed to call create_quiz'; end if;
end $$;

rollback;

select 'quiz RLS checks passed' as result;
