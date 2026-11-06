-- Hand-run checks for 0018_lessons.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying
-- 0009-0018. One transaction that rolls back; any failed check raises with a
-- message naming it; a clean run ends by printing "lessons checks passed".
-- Refusals are matched by message so a typo here can't pass as "refused".
--
-- Never run yet: written without a database to hand (see the task report).
--
-- Fixture: the deck, slides and questions of LESSON_FIXTURE in
-- src/lesson/fixtures.ts (the source of the numbers below), made real:
--   slides  c1..c4, durations 5/4/6/3, starts 0/5/9/15, the video ends at 18
--   q1 (order 0) on c3, q2 (1) on c1, q3 (2) on no card, q4 (3) on c3,
--   q5 (4) on a card that exists but is not in the video (the fixture's
--   'gone'; card_id is a real foreign key, so it is a real card c5), q6 (5) on c4
-- so the expected stops are q2,q1,q4,q6,q3,q5 at 5,15,15,18,18,18.
--
-- Timing: the credit checks run in a few milliseconds and assume no more than
-- a second passes between two statements of one run (lesson_watch spends whole
-- seconds). The pacing rule being checked is in lesson_watch's comment.
--
-- Ids: teacher ...a000-1801, student S ...1802, outsider O ...1803,
-- second student S2 ...1804; deck P e000-1801 (its quiz Q d000-1801, code
-- QZPKM234), deck P2 e000-1802 (quiz Q2, code QZPKM235); class K b000-1801;
-- cards c000-18c1..18c5; questions f000-1801..1806 (Q), f000-1807 (Q2).
-- Deck P3 e000-1803 (one 300 s slide) with quiz Q3 d000-1803, code QZPKM236, question
-- f000-1808: the unused-watch-time check (12b).

begin;

-- ── fixtures (as postgres) ──────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000001801', 'l-teacher@example.test', '{"role":"teacher","display_name":"Tess Teacher"}'),
  ('00000000-0000-4000-a000-000000001802', 'l-student@example.test', '{"role":"student","display_name":"Stu Student"}'),
  ('00000000-0000-4000-a000-000000001803', 'l-outsider@example.test', '{"role":"student","display_name":"Olly Outsider"}'),
  ('00000000-0000-4000-a000-000000001804', 'l-second@example.test', '{"role":"student","display_name":"Sam Second"}');

insert into presentations (id, owner_id, title, theme, video) values
  ('00000000-0000-4000-e000-000000001801', '00000000-0000-4000-a000-000000001801', 'Cells', '{}',
   '{"path":"00000000-0000-4000-a000-000000001801/00000000-0000-4000-e000-000000001801.mp4","contentType":"video/mp4","durationSeconds":18,"generatedAt":"2026-11-06T10:00:00.000Z","slides":[
      {"cardId":"00000000-0000-4000-c000-0000000018c1","startSeconds":0,"durationSeconds":5},
      {"cardId":"00000000-0000-4000-c000-0000000018c2","startSeconds":5,"durationSeconds":4},
      {"cardId":"00000000-0000-4000-c000-0000000018c3","startSeconds":9,"durationSeconds":6},
      {"cardId":"00000000-0000-4000-c000-0000000018c4","startSeconds":15,"durationSeconds":3}]}'),
  ('00000000-0000-4000-e000-000000001802', '00000000-0000-4000-a000-000000001801', 'Genes', '{}',
   '{"path":"00000000-0000-4000-a000-000000001801/00000000-0000-4000-e000-000000001802.mp4","contentType":"video/mp4","durationSeconds":4,"generatedAt":"2026-11-06T10:00:00.000Z","slides":[
      {"cardId":"00000000-0000-4000-c000-0000000018c5","startSeconds":0,"durationSeconds":4}]}');

-- c1..c4 are the video's slides; c5 is a card the video does not have.
insert into cards (id, presentation_id, order_index, blocks) values
  ('00000000-0000-4000-c000-0000000018c1', '00000000-0000-4000-e000-000000001801', 0, '[]'),
  ('00000000-0000-4000-c000-0000000018c2', '00000000-0000-4000-e000-000000001801', 1, '[]'),
  ('00000000-0000-4000-c000-0000000018c3', '00000000-0000-4000-e000-000000001801', 2, '[]'),
  ('00000000-0000-4000-c000-0000000018c4', '00000000-0000-4000-e000-000000001801', 3, '[]'),
  ('00000000-0000-4000-c000-0000000018c5', '00000000-0000-4000-e000-000000001801', 4, '[]');

-- Keep the good video to put back after the checks that change it.
select set_config('lt.video',
  (select video::text from presentations where id = '00000000-0000-4000-e000-000000001801'), true);

-- A deck whose only slide is 300 seconds long, for the unused-time check (12b).
insert into presentations (id, owner_id, title, theme, video)
values ('00000000-0000-4000-e000-000000001803', '00000000-0000-4000-a000-000000001801', 'Long', '{}',
  '{"path":"00000000-0000-4000-a000-000000001801/00000000-0000-4000-e000-000000001803.mp4","contentType":"video/mp4","durationSeconds":300,"generatedAt":"2026-11-06T10:00:00.000Z","slides":[
     {"cardId":"00000000-0000-4000-c000-0000000018c1","startSeconds":0,"durationSeconds":300}]}');

insert into classes (id, teacher_id, name, join_code)
values ('00000000-0000-4000-b000-000000001801', '00000000-0000-4000-a000-000000001801', 'Lesson Bio', 'LSNBI2');
insert into class_members (class_id, student_id) values
  ('00000000-0000-4000-b000-000000001801', '00000000-0000-4000-a000-000000001802'),
  ('00000000-0000-4000-b000-000000001801', '00000000-0000-4000-a000-000000001804');

insert into quizzes (id, teacher_id, presentation_id, title, deck_title, quiz_type, settings, code) values
  ('00000000-0000-4000-d000-000000001801', '00000000-0000-4000-a000-000000001801', '00000000-0000-4000-e000-000000001801',
   'Cells lesson', 'Cells', 'true_false', '{"sections":[{"title":"Test 1","instructions":"","type":"true_false"}]}', 'QZPKM234'),
  ('00000000-0000-4000-d000-000000001802', '00000000-0000-4000-a000-000000001801', '00000000-0000-4000-e000-000000001802',
   'Genes quiz', 'Genes', 'true_false', '{"sections":[{"title":"Test 1","instructions":"","type":"true_false"}]}', 'QZPKM235');

insert into quizzes (id, teacher_id, presentation_id, title, deck_title, quiz_type, settings, code)
values ('00000000-0000-4000-d000-000000001803', '00000000-0000-4000-a000-000000001801', '00000000-0000-4000-e000-000000001803',
        'Long lesson', 'Long', 'true_false', '{"sections":[{"title":"Test 1","instructions":"","type":"true_false"}]}', 'QZPKM236');

-- Every answer is true. (id, order_index, card)
insert into quiz_questions (id, quiz_id, order_index, section_index, question_type, card_id, slide_number, prompt, answer) values
  ('00000000-0000-4000-f000-000000001801', '00000000-0000-4000-d000-000000001801', 0, 0, 'true_false', '00000000-0000-4000-c000-0000000018c3', 3, 'q1', 'true'),
  ('00000000-0000-4000-f000-000000001802', '00000000-0000-4000-d000-000000001801', 1, 0, 'true_false', '00000000-0000-4000-c000-0000000018c1', 1, 'q2', 'true'),
  ('00000000-0000-4000-f000-000000001803', '00000000-0000-4000-d000-000000001801', 2, 0, 'true_false', null,                                   1, 'q3', 'true'),
  ('00000000-0000-4000-f000-000000001804', '00000000-0000-4000-d000-000000001801', 3, 0, 'true_false', '00000000-0000-4000-c000-0000000018c3', 3, 'q4', 'true'),
  ('00000000-0000-4000-f000-000000001805', '00000000-0000-4000-d000-000000001801', 4, 0, 'true_false', '00000000-0000-4000-c000-0000000018c5', 5, 'q5', 'true'),
  ('00000000-0000-4000-f000-000000001806', '00000000-0000-4000-d000-000000001801', 5, 0, 'true_false', '00000000-0000-4000-c000-0000000018c4', 4, 'q6', 'true'),
  ('00000000-0000-4000-f000-000000001807', '00000000-0000-4000-d000-000000001802', 0, 0, 'true_false', null,                                   1, 'q7', 'true');

insert into quiz_questions (id, quiz_id, order_index, section_index, question_type, card_id, slide_number, prompt, answer)
values ('00000000-0000-4000-f000-000000001808', '00000000-0000-4000-d000-000000001803', 0, 0, 'true_false', null, 1, 'q8', 'true');
insert into quiz_classes (quiz_id, class_id, mode)
values ('00000000-0000-4000-d000-000000001803', '00000000-0000-4000-b000-000000001801', 'lesson');

-- ── 1. the moved scoring block still scores each type the same way ──────────
do $$ begin
  if not (quiz_answer_correct('multiple_choice', '1', '1') and not quiz_answer_correct('multiple_choice', '1', '"1"')
          and not quiz_answer_correct('multiple_choice', '1', '2')) then
    raise exception 'scoring: multiple choice';
  end if;
  if not (quiz_answer_correct('true_false', 'true', 'true') and not quiz_answer_correct('true_false', 'true', '"true"')
          and not quiz_answer_correct('true_false', 'true', 'false')) then
    raise exception 'scoring: true/false';
  end if;
  if not (quiz_answer_correct('fill_blank', '{"text":"Mitochondria","accepted":["power plant"]}', '" Mitochondria. "')
          and quiz_answer_correct('fill_blank', '{"text":"Mitochondria","accepted":["power plant"]}', '"power plant!"')
          and not quiz_answer_correct('fill_blank', '{"text":"Mitochondria","accepted":[]}', '""')
          and not quiz_answer_correct('fill_blank', '{"text":"Mitochondria","accepted":[]}', '"nucleus"')) then
    raise exception 'scoring: fill in the blank';
  end if;
  if quiz_answer_correct('true_false', 'true', null) or quiz_answer_correct('true_false', 'true', 'null') then
    raise exception 'scoring: a missing or null answer must be wrong';
  end if;
end $$;

-- ── 2. lesson_stops mirrors placeCheckpoints ────────────────────────────────
do $$
declare
  ids uuid[];
  secs numeric[];
  q1 constant uuid := '00000000-0000-4000-f000-000000001801';
  q2 constant uuid := '00000000-0000-4000-f000-000000001802';
  q3 constant uuid := '00000000-0000-4000-f000-000000001803';
  q4 constant uuid := '00000000-0000-4000-f000-000000001804';
  q5 constant uuid := '00000000-0000-4000-f000-000000001805';
  q6 constant uuid := '00000000-0000-4000-f000-000000001806';
  quiz constant uuid := '00000000-0000-4000-d000-000000001801';
  deck constant uuid := '00000000-0000-4000-e000-000000001801';
  c1 constant text := '00000000-0000-4000-c000-0000000018c1';
begin
  -- the fixture: placed by (slide, order), then the unplaced at the end by order
  select array_agg(question_id order by ord), array_agg(stop_seconds order by ord) into ids, secs
    from lesson_stops(quiz);
  if ids is distinct from array[q2, q1, q4, q6, q3, q5]
     or secs is distinct from array[5, 15, 15, 18, 18, 18]::numeric[] then
    raise exception 'stops: fixture order/times wrong: % at %', ids, secs;
  end if;
  if (select array_agg(ord order by ord) from lesson_stops(quiz)) is distinct from array[1, 2, 3, 4, 5, 6] then
    raise exception 'stops: ord should be 1..6';
  end if;

  -- no slides at all (no video, an empty list, not a list): every stop is 0, in order_index order
  update presentations set video = null where id = deck;
  select array_agg(question_id order by ord), array_agg(stop_seconds order by ord) into ids, secs from lesson_stops(quiz);
  if ids is distinct from array[q1, q2, q3, q4, q5, q6] or secs is distinct from array[0, 0, 0, 0, 0, 0]::numeric[] then
    raise exception 'stops: no video: % at %', ids, secs;
  end if;
  update presentations set video = '{"slides":[]}' where id = deck;
  select array_agg(question_id order by ord), array_agg(stop_seconds order by ord) into ids, secs from lesson_stops(quiz);
  if ids is distinct from array[q1, q2, q3, q4, q5, q6] or secs is distinct from array[0, 0, 0, 0, 0, 0]::numeric[] then
    raise exception 'stops: empty slides: % at %', ids, secs;
  end if;
  update presentations set video = '{"slides":"nope"}' where id = deck;
  select array_agg(question_id order by ord), array_agg(stop_seconds order by ord) into ids, secs from lesson_stops(quiz);
  if ids is distinct from array[q1, q2, q3, q4, q5, q6] or secs is distinct from array[0, 0, 0, 0, 0, 0]::numeric[] then
    raise exception 'stops: slides not a list: % at %', ids, secs;
  end if;

  -- a card named by two slides: the first one wins; the end is the LAST slide's end
  update presentations set video = jsonb_build_object('slides', jsonb_build_array(
    jsonb_build_object('cardId', c1, 'startSeconds', 0, 'durationSeconds', 5),
    jsonb_build_object('cardId', c1, 'startSeconds', 5, 'durationSeconds', 4))) where id = deck;
  select array_agg(question_id order by ord), array_agg(stop_seconds order by ord) into ids, secs from lesson_stops(quiz);
  if ids is distinct from array[q2, q1, q3, q4, q5, q6] or secs is distinct from array[5, 9, 9, 9, 9, 9]::numeric[] then
    raise exception 'stops: duplicate card: % at %', ids, secs;
  end if;

  update presentations set video = current_setting('lt.video')::jsonb where id = deck;
end $$;

-- ── 3. posting rules (the trigger) ──────────────────────────────────────────
do $$
declare
  msg text;
  deck constant uuid := '00000000-0000-4000-e000-000000001801';
  quiz constant uuid := '00000000-0000-4000-d000-000000001801';
  k constant uuid := '00000000-0000-4000-b000-000000001801';
begin
  -- no video, an empty slides list, a slides value that is not a list: no lesson
  update presentations set video = null where id = deck;
  msg := null;
  begin insert into quiz_classes (quiz_id, class_id, mode) values (quiz, k, 'lesson');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Make the narrated video first.' then raise exception 'posting: no video: %', msg; end if;

  update presentations set video = '{"generatedAt":"x","slides":[]}' where id = deck;
  msg := null;
  begin insert into quiz_classes (quiz_id, class_id, mode) values (quiz, k, 'lesson');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Make the narrated video first.' then raise exception 'posting: empty slides: %', msg; end if;

  update presentations set video = '{"generatedAt":"x","slides":{}}' where id = deck;
  msg := null;
  begin insert into quiz_classes (quiz_id, class_id, mode) values (quiz, k, 'lesson');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Make the narrated video first.' then raise exception 'posting: slides not a list: %', msg; end if;

  -- a mode other than quiz/lesson is refused by the column check
  msg := null;
  begin insert into quiz_classes (quiz_id, class_id, mode) values (quiz, k, 'nonsense');
  exception when check_violation then msg := 'check'; end;
  if msg is distinct from 'check' then raise exception 'posting: an unknown mode was accepted'; end if;

  update presentations set video = current_setting('lt.video')::jsonb where id = deck;
end $$;

-- the teacher posts the lesson (under RLS), and the other quiz as a plain quiz
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001801","role":"authenticated"}', true);

insert into quiz_classes (quiz_id, class_id, mode)
values ('00000000-0000-4000-d000-000000001801', '00000000-0000-4000-b000-000000001801', 'lesson');
insert into quiz_classes (quiz_id, class_id)
values ('00000000-0000-4000-d000-000000001802', '00000000-0000-4000-b000-000000001801');

do $$ begin
  if (select mode from quiz_classes where quiz_id = '00000000-0000-4000-d000-000000001801') <> 'lesson'
     or (select mode from quiz_classes where quiz_id = '00000000-0000-4000-d000-000000001802') <> 'quiz' then
    raise exception 'posting: modes not stored (the default must be quiz)';
  end if;
end $$;

-- ── 4. the outsider and the signed-out caller ───────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001803","role":"authenticated"}', true);

do $$
declare
  msg text;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
  q2 constant uuid := '00000000-0000-4000-f000-000000001802';
begin
  msg := null;
  begin perform get_lesson_for_taking('QZPKM234', k);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'You''re not in that class.' then raise exception 'outsider: open: %', msg; end if;

  msg := null;
  begin perform lesson_watch('QZPKM234', k, 5);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'You''re not in that class.' then raise exception 'outsider: watch: %', msg; end if;

  msg := null;
  begin perform answer_lesson_checkpoint('QZPKM234', k, q2, 'true');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'You''re not in that class.' then raise exception 'outsider: answer: %', msg; end if;

  msg := null;
  begin perform get_lesson_for_taking('NOSUCHQZ', k);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'No quiz with that code.' then raise exception 'outsider: no quiz: %', msg; end if;
end $$;

select set_config('request.jwt.claims', '{}', true);
do $$
declare msg text;
begin
  msg := null;
  begin perform get_lesson_for_taking('QZPKM234', '00000000-0000-4000-b000-000000001801');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Log in to take a lesson.' then raise exception 'signed out: %', msg; end if;
end $$;

-- ── 5. student S starts the lesson ──────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001802","role":"authenticated"}', true);

do $$
declare
  res jsonb;
  msg text;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
  q1 constant uuid := '00000000-0000-4000-f000-000000001801';
  q2 constant uuid := '00000000-0000-4000-f000-000000001802';
begin
  -- no direct table access
  if exists (select 1 from quiz_questions) then
    raise exception 'student: must not read quiz questions directly';
  end if;

  -- no direct writes, and the internals are not callable
  begin
    insert into lesson_answers (quiz_id, class_id, student_id, question_id, correct)
    values ('00000000-0000-4000-d000-000000001801', k, '00000000-0000-4000-a000-000000001802', q1, true);
    raise exception 'student: wrote a lesson answer directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into lesson_progress (quiz_id, class_id, student_id, watched_until)
    values ('00000000-0000-4000-d000-000000001801', k, '00000000-0000-4000-a000-000000001802', 999);
    raise exception 'student: wrote lesson progress directly';
  exception when insufficient_privilege then null; end;
  begin
    perform lesson_stops('00000000-0000-4000-d000-000000001801');
    raise exception 'student: called lesson_stops';
  exception when insufficient_privilege then null; end;
  begin
    perform quiz_answer_correct('true_false', 'true', 'true');
    raise exception 'student: called quiz_answer_correct';
  exception when insufficient_privilege then null; end;
  begin
    perform lesson_open('QZPKM234', k);
    raise exception 'student: called lesson_open';
  exception when insufficient_privilege then null; end;
  begin
    perform lesson_sync_progress('00000000-0000-4000-d000-000000001801', k, '00000000-0000-4000-a000-000000001802');
    raise exception 'student: called lesson_sync_progress';
  exception when insufficient_privilege then null; end;
  begin
    perform quiz_word_boxes(null::quizzes);
    raise exception 'student: called quiz_word_boxes';
  exception when insufficient_privilege then null; end;

  -- opening the lesson: no key anywhere, the video and the questions are there
  res := get_lesson_for_taking('qzpkm234 ', k);
  if res::text ~ '"answer"' then raise exception 'student: an answer leaked: %', res; end if;
  if jsonb_array_length(res->'questions') <> 6 or jsonb_array_length(res->'answers') <> 0 then
    raise exception 'open: questions/answers wrong: %', res;
  end if;
  if (res->'questions'->0) ? 'answer' then raise exception 'open: a question carries its key'; end if;
  if (res->'questions'->1->>'card_id') is distinct from '00000000-0000-4000-c000-0000000018c1'
     or (res->'questions'->2->'card_id') is distinct from 'null'::jsonb then
    raise exception 'open: card ids wrong: %', res->'questions';
  end if;
  if (res->>'watched_until')::numeric <> 0 or res->'score' is distinct from 'null'::jsonb
     or res->>'class_name' <> 'Lesson Bio' or res->>'title' <> 'Cells lesson'
     or (res->'video'->'slides'->3->>'startSeconds')::numeric <> 15 or not (res ? 'word_boxes') then
    raise exception 'open: payload wrong: %', res;
  end if;

  -- the progress row exists, and it is the student's own
  if (select count(*) from lesson_progress) <> 1 then raise exception 'open: no progress row'; end if;

  -- the class modes are visible to the quiz reader too
  res := get_quiz_for_taking('QZPKM234');
  if res->'classes'->0->>'mode' <> 'lesson' then raise exception 'taking: mode missing: %', res->'classes'; end if;
  res := get_quiz_for_taking('QZPKM235');
  if res->'classes'->0->>'mode' <> 'quiz' then raise exception 'taking: quiz mode wrong: %', res->'classes'; end if;

  -- a lesson cannot be submitted as a quiz
  msg := null;
  begin perform submit_quiz_attempt('QZPKM234', k, '{}');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'This quiz is a lesson in that class. Open the lesson.' then
    raise exception 'submit on a lesson: %', msg;
  end if;

  -- and a quiz is not a lesson
  msg := null;
  begin perform get_lesson_for_taking('QZPKM235', k);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'This lesson isn''t posted to that class.' then raise exception 'open a quiz as a lesson: %', msg; end if;

  -- answers go in order, and only after watching up to them
  msg := null;
  begin perform answer_lesson_checkpoint('QZPKM234', k, q1, 'true');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Answer the questions in order.' then raise exception 'order (q1 first): %', msg; end if;

  msg := null;
  begin perform answer_lesson_checkpoint('QZPKM234', k, q2, 'true');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Watch up to this question first.' then raise exception 'watch first (q2 at 0): %', msg; end if;

  msg := null;
  begin perform answer_lesson_checkpoint('QZPKM234', k, '00000000-0000-4000-f000-000000001807', 'true');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'That question isn''t in this lesson.' then raise exception 'another quiz''s question: %', msg; end if;

  if exists (select 1 from lesson_answers) then raise exception 'a refused answer was stored'; end if;

  -- the first heartbeat right after the start credits at most the slack
  res := lesson_watch('QZPKM234', k, 100);
  if (res->>'watched_until')::numeric > 2 or (res->>'watched_until')::numeric <= 0 then
    raise exception 'watch: right after the start expected (0,2], got %', res;
  end if;

  -- calling again and again does not buy more time
  for i in 1..50 loop
    res := lesson_watch('QZPKM234', k, 100);
  end loop;
  if (res->>'watched_until')::numeric > 2 then
    raise exception 'watch: hammering the heartbeat advanced to %', res;
  end if;
end $$;

-- ── 6. S watches for a minute: the first stop is the ceiling ────────────────
reset role;
update lesson_progress set last_beat_at = clock_timestamp() - interval '60 seconds'
 where student_id = '00000000-0000-4000-a000-000000001802';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001802","role":"authenticated"}', true);

do $$
declare
  res jsonb;
  msg text;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
  q1 constant uuid := '00000000-0000-4000-f000-000000001801';
  q2 constant uuid := '00000000-0000-4000-f000-000000001802';
  q4 constant uuid := '00000000-0000-4000-f000-000000001804';
begin
  res := lesson_watch('QZPKM234', k, 100);
  if (res->>'watched_until')::numeric <> 5 then
    raise exception 'watch: a minute later should stop at q2''s 5, not run to 17: %', res;
  end if;

  -- answer q2; a second answer returns the stored result and changes nothing
  res := answer_lesson_checkpoint('QZPKM234', k, q2, 'true');
  if (res->>'correct')::boolean is distinct from true or (res->>'finished')::boolean is distinct from false
     or res->'score' is distinct from 'null'::jsonb then
    raise exception 'answer q2: %', res;
  end if;
  res := answer_lesson_checkpoint('QZPKM234', k, q2, 'false');
  if (res->>'correct')::boolean is distinct from true or (res->>'finished')::boolean is distinct from false then
    raise exception 'answer q2 twice should return the stored result: %', res;
  end if;
  if (select count(*) from lesson_answers) <> 1 then raise exception 'answer q2 twice stored two rows'; end if;

  -- q1 is next; q4 is not
  msg := null;
  begin perform answer_lesson_checkpoint('QZPKM234', k, q4, 'true');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Answer the questions in order.' then raise exception 'order (q4 before q1): %', msg; end if;

  -- q1 needs 14 seconds watched, and S has 5
  msg := null;
  begin perform answer_lesson_checkpoint('QZPKM234', k, q1, 'true');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Watch up to this question first.' then raise exception 'watch first (q1 at 5): %', msg; end if;
end $$;

-- ── 7. a minute more: 5 + 17 = 22, held at q1's 15 ──────────────────────────
reset role;
update lesson_progress set last_beat_at = clock_timestamp() - interval '60 seconds'
 where student_id = '00000000-0000-4000-a000-000000001802';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001802","role":"authenticated"}', true);

do $$
declare
  res jsonb;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
begin
  res := lesson_watch('QZPKM234', k, 100);
  if (res->>'watched_until')::numeric <> 15 then
    raise exception 'watch: 5 + 17 should be held at q1''s 15: %', res;
  end if;
end $$;

-- ── 8. the teacher makes the video again: the credit falls back ─────────────
-- Answered so far: q2 (stop 5). The slide after it starts at 5.
reset role;
update presentations set video = jsonb_set(video, '{generatedAt}', '"2026-11-06T11:00:00.000Z"')
 where id = '00000000-0000-4000-e000-000000001801';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001802","role":"authenticated"}', true);

do $$
declare
  res jsonb;
  msg text;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
  q1 constant uuid := '00000000-0000-4000-f000-000000001801';
begin
  -- the stored credit is still 15, which would let q1 through; answering must
  -- reset it first
  if (select watched_until from lesson_progress) <> 15 then raise exception 'regenerate: setup'; end if;
  msg := null;
  begin perform answer_lesson_checkpoint('QZPKM234', k, q1, 'false');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Watch up to this question first.' then
    raise exception 'regenerate: answering on the old credit: %', msg;
  end if;

  -- opening stores the reset
  res := get_lesson_for_taking('QZPKM234', k);
  if (res->>'watched_until')::numeric <> 5 then raise exception 'regenerate: expected 5, got %', res->'watched_until'; end if;
  if (select video_generated_at from lesson_progress) <> '2026-11-06T11:00:00.000Z' then
    raise exception 'regenerate: new video not recorded';
  end if;
  if jsonb_array_length(res->'answers') <> 1 then raise exception 'regenerate: answers should survive'; end if;
end $$;

reset role;
update lesson_progress set last_beat_at = clock_timestamp() - interval '60 seconds'
 where student_id = '00000000-0000-4000-a000-000000001802';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001802","role":"authenticated"}', true);

-- ── 9. S works through the rest ─────────────────────────────────────────────
-- q1 wrong, q4 right, q6 right, q3 wrong, q5 right: 4 of 6 with q2.
do $$
declare
  res jsonb;
  msg text;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
  q1 constant uuid := '00000000-0000-4000-f000-000000001801';
  q3 constant uuid := '00000000-0000-4000-f000-000000001803';
  q4 constant uuid := '00000000-0000-4000-f000-000000001804';
  q5 constant uuid := '00000000-0000-4000-f000-000000001805';
  q6 constant uuid := '00000000-0000-4000-f000-000000001806';
begin
  res := lesson_watch('QZPKM234', k, 100);
  if (res->>'watched_until')::numeric <> 15 then raise exception 'rest: watch after the reset: %', res; end if;

  res := answer_lesson_checkpoint('QZPKM234', k, q1, 'false');
  if (res->>'correct')::boolean is distinct from false then raise exception 'rest: q1 should be wrong: %', res; end if;
  res := answer_lesson_checkpoint('QZPKM234', k, q4, 'true');
  if (res->>'correct')::boolean is distinct from true or (res->>'finished')::boolean then raise exception 'rest: q4: %', res; end if;

  -- q6 is at 18; S has 15
  msg := null;
  begin perform answer_lesson_checkpoint('QZPKM234', k, q6, 'true');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Watch up to this question first.' then raise exception 'rest: q6 before watching: %', msg; end if;
end $$;

reset role;
update lesson_progress set last_beat_at = clock_timestamp() - interval '60 seconds'
 where student_id = '00000000-0000-4000-a000-000000001802';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001802","role":"authenticated"}', true);

do $$
declare
  res jsonb;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
  q3 constant uuid := '00000000-0000-4000-f000-000000001803';
  q5 constant uuid := '00000000-0000-4000-f000-000000001805';
  q6 constant uuid := '00000000-0000-4000-f000-000000001806';
  msg text;
begin
  res := lesson_watch('QZPKM234', k, 100);
  if (res->>'watched_until')::numeric <> 18 then raise exception 'rest: watch to the end: %', res; end if;

  res := answer_lesson_checkpoint('QZPKM234', k, q6, 'true');
  if (res->>'correct')::boolean is distinct from true or (res->>'finished')::boolean then raise exception 'rest: q6: %', res; end if;
  res := answer_lesson_checkpoint('QZPKM234', k, q3, 'false');
  if (res->>'correct')::boolean is distinct from false or (res->>'finished')::boolean then raise exception 'rest: q3: %', res; end if;

  -- no attempt before the last answer
  if exists (select 1 from quiz_attempts) then raise exception 'rest: an attempt exists before the last answer'; end if;

  res := answer_lesson_checkpoint('QZPKM234', k, q5, 'true');
  if (res->>'correct')::boolean is distinct from true or (res->>'finished')::boolean is distinct from true
     or (res->>'score')::numeric is distinct from (4::numeric / 6) then
    raise exception 'finish: expected finished with 4/6, got %', res;
  end if;

  -- exactly one ordinary attempt, with that score
  if (select count(*) from quiz_attempts) <> 1
     or (select score from quiz_attempts) is distinct from (4::numeric / 6)
     or (select student_id from quiz_attempts) <> '00000000-0000-4000-a000-000000001802' then
    raise exception 'finish: expected one attempt scoring 4/6, got %', (select jsonb_agg(to_jsonb(a)) from quiz_attempts a);
  end if;

  -- a retry of the last answer (a lost reply) lands on the end of the lesson: the stored
  -- result, finished, with the attempt's score; nothing is written twice
  res := answer_lesson_checkpoint('QZPKM234', k, q5, 'false');
  if (res->>'correct')::boolean is distinct from true or (res->>'finished')::boolean is distinct from true
     or (res->>'score')::numeric is distinct from (4::numeric / 6) then
    raise exception 'after finishing: re-answering the last question gave %', res;
  end if;
  res := answer_lesson_checkpoint('QZPKM234', k, q6, 'true');
  if (res->>'finished')::boolean is distinct from true or (res->>'score')::numeric is distinct from (4::numeric / 6) then
    raise exception 'after finishing: re-answering an earlier question gave %', res;
  end if;
  if (select count(*) from quiz_attempts) <> 1
     or (select count(*) from lesson_answers where student_id = '00000000-0000-4000-a000-000000001802') <> 6 then
    raise exception 'after finishing: a re-answer wrote something';
  end if;

  -- reopening shows the result and the answers, still no key
  res := get_lesson_for_taking('QZPKM234', k);
  if (res->>'score')::numeric is distinct from (4::numeric / 6) or jsonb_array_length(res->'answers') <> 6
     or res::text ~ '"answer"' then
    raise exception 'finish: reopened payload wrong: %', res;
  end if;
  if (select count(*) filter (where (a->>'correct')::boolean) from jsonb_array_elements(res->'answers') a) <> 4 then
    raise exception 'finish: answers should hold 4 right';
  end if;
end $$;

-- A question that is NOT yet answered is still refused once the attempt exists: take one
-- answer away (as the superuser), try it, then put it back exactly as it was.
reset role;
create temp table _removed_answer as
  select * from lesson_answers
   where student_id = '00000000-0000-4000-a000-000000001802'
     and question_id = '00000000-0000-4000-f000-000000001805';
delete from lesson_answers
 where student_id = '00000000-0000-4000-a000-000000001802'
   and question_id = '00000000-0000-4000-f000-000000001805';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001802","role":"authenticated"}', true);

do $$
declare
  msg text;
begin
  begin perform answer_lesson_checkpoint('QZPKM234', '00000000-0000-4000-b000-000000001801', '00000000-0000-4000-f000-000000001805', 'true');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'You''ve already submitted this quiz for this class.' then
    raise exception 'after finishing: an unanswered question should be refused, got %', msg;
  end if;
end $$;

reset role;
insert into lesson_answers select * from _removed_answer;
drop table _removed_answer;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001802","role":"authenticated"}', true);

-- ── 10. the posting cannot flip under students ──────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001801","role":"authenticated"}', true);

do $$
declare
  msg text;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
begin
  -- the teacher sees the students' progress and answers
  if (select count(*) from lesson_answers where student_id = '00000000-0000-4000-a000-000000001802') <> 6
     or (select count(*) from lesson_progress where student_id = '00000000-0000-4000-a000-000000001802') <> 1 then
    raise exception 'teacher: cannot see the class''s lesson rows';
  end if;

  -- started as a lesson: cannot be re-posted as a quiz...
  delete from quiz_classes where quiz_id = '00000000-0000-4000-d000-000000001801' and class_id = k;
  msg := null;
  begin insert into quiz_classes (quiz_id, class_id, mode) values ('00000000-0000-4000-d000-000000001801', k, 'quiz');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Students already started this as a lesson in that class.' then
    raise exception 'repost as quiz: %', msg;
  end if;
  -- ...but can be a lesson again
  insert into quiz_classes (quiz_id, class_id, mode) values ('00000000-0000-4000-d000-000000001801', k, 'lesson');
end $$;

-- ── 11. a quiz taken as a quiz cannot become a lesson ───────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001802","role":"authenticated"}', true);

do $$
declare
  res jsonb;
begin
  -- the plain quiz still works end to end
  res := submit_quiz_attempt('QZPKM235', '00000000-0000-4000-b000-000000001801',
    jsonb_build_object('00000000-0000-4000-f000-000000001807', true));
  if (res->>'correct')::int <> 1 or (res->>'total')::int <> 1 then raise exception 'quiz mode: scoring broke: %', res; end if;
end $$;

-- the storage policy, before the postings change again (Q2 is a plain quiz here)
reset role;
insert into storage.objects (bucket_id, name) values
  ('deck-videos', '00000000-0000-4000-a000-000000001801/00000000-0000-4000-e000-000000001801.mp4'),
  ('deck-videos', '00000000-0000-4000-a000-000000001801/00000000-0000-4000-e000-000000001802.mp4');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001802","role":"authenticated"}', true);

do $$ begin
  if not can_watch_deck_video('00000000-0000-4000-a000-000000001801/00000000-0000-4000-e000-000000001801.mp4') then
    raise exception 'video: a member cannot watch the lesson''s video';
  end if;
  if can_watch_deck_video('00000000-0000-4000-a000-000000001801/00000000-0000-4000-e000-000000001802.mp4') then
    raise exception 'video: the video of a plain quiz was readable';
  end if;
  if can_watch_deck_video('00000000-0000-4000-a000-000000001802/00000000-0000-4000-e000-000000001801.mp4') then
    raise exception 'video: a file in someone else''s folder was readable';
  end if;
  if can_watch_deck_video('x/not-a-uuid.mp4') or can_watch_deck_video('nonsense') or can_watch_deck_video('') then
    raise exception 'video: a malformed name was readable';
  end if;
  -- the storage policy itself
  if (select count(*) from storage.objects where bucket_id = 'deck-videos') <> 1 then
    raise exception 'video: the member should see exactly the lesson''s video, saw %',
      (select count(*) from storage.objects where bucket_id = 'deck-videos');
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001803","role":"authenticated"}', true);
do $$ begin
  if can_watch_deck_video('00000000-0000-4000-a000-000000001801/00000000-0000-4000-e000-000000001801.mp4') then
    raise exception 'video: a non-member can watch the lesson''s video';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'deck-videos') <> 0 then
    raise exception 'video: a non-member saw a video object';
  end if;
end $$;

-- S has submitted Q2 as a quiz: it cannot be posted as a lesson in that class
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001801","role":"authenticated"}', true);
do $$
declare
  msg text;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
begin
  delete from quiz_classes where quiz_id = '00000000-0000-4000-d000-000000001802' and class_id = k;
  msg := null;
  begin insert into quiz_classes (quiz_id, class_id, mode) values ('00000000-0000-4000-d000-000000001802', k, 'lesson');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Students already took this as a quiz in that class.' then
    raise exception 'repost as lesson: %', msg;
  end if;
end $$;

-- ── 12. S2 cannot see S's lesson rows; a new video resets to 0; no video ───
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001804","role":"authenticated"}', true);

do $$
declare
  res jsonb;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
begin
  -- S2 has nothing yet, and S's rows are hidden
  if exists (select 1 from lesson_answers) or exists (select 1 from lesson_progress) then
    raise exception 'student: S2 can read another student''s lesson rows';
  end if;
  res := get_lesson_for_taking('QZPKM234', k);
  if jsonb_array_length(res->'answers') <> 0 or res->'score' is distinct from 'null'::jsonb
     or (res->>'watched_until')::numeric <> 0 then
    raise exception 'S2: starts from scratch: %', res;
  end if;
  res := lesson_watch('QZPKM234', k, 100);
  if (res->>'watched_until')::numeric > 2 or (res->>'watched_until')::numeric <= 0 then
    raise exception 'S2: first heartbeat: %', res;
  end if;
  if (select count(*) from lesson_progress) <> 1 then raise exception 'S2: sees other students'' progress'; end if;
end $$;

-- a regenerated video with nothing answered: back to 0
reset role;
update presentations set video = jsonb_set(video, '{generatedAt}', '"2026-11-06T12:00:00.000Z"')
 where id = '00000000-0000-4000-e000-000000001801';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001804","role":"authenticated"}', true);

do $$
declare res jsonb;
begin
  res := get_lesson_for_taking('QZPKM234', '00000000-0000-4000-b000-000000001801');
  if (res->>'watched_until')::numeric <> 0 then raise exception 'S2: reset with nothing answered: %', res; end if;
end $$;

-- the video is removed: the questions are asked in order_index order and need no watching
reset role;
update presentations set video = null where id = '00000000-0000-4000-e000-000000001801';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001804","role":"authenticated"}', true);

do $$
declare
  res jsonb;
  msg text;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
begin
  res := get_lesson_for_taking('QZPKM234', k);
  if res->'video' is distinct from 'null'::jsonb then raise exception 'S2: video should read null: %', res->'video'; end if;

  res := lesson_watch('QZPKM234', k, 100);
  if (res->>'watched_until')::numeric <> 0 then raise exception 'S2: nothing to pace, but credit moved: %', res; end if;

  -- without a timeline the first question is q1, not q2
  msg := null;
  begin perform answer_lesson_checkpoint('QZPKM234', k, '00000000-0000-4000-f000-000000001802', 'true');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Answer the questions in order.' then raise exception 'S2: order without a video: %', msg; end if;

  for i in 1..5 loop
    res := answer_lesson_checkpoint('QZPKM234', k, ('00000000-0000-4000-f000-00000000180' || i)::uuid, 'true');
    if (res->>'finished')::boolean then raise exception 'S2: finished early at %', i; end if;
  end loop;
  res := answer_lesson_checkpoint('QZPKM234', k, '00000000-0000-4000-f000-000000001806', 'true');
  if (res->>'finished')::boolean is distinct from true or (res->>'score')::numeric is distinct from 1::numeric then
    raise exception 'S2: expected finished with 1, got %', res;
  end if;
end $$;

-- ── 12b. unused watch time is banked for 15 seconds only ───────────────────
-- S2 opens the long lesson and then sits idle for ten minutes. Calling the
-- heartbeat back to back must credit 17 seconds in all (15 banked + 2 slack),
-- not 17 a call until the ten minutes are spent.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001804","role":"authenticated"}', true);
do $$ begin perform get_lesson_for_taking('QZPKM236', '00000000-0000-4000-b000-000000001801'); end $$;

reset role;
update lesson_progress set last_beat_at = clock_timestamp() - interval '600 seconds'
 where quiz_id = '00000000-0000-4000-d000-000000001803' and student_id = '00000000-0000-4000-a000-000000001804';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001804","role":"authenticated"}', true);

do $$
declare
  res jsonb;
begin
  res := lesson_watch('QZPKM236', '00000000-0000-4000-b000-000000001801', 1000);
  if (res->>'watched_until')::numeric <> 17 then
    raise exception 'bank: the first call after ten idle minutes should credit 17, got %', res;
  end if;
  for i in 1..5 loop
    res := lesson_watch('QZPKM236', '00000000-0000-4000-b000-000000001801', 1000);
  end loop;
  if (res->>'watched_until')::numeric > 19 then
    raise exception 'bank: idle time was not capped, watched_until is %', res;
  end if;
end $$;

-- ── 12c. the mode locks at the first answer, not at opening ────────────────
-- S2 has opened the long lesson (a progress row) and answered nothing: the
-- teacher can still re-post it as a quiz, and back as a lesson.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001801","role":"authenticated"}', true);
do $$
declare
  k constant uuid := '00000000-0000-4000-b000-000000001801';
begin
  if not exists (select 1 from lesson_progress where quiz_id = '00000000-0000-4000-d000-000000001803')
     or exists (select 1 from lesson_answers where quiz_id = '00000000-0000-4000-d000-000000001803') then
    raise exception 'lock: setup (opened but not answered)';
  end if;
  delete from quiz_classes where quiz_id = '00000000-0000-4000-d000-000000001803' and class_id = k;
  insert into quiz_classes (quiz_id, class_id, mode) values ('00000000-0000-4000-d000-000000001803', k, 'quiz');
  delete from quiz_classes where quiz_id = '00000000-0000-4000-d000-000000001803' and class_id = k;
  insert into quiz_classes (quiz_id, class_id, mode) values ('00000000-0000-4000-d000-000000001803', k, 'lesson');
end $$;

-- ...but one answer is enough to lock it (written as the superuser: answering for real
-- would need the whole 300 s watched).
reset role;
insert into lesson_answers (quiz_id, class_id, student_id, question_id, correct) values
  ('00000000-0000-4000-d000-000000001803', '00000000-0000-4000-b000-000000001801',
   '00000000-0000-4000-a000-000000001804', '00000000-0000-4000-f000-000000001808', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000001801","role":"authenticated"}', true);
do $$
declare
  msg text;
  k constant uuid := '00000000-0000-4000-b000-000000001801';
begin
  delete from quiz_classes where quiz_id = '00000000-0000-4000-d000-000000001803' and class_id = k;
  begin insert into quiz_classes (quiz_id, class_id, mode) values ('00000000-0000-4000-d000-000000001803', k, 'quiz');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Students already started this as a lesson in that class.' then
    raise exception 'lock: one answer should lock the mode, got %', msg;
  end if;
  insert into quiz_classes (quiz_id, class_id, mode) values ('00000000-0000-4000-d000-000000001803', k, 'lesson');
end $$;

-- ── 13. the lesson rows are cleaned up with the class ───────────────────────
reset role;
do $$ begin
  if (select count(*) from lesson_answers where quiz_id = '00000000-0000-4000-d000-000000001801') <> 12
     or (select count(*) from lesson_progress where quiz_id = '00000000-0000-4000-d000-000000001801') <> 2 then
    raise exception 'rows: expected 12 answers and 2 progress rows';
  end if;
  delete from classes where id = '00000000-0000-4000-b000-000000001801';
  if exists (select 1 from lesson_answers where quiz_id in ('00000000-0000-4000-d000-000000001801', '00000000-0000-4000-d000-000000001803'))
     or exists (select 1 from lesson_progress where quiz_id in ('00000000-0000-4000-d000-000000001801', '00000000-0000-4000-d000-000000001803')) then
    raise exception 'cascade: lesson rows survived their class';
  end if;
end $$;

rollback;

select 'lessons checks passed' as result;
