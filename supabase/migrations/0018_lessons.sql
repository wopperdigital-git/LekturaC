-- 0018_lessons.sql
-- Lessons: a student watches a deck's narrated video, which pauses at quiz
-- checkpoints. The SERVER enforces that they watched up to each checkpoint and
-- answer in order; the final score becomes an ordinary quiz_attempts row.
-- Builds on 0009 (classroom), 0012/0016 (quizzes) and 0015 (deck videos).
-- None of those files is edited.
--
--   * quiz_classes.mode ('quiz' | 'lesson'): how a quiz is posted to a class.
--   * lesson_answers / lesson_progress: a student's checkpoint answers (only
--     whether each was right, never the key) and how far they have watched.
--     RLS on, read-only for students and teachers; every write is a
--     security definer function below.
--   * quiz_answer_correct: the per-type scoring block of 0016's
--     submit_quiz_attempt, moved out unchanged so a lesson scores exactly like
--     a quiz. submit_quiz_attempt is re-created with it, and now refuses a
--     quiz that is a lesson in that class. get_quiz_for_taking is re-created
--     with each class's mode.
--   * lesson_stops: where the video pauses for each question. It mirrors
--     placeCheckpoints in src/lesson/checkpoints.ts exactly.
--   * get_lesson_for_taking / lesson_watch / answer_lesson_checkpoint: the
--     ONLY way a student touches a lesson. No RPC returns quiz_questions.answer.
--   * quiz_classes trigger: a quiz is posted as a lesson only with a narrated
--     video, and a class never mixes quiz attempts and lesson progress.
--   * deck_videos_lesson_select: a student can read the video of a deck whose
--     quiz is posted as a lesson to a class they are in.
--
-- Does NOT gate anything else: card writes and the classroom reads do not
-- depend on it (the app reads postings' modes in a separate best-effort query;
-- without 0018 every posting is a quiz). Gates: opening, watching and
-- answering a lesson, and watching a lesson's video.
--
-- No RLS policy selects from another RLS table; cross-table checks live in
-- security definer functions (the 0009/0012 rule).

-- ─── posting mode ───────────────────────────────────────────────────────────

alter table quiz_classes
  add column if not exists mode text not null default 'quiz' check (mode in ('quiz', 'lesson'));

-- ─── tables ─────────────────────────────────────────────────────────────────

-- One row per question a student has answered in a lesson. Only whether it was
-- right is kept: the answer key never reaches a student.
create table if not exists lesson_answers (
  quiz_id uuid not null references quizzes(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  question_id uuid not null references quiz_questions(id) on delete cascade,
  correct boolean not null,
  answered_at timestamptz default now(),
  primary key (quiz_id, class_id, student_id, question_id)
);

-- How far into the video the server has credited a student. last_beat_at is
-- the heartbeat clock lesson_watch spends watch time against (see there); it
-- can run up to 2 seconds ahead of the real time. video_generated_at is the
-- video this credit was earned on: a regenerated video resets the credit.
create table if not exists lesson_progress (
  quiz_id uuid not null references quizzes(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  watched_until numeric not null default 0,
  last_beat_at timestamptz not null default clock_timestamp(),
  video_generated_at text,
  primary key (quiz_id, class_id, student_id)
);

create index if not exists lesson_answers_class_id_idx on lesson_answers (class_id);
create index if not exists lesson_progress_class_id_idx on lesson_progress (class_id);

alter table lesson_answers enable row level security;
alter table lesson_progress enable row level security;

drop policy if exists lesson_answers_select on lesson_answers;
create policy lesson_answers_select on lesson_answers
  for select using (student_id = auth.uid() or is_class_teacher(class_id));

drop policy if exists lesson_progress_select on lesson_progress;
create policy lesson_progress_select on lesson_progress
  for select using (student_id = auth.uid() or is_class_teacher(class_id));

-- No write policies: the functions below (security definer) are the only
-- writers. The grants are revoked as well, so a direct write fails loudly
-- instead of quietly touching zero rows.
revoke all on lesson_answers from anon;
revoke all on lesson_progress from anon;
revoke insert, update, delete, truncate on lesson_answers from authenticated;
revoke insert, update, delete, truncate on lesson_progress from authenticated;

-- ─── scoring, moved out of submit_quiz_attempt ──────────────────────────────

-- Whether `p_given` is a right answer to a question of type `p_type` whose key
-- is `p_answer`. This is the 0016 per-type block, unchanged.
create or replace function quiz_answer_correct(p_type text, p_answer jsonb, p_given jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  ok boolean := false;
  norm text;
begin
  if p_given is not null and jsonb_typeof(p_given) <> 'null' then
    if p_type = 'multiple_choice' then
      ok := jsonb_typeof(p_given) = 'number' and p_given = p_answer;
    elsif p_type = 'true_false' then
      ok := jsonb_typeof(p_given) = 'boolean' and p_given = p_answer;
    elsif p_type = 'fill_blank' then
      if jsonb_typeof(p_given) = 'string' then
        norm := normalize_answer(p_given #>> '{}');
        ok := norm <> '' and (
          norm = normalize_answer(p_answer->>'text')
          or exists (
            select 1 from jsonb_array_elements_text(coalesce(p_answer->'accepted', '[]'::jsonb)) a
            where normalize_answer(a) = norm)
        );
      end if;
    end if;
  end if;
  return coalesce(ok, false);
end;
$$;

-- ─── video timeline helpers ─────────────────────────────────────────────────

-- The slides of a presentations.video record, in order. A malformed or absent
-- list is no slides.
create or replace function lesson_slides(p_video jsonb)
returns table(idx int, card_id text, start_s numeric, dur_s numeric)
language sql
immutable
set search_path = public
as $$
  select
    (t.i - 1)::int,
    t.elem->>'cardId',
    case when jsonb_typeof(t.elem->'startSeconds') = 'number' then (t.elem->>'startSeconds')::numeric else 0 end,
    case when jsonb_typeof(t.elem->'durationSeconds') = 'number' then (t.elem->>'durationSeconds')::numeric else 0 end
  from jsonb_array_elements(
         case when jsonb_typeof(p_video->'slides') = 'array' then p_video->'slides' else '[]'::jsonb end
       ) with ordinality as t(elem, i)
$$;

-- A video that can pace a lesson: it carries a non-empty slides array. An
-- empty array counts as no slides everywhere.
create or replace function lesson_has_slides(p_video jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
           when jsonb_typeof(p_video->'slides') = 'array' then jsonb_array_length(p_video->'slides') > 0
           else false
         end
$$;

-- Where the video pauses for each of a quiz's questions, in the order they are
-- asked. Mirrors placeCheckpoints (src/lesson/checkpoints.ts) exactly:
--   * a question is placed when its card_id (as text) equals some slide's
--     cardId (the first matching slide wins) and stops at that slide's
--     start + duration; placed stops are ordered by (slide position,
--     order_index);
--   * every other question (no card, or a card not in the video) is asked at
--     the video's end, after the placed ones, by order_index;
--   * with no slides every stop is 0, in order_index order.
create or replace function lesson_stops(p_quiz_id uuid)
returns table(question_id uuid, stop_seconds numeric, ord int)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select p.video
      from quizzes z
      left join presentations p on p.id = z.presentation_id
     where z.id = p_quiz_id
  ),
  s as (
    select sl.idx, sl.card_id, sl.start_s, sl.dur_s
      from v cross join lateral lesson_slides(v.video) sl
  ),
  first_slide as (
    select distinct on (s.card_id) s.card_id, s.idx, s.start_s + s.dur_s as end_s
      from s
     where s.card_id is not null
     order by s.card_id, s.idx
  ),
  video_end as (
    select coalesce((select s.start_s + s.dur_s from s order by s.idx desc limit 1), 0) as end_s
  ),
  placed as (
    select qq.id, qq.order_index, f.idx as slide_idx,
           coalesce(f.end_s, (select end_s from video_end)) as stop_s
      from quiz_questions qq
      left join first_slide f on f.card_id = qq.card_id::text
     where qq.quiz_id = p_quiz_id
  )
  select pl.id,
         pl.stop_s,
         (row_number() over (order by (pl.slide_idx is null), pl.slide_idx, pl.order_index, pl.id))::int
    from placed pl
$$;

-- ─── submit_quiz_attempt, now through quiz_answer_correct ───────────────────

create or replace function submit_quiz_attempt(p_code text, p_class_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quiz quizzes%rowtype;
  rec record;
  given jsonb;
  ok boolean;
  total integer := 0;
  correct integer := 0;
  results jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Log in to take a quiz.'; end if;

  select * into quiz from quizzes where code = upper(trim(p_code));
  if not found then raise exception 'No quiz with that code.'; end if;
  if not exists (select 1 from class_members where class_id = p_class_id and student_id = auth.uid()) then
    raise exception 'You''re not in that class.';
  end if;
  if not exists (select 1 from quiz_classes where quiz_id = quiz.id and class_id = p_class_id) then
    raise exception 'This quiz isn''t posted to that class.';
  end if;
  if exists (select 1 from quiz_classes where quiz_id = quiz.id and class_id = p_class_id and mode = 'lesson') then
    raise exception 'This quiz is a lesson in that class. Open the lesson.';
  end if;
  if exists (select 1 from quiz_attempts where quiz_id = quiz.id and class_id = p_class_id and student_id = auth.uid()) then
    raise exception 'You''ve already submitted this quiz for this class.';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'Answer every question before submitting.';
  end if;

  for rec in
    select qq.id, qq.answer, qq.question_type
      from quiz_questions qq
     where qq.quiz_id = quiz.id
     order by qq.order_index
  loop
    total := total + 1;
    given := p_answers -> (rec.id::text);
    ok := quiz_answer_correct(rec.question_type, rec.answer, given);

    if ok then correct := correct + 1; end if;
    results := results || to_jsonb(ok);
  end loop;

  if total = 0 then raise exception 'This quiz has no questions.'; end if;

  begin
    insert into quiz_attempts (quiz_id, class_id, student_id, score)
    values (quiz.id, p_class_id, auth.uid(), correct::numeric / total);
  exception when unique_violation then
    raise exception 'You''ve already submitted this quiz for this class.';
  end;

  return jsonb_build_object(
    'score', correct::numeric / total,
    'correct', correct,
    'total', total,
    'results', results
  );
end;
$$;

-- ─── word boxes ─────────────────────────────────────────────────────────────

-- The word box per fill-in-the-blank test that asked for one, as 0016's
-- get_quiz_for_taking built it (moved out unchanged so a lesson shows the same
-- boxes): that test's answers, shuffled stably. JSON comparison, never a cast
-- (settings is client-supplied and must not be able to break taking). Called
-- only by the two taking functions.
create or replace function quiz_word_boxes(p_quiz quizzes)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  boxes jsonb := '{}'::jsonb;
  sec record;
begin
  if jsonb_typeof(p_quiz.settings->'sections') = 'array' then
    for sec in
      select (t.ord - 1)::int as idx, t.elem
        from jsonb_array_elements(p_quiz.settings->'sections') with ordinality as t(elem, ord)
    loop
      if sec.elem->>'type' = 'fill_blank' and coalesce(sec.elem->'wordBox' = 'true'::jsonb, false) then
        boxes := boxes || jsonb_build_object(sec.idx::text, (
          select coalesce(jsonb_agg(w.word order by md5(w.word || p_quiz.id::text)), '[]'::jsonb)
            from (select distinct (qq.answer->>'text') as word
                    from quiz_questions qq
                   where qq.quiz_id = p_quiz.id
                     and qq.section_index = sec.idx
                     and qq.question_type = 'fill_blank') w));
      end if;
    end loop;
  elsif p_quiz.quiz_type = 'fill_blank' and coalesce(p_quiz.settings->'wordBox' = 'true'::jsonb, false) then
    boxes := jsonb_build_object('0', (
      select coalesce(jsonb_agg(w.word order by md5(w.word || p_quiz.id::text)), '[]'::jsonb)
        from (select distinct (qq.answer->>'text') as word from quiz_questions qq where qq.quiz_id = p_quiz.id) w));
  end if;

  return boxes;
end;
$$;

-- ─── get_quiz_for_taking, now with each class's mode ────────────────────────

create or replace function get_quiz_for_taking(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quiz quizzes%rowtype;
  eligible jsonb;
  question_list jsonb;
  boxes jsonb;
begin
  if auth.uid() is null then raise exception 'Log in to take a quiz.'; end if;

  select * into quiz from quizzes where code = upper(trim(p_code));
  if not found then raise exception 'No quiz with that code.'; end if;
  if not exists (select 1 from quiz_classes where quiz_id = quiz.id) then
    raise exception 'This quiz isn''t available yet.';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', c.id,
             'name', c.name,
             'mode', qc.mode,
             'attempted', exists (
               select 1 from quiz_attempts a
               where a.quiz_id = quiz.id and a.class_id = c.id and a.student_id = auth.uid())
           ) order by qc.posted_at), '[]'::jsonb)
    into eligible
    from quiz_classes qc
    join classes c on c.id = qc.class_id
    join class_members m on m.class_id = c.id and m.student_id = auth.uid()
    where qc.quiz_id = quiz.id;

  if jsonb_array_length(eligible) = 0 then
    raise exception 'This quiz is posted to a class you haven''t joined. Join the class with its class code first.';
  end if;

  -- Deliberately no `answer` column here.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', qq.id,
             'order_index', qq.order_index,
             'section_index', qq.section_index,
             'question_type', qq.question_type,
             'slide_number', qq.slide_number,
             'prompt', qq.prompt,
             'choices', qq.choices
           ) order by qq.order_index), '[]'::jsonb)
    into question_list
    from quiz_questions qq
    where qq.quiz_id = quiz.id;

  boxes := quiz_word_boxes(quiz);

  return jsonb_build_object(
    'id', quiz.id,
    'title', quiz.title,
    'deck_title', quiz.deck_title,
    'quiz_type', quiz.quiz_type,
    'settings', quiz.settings,
    'classes', eligible,
    'questions', question_list,
    'word_boxes', boxes
  );
end;
$$;

-- ─── lesson internals ───────────────────────────────────────────────────────

-- The shared door of the three lesson RPCs: signed in, the quiz exists, the
-- caller is in the class, and the quiz is posted to it as a lesson.
create or replace function lesson_open(p_code text, p_class_id uuid)
returns quizzes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz quizzes%rowtype;
begin
  if auth.uid() is null then raise exception 'Log in to take a lesson.'; end if;

  select * into v_quiz from quizzes where code = upper(trim(p_code));
  if not found then raise exception 'No quiz with that code.'; end if;
  if not exists (select 1 from class_members where class_id = p_class_id and student_id = auth.uid()) then
    raise exception 'You''re not in that class.';
  end if;
  if not exists (select 1 from quiz_classes where quiz_id = v_quiz.id and class_id = p_class_id and mode = 'lesson') then
    raise exception 'This lesson isn''t posted to that class.';
  end if;
  return v_quiz;
end;
$$;

-- The student's progress row, created if missing, locked for the rest of the
-- transaction (so two requests cannot both spend the same watch time), and
-- brought in line with the deck's current video: if the video was made again
-- since the credit was earned, the credit falls back to the start of the slide
-- after the last answered checkpoint (0 if none). "Last answered" is the end
-- of the run of answered checkpoints from the first in order, so a regenerated
-- video that reorders the checkpoints never credits past an unanswered one.
-- Every lesson RPC calls this first, so the reset cannot be skipped by
-- answering before watching. (A refused call rolls the reset back with it; the
-- next call does it again, which is idempotent.)
create or replace function lesson_sync_progress(p_quiz_id uuid, p_class_id uuid, p_student_id uuid)
returns lesson_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz_presentation uuid;
  v_video jsonb;
  v_gen text;
  v_prog lesson_progress%rowtype;
  v_first_unanswered int;
  v_last_ord int;
  v_t_last numeric;
  v_resume numeric := 0;
begin
  select z.presentation_id into v_quiz_presentation from quizzes z where z.id = p_quiz_id;
  select p.video into v_video from presentations p where p.id = v_quiz_presentation;
  v_gen := v_video->>'generatedAt';

  insert into lesson_progress (quiz_id, class_id, student_id, video_generated_at)
  values (p_quiz_id, p_class_id, p_student_id, v_gen)
  on conflict (quiz_id, class_id, student_id) do nothing;

  select * into v_prog
    from lesson_progress
   where quiz_id = p_quiz_id and class_id = p_class_id and student_id = p_student_id
     for update;

  if v_prog.video_generated_at is distinct from v_gen then
    select min(s.ord) into v_first_unanswered
      from lesson_stops(p_quiz_id) s
     where not exists (
       select 1 from lesson_answers a
        where a.quiz_id = p_quiz_id and a.class_id = p_class_id
          and a.student_id = p_student_id and a.question_id = s.question_id);

    v_last_ord := coalesce(v_first_unanswered - 1, (select max(s.ord) from lesson_stops(p_quiz_id) s));

    if v_last_ord > 0 then
      select s.stop_seconds into v_t_last from lesson_stops(p_quiz_id) s where s.ord = v_last_ord;
      select min(sl.start_s) into v_resume from lesson_slides(v_video) sl where sl.start_s >= v_t_last;
      v_resume := coalesce(v_resume, v_t_last);
    end if;

    update lesson_progress
       set watched_until = v_resume, video_generated_at = v_gen
     where quiz_id = p_quiz_id and class_id = p_class_id and student_id = p_student_id
    returning * into v_prog;
  end if;

  return v_prog;
end;
$$;

-- ─── get_lesson_for_taking ──────────────────────────────────────────────────

create or replace function get_lesson_for_taking(p_code text, p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_quiz quizzes%rowtype;
  v_prog lesson_progress%rowtype;
  v_video jsonb;
  v_class_name text;
  v_questions jsonb;
  v_answers jsonb;
  v_boxes jsonb;
  v_score numeric;
begin
  v_quiz := lesson_open(p_code, p_class_id);
  v_prog := lesson_sync_progress(v_quiz.id, p_class_id, v_uid);

  select p.video into v_video from presentations p where p.id = v_quiz.presentation_id;
  select c.name into v_class_name from classes c where c.id = p_class_id;

  -- Deliberately no `answer` column here.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', qq.id,
             'order_index', qq.order_index,
             'section_index', qq.section_index,
             'question_type', qq.question_type,
             'card_id', qq.card_id,
             'slide_number', qq.slide_number,
             'prompt', qq.prompt,
             'choices', qq.choices
           ) order by qq.order_index), '[]'::jsonb)
    into v_questions
    from quiz_questions qq
   where qq.quiz_id = v_quiz.id;

  v_boxes := quiz_word_boxes(v_quiz);

  -- Which questions were answered and whether each was right; never the key.
  select coalesce(jsonb_agg(
           jsonb_build_object('question_id', a.question_id, 'correct', a.correct)
           order by a.answered_at, a.question_id), '[]'::jsonb)
    into v_answers
    from lesson_answers a
   where a.quiz_id = v_quiz.id and a.class_id = p_class_id and a.student_id = v_uid;

  select a.score into v_score
    from quiz_attempts a
   where a.quiz_id = v_quiz.id and a.class_id = p_class_id and a.student_id = v_uid;

  return jsonb_build_object(
    'id', v_quiz.id,
    'title', v_quiz.title,
    'quiz_type', v_quiz.quiz_type,
    'settings', v_quiz.settings,
    'class_name', v_class_name,
    'questions', v_questions,
    'word_boxes', v_boxes,
    'video', v_video,
    'answers', v_answers,
    'watched_until', v_prog.watched_until,
    'score', v_score
  );
end;
$$;

-- ─── lesson_watch ───────────────────────────────────────────────────────────

-- The player reports its position about every 5 seconds. The server credits
-- watching only as fast as real time allows:
--
--   from    = max(heartbeat clock, now - 15 s)
--   allowed = whole seconds from `from` to now, + 2
--   new     = max(old, min(position, old + allowed, next unanswered stop or the
--                          video's end))
--
-- The +2 is slack for timer jitter. It must not be free on every call, or a
-- client calling this in a loop would gain 2 seconds a call, so the heartbeat
-- clock is not "when the last beat arrived" but is spent by what was credited:
-- it moves forward from `from` by exactly the seconds advanced. After a full
-- spend it sits about 2 seconds ahead of now, so an immediate second call is
-- allowed nothing. Time the student has not used (idle, paused, answering a
-- question) is banked only up to the last 15 seconds, because `from` is never
-- earlier than now - 15 s: however long the pause, the next calls together
-- credit at most 17 seconds, never the whole pause. Whole seconds only, so a
-- call right after the last one is allowed exactly the slack.
create or replace function lesson_watch(p_code text, p_class_id uuid, p_position numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_quiz quizzes%rowtype;
  v_prog lesson_progress%rowtype;
  v_video jsonb;
  v_cap numeric;
  v_now timestamptz;
  v_from timestamptz;
  v_allowed numeric;
  v_new numeric;
begin
  v_quiz := lesson_open(p_code, p_class_id);
  v_prog := lesson_sync_progress(v_quiz.id, p_class_id, v_uid);

  select p.video into v_video from presentations p where p.id = v_quiz.presentation_id;
  if not lesson_has_slides(v_video) then
    -- Nothing to pace (the video is gone or never had timings): no limit to enforce.
    return jsonb_build_object('watched_until', v_prog.watched_until);
  end if;

  select s.stop_seconds into v_cap
    from lesson_stops(v_quiz.id) s
   where not exists (
     select 1 from lesson_answers a
      where a.quiz_id = v_quiz.id and a.class_id = p_class_id
        and a.student_id = v_uid and a.question_id = s.question_id)
   order by s.ord
   limit 1;
  if v_cap is null then
    select sl.start_s + sl.dur_s into v_cap from lesson_slides(v_video) sl order by sl.idx desc limit 1;
  end if;

  v_now := clock_timestamp();
  v_from := greatest(v_prog.last_beat_at, v_now - interval '15 seconds');
  v_allowed := greatest(floor(extract(epoch from (v_now - v_from)))::numeric + 2, 0);
  v_new := greatest(
    v_prog.watched_until,
    least(coalesce(p_position, 0), v_prog.watched_until + v_allowed, v_cap));

  update lesson_progress
     set watched_until = v_new,
         last_beat_at = v_from + make_interval(secs => (v_new - v_prog.watched_until)::double precision)
   where quiz_id = v_quiz.id and class_id = p_class_id and student_id = v_uid;

  return jsonb_build_object('watched_until', v_new);
end;
$$;

-- ─── answer_lesson_checkpoint ───────────────────────────────────────────────

create or replace function answer_lesson_checkpoint(p_code text, p_class_id uuid, p_question_id uuid, p_answer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_quiz quizzes%rowtype;
  v_prog lesson_progress%rowtype;
  v_video jsonb;
  v_type text;
  v_key jsonb;
  v_stored boolean;
  v_first uuid;
  v_stop numeric;
  v_ok boolean;
  v_total int;
  v_answered int;
  v_correct int;
begin
  v_quiz := lesson_open(p_code, p_class_id);

  if exists (
    select 1 from quiz_attempts
     where quiz_id = v_quiz.id and class_id = p_class_id and student_id = v_uid
  ) then
    raise exception 'You''ve already submitted this quiz for this class.';
  end if;

  select qq.question_type, qq.answer into v_type, v_key
    from quiz_questions qq
   where qq.id = p_question_id and qq.quiz_id = v_quiz.id;
  if not found then raise exception 'That question isn''t in this lesson.'; end if;

  v_prog := lesson_sync_progress(v_quiz.id, p_class_id, v_uid);

  -- Answered already: the stored result, nothing changes.
  select a.correct into v_stored
    from lesson_answers a
   where a.quiz_id = v_quiz.id and a.class_id = p_class_id
     and a.student_id = v_uid and a.question_id = p_question_id;
  if found then
    return jsonb_build_object('correct', v_stored, 'finished', false, 'score', null::numeric);
  end if;

  -- In order: only the first unanswered checkpoint can be answered.
  select s.question_id, s.stop_seconds into v_first, v_stop
    from lesson_stops(v_quiz.id) s
   where not exists (
     select 1 from lesson_answers a
      where a.quiz_id = v_quiz.id and a.class_id = p_class_id
        and a.student_id = v_uid and a.question_id = s.question_id)
   order by s.ord
   limit 1;
  if v_first is distinct from p_question_id then
    raise exception 'Answer the questions in order.';
  end if;

  -- Watched up to it (1 second of tolerance). With no video timings there is
  -- nothing to have watched.
  select p.video into v_video from presentations p where p.id = v_quiz.presentation_id;
  if lesson_has_slides(v_video) and v_prog.watched_until < v_stop - 1 then
    raise exception 'Watch up to this question first.';
  end if;

  v_ok := quiz_answer_correct(v_type, v_key, p_answer);
  insert into lesson_answers (quiz_id, class_id, student_id, question_id, correct)
  values (v_quiz.id, p_class_id, v_uid, p_question_id, v_ok);

  select count(*) into v_total from quiz_questions qq where qq.quiz_id = v_quiz.id;
  select count(*), count(*) filter (where a.correct) into v_answered, v_correct
    from lesson_answers a
   where a.quiz_id = v_quiz.id and a.class_id = p_class_id and a.student_id = v_uid;

  if v_answered < v_total then
    return jsonb_build_object('correct', v_ok, 'finished', false, 'score', null::numeric);
  end if;

  -- The last answer: the lesson becomes an ordinary attempt.
  begin
    insert into quiz_attempts (quiz_id, class_id, student_id, score)
    values (v_quiz.id, p_class_id, v_uid, v_correct::numeric / v_total);
  exception when unique_violation then
    raise exception 'You''ve already submitted this quiz for this class.';
  end;

  return jsonb_build_object('correct', v_ok, 'finished', true, 'score', v_correct::numeric / v_total);
end;
$$;

-- ─── posting rules ──────────────────────────────────────────────────────────

-- A lesson needs a narrated video with timings, and a class never mixes the
-- two ways of taking the same quiz (attempts without progress are quiz
-- attempts; progress rows are lessons that were started).
create or replace function quiz_classes_check_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mode = 'lesson' then
    if not lesson_has_slides((
      select p.video
        from quizzes z
        join presentations p on p.id = z.presentation_id
       where z.id = new.quiz_id
    )) then
      raise exception 'Make the narrated video first.';
    end if;
    if exists (
      select 1 from quiz_attempts a
       where a.quiz_id = new.quiz_id and a.class_id = new.class_id
         and not exists (
           select 1 from lesson_progress p
            where p.quiz_id = a.quiz_id and p.class_id = a.class_id and p.student_id = a.student_id)
    ) then
      raise exception 'Students already took this as a quiz in that class.';
    end if;
  elsif exists (
    select 1 from lesson_progress p where p.quiz_id = new.quiz_id and p.class_id = new.class_id
  ) then
    raise exception 'Students already started this as a lesson in that class.';
  end if;
  return new;
end;
$$;

drop trigger if exists quiz_classes_check_mode on quiz_classes;
create trigger quiz_classes_check_mode
  before insert on quiz_classes
  for each row execute function quiz_classes_check_mode();

-- ─── watching the video ─────────────────────────────────────────────────────

-- Storage object names are "<owner id>/<presentation id>.<ext>" (0015). A
-- student may read one when a quiz of that deck is posted as a lesson to a
-- class they are in. The id is matched with a uuid-shaped pattern before it is
-- cast, so no object name can make the policy error.
create or replace function can_watch_deck_video(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m text[];
begin
  m := regexp_match(
    p_name,
    '^([^/]+)/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]+$',
    'i');
  if m is null then return false; end if;

  return exists (
    select 1
      from presentations pr
      join quizzes z on z.presentation_id = pr.id
      join quiz_classes qc on qc.quiz_id = z.id and qc.mode = 'lesson'
      join class_members cm on cm.class_id = qc.class_id and cm.student_id = auth.uid()
     where pr.id = m[2]::uuid
       and pr.owner_id::text = lower(m[1])
  );
end;
$$;

drop policy if exists deck_videos_lesson_select on storage.objects;
create policy deck_videos_lesson_select on storage.objects
  for select to authenticated
  using (bucket_id = 'deck-videos' and can_watch_deck_video(name));

-- ─── grants ─────────────────────────────────────────────────────────────────

revoke execute on function quiz_answer_correct(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function quiz_word_boxes(quizzes) from public, anon, authenticated;
revoke execute on function lesson_slides(jsonb) from public, anon, authenticated;
revoke execute on function lesson_has_slides(jsonb) from public, anon, authenticated;
revoke execute on function lesson_stops(uuid) from public, anon, authenticated;
revoke execute on function lesson_open(text, uuid) from public, anon, authenticated;
revoke execute on function lesson_sync_progress(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function quiz_classes_check_mode() from public, anon, authenticated;

revoke execute on function submit_quiz_attempt(text, uuid, jsonb) from public, anon;
grant execute on function submit_quiz_attempt(text, uuid, jsonb) to authenticated;
revoke execute on function get_quiz_for_taking(text) from public, anon;
grant execute on function get_quiz_for_taking(text) to authenticated;
revoke execute on function get_lesson_for_taking(text, uuid) from public, anon;
grant execute on function get_lesson_for_taking(text, uuid) to authenticated;
revoke execute on function lesson_watch(text, uuid, numeric) from public, anon;
grant execute on function lesson_watch(text, uuid, numeric) to authenticated;
revoke execute on function answer_lesson_checkpoint(text, uuid, uuid, jsonb) from public, anon;
grant execute on function answer_lesson_checkpoint(text, uuid, uuid, jsonb) to authenticated;
revoke execute on function can_watch_deck_video(text) from public, anon;
grant execute on function can_watch_deck_video(text) to authenticated;
