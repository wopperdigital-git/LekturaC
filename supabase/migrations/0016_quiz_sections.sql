-- 0016_quiz_sections.sql
-- A quiz is made of 1–3 tests ("sections"), each with its own type, title and
-- instructions. Builds on 0012 (never edited).
--
--   * quiz_questions gain section_index and question_type; existing rows are
--     backfilled from their quiz (one test, the quiz's type).
--   * quizzes.quiz_type may now be 'mixed' (a summary for lists).
--   * quizzes.settings for new quizzes is {"sections":[{title, instructions,
--     type, ...type settings}]}. Quizzes saved before 0016 keep their old
--     settings and are read as one test by the client.
--   * create_quiz now takes the tests (p_sections) and replaces the 0012
--     six-argument version, which is dropped.
--   * get_quiz_for_taking returns each question's section and type and a word
--     box per fill-in-the-blank test (word_boxes); submit_quiz_attempt scores
--     each question by its own type.
--
-- supabase/tests/0012_quiz_rls.sql checks the pre-0016 shape (old create_quiz,
-- word_box); after 0016 run supabase/tests/0016_quiz_sections.sql instead.

-- ─── columns ────────────────────────────────────────────────────────────────

alter table quiz_questions add column if not exists section_index integer not null default 0;
alter table quiz_questions add column if not exists question_type text;

update quiz_questions qq
   set question_type = q.quiz_type
  from quizzes q
 where q.id = qq.quiz_id
   and qq.question_type is null;

-- A question written without a type (an owner's direct insert, or any insert
-- shaped like 0012's) takes its quiz's type when that is a single type.
create or replace function quiz_question_default_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.question_type is null then
    select nullif(q.quiz_type, 'mixed') into new.question_type from quizzes q where q.id = new.quiz_id;
  end if;
  return new;
end;
$$;

drop trigger if exists quiz_questions_default_type on quiz_questions;
create trigger quiz_questions_default_type
  before insert on quiz_questions
  for each row execute function quiz_question_default_type();

alter table quiz_questions alter column question_type set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quiz_questions_section_index_check') then
    alter table quiz_questions
      add constraint quiz_questions_section_index_check check (section_index between 0 and 2);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quiz_questions_question_type_check') then
    alter table quiz_questions
      add constraint quiz_questions_question_type_check
      check (question_type in ('multiple_choice', 'fill_blank', 'true_false'));
  end if;
end $$;

-- quizzes.quiz_type: 0012 added an unnamed column check; drop whatever check
-- mentions quiz_type and add a named one that also allows 'mixed'.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'quizzes'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%quiz_type%'
  loop
    execute format('alter table quizzes drop constraint %I', c.conname);
  end loop;
end $$;

alter table quizzes add constraint quizzes_quiz_type_check
  check (quiz_type in ('multiple_choice', 'fill_blank', 'true_false', 'mixed'));

-- ─── create_quiz ────────────────────────────────────────────────────────────

drop function if exists create_quiz(uuid, text, text, text, jsonb, jsonb);

create or replace function create_quiz(
  p_presentation_id uuid,
  p_title text,
  p_deck_title text,
  p_sections jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  n_sections integer;
  s jsonb;
  s_type text;
  s_title text;
  s_instructions text;
  n integer;
  q jsonb;
  types text[] := '{}';
  stored jsonb := '[]'::jsonb;
  summary text;
  new_id uuid := gen_random_uuid();
  new_code text := generate_quiz_code();
begin
  if auth.uid() is null then raise exception 'Log in to create a quiz.'; end if;
  if trim(coalesce(p_title, '')) = '' then raise exception 'A quiz needs a title.'; end if;
  if jsonb_typeof(p_sections) is distinct from 'array' then raise exception 'Tests must be a list.'; end if;
  n_sections := jsonb_array_length(p_sections);
  if n_sections < 1 or n_sections > 3 then raise exception 'A quiz has between 1 and 3 tests.'; end if;
  -- Under invoker rights, presentations' owner-only RLS decides visibility.
  if not exists (select 1 from presentations where id = p_presentation_id) then
    raise exception 'That deck isn''t available.';
  end if;

  for i in 0 .. n_sections - 1 loop
    s := p_sections -> i;
    if jsonb_typeof(s) is distinct from 'object' then raise exception 'Each test must be an object.'; end if;
    s_type := s->>'type';
    if s_type is null or s_type not in ('multiple_choice', 'fill_blank', 'true_false') then
      raise exception 'Unknown quiz type.';
    end if;
    s_title := trim(coalesce(s->>'title', ''));
    if s_title = '' then raise exception 'Every test needs a title.'; end if;
    if length(s_title) > 80 then raise exception 'A test title is at most 80 characters.'; end if;
    s_instructions := trim(coalesce(s->>'instructions', ''));
    if length(s_instructions) > 300 then raise exception 'Test instructions are at most 300 characters.'; end if;
    if jsonb_exists(s, 'settings') and jsonb_typeof(s->'settings') is distinct from 'object' then
      raise exception 'Test settings must be an object.';
    end if;
    if jsonb_typeof(s->'questions') is distinct from 'array' then raise exception 'Questions must be a list.'; end if;
    n := jsonb_array_length(s->'questions');
    if n < 1 or n > 20 then raise exception 'Each test has between 1 and 20 questions.'; end if;

    for q in select value from jsonb_array_elements(s->'questions') loop
      perform assert_quiz_question(s_type, q);
    end loop;

    types := array_append(types, s_type);
    -- settings first, so a client-supplied "title"/"type" inside settings cannot override the checked ones.
    stored := stored || jsonb_build_array(
      coalesce(s->'settings', '{}'::jsonb)
      || jsonb_build_object('title', s_title, 'instructions', s_instructions, 'type', s_type)
    );
  end loop;

  summary := case when (select count(distinct t) from unnest(types) as t) = 1 then types[1] else 'mixed' end;

  -- id and code are chosen up front and there is deliberately NO `returning`
  -- (see create_quiz in 0012: RETURNING re-checks the SELECT policy, which
  -- cannot see the row yet, and the insert would be refused).
  insert into quizzes (id, presentation_id, title, deck_title, quiz_type, settings, code)
  values (
    new_id,
    p_presentation_id,
    trim(p_title),
    coalesce(nullif(trim(p_deck_title), ''), trim(p_title)),
    summary,
    jsonb_build_object('sections', stored),
    new_code
  );

  insert into quiz_questions
    (quiz_id, order_index, section_index, question_type, card_id, slide_number, slide_heading, prompt, choices, answer)
  select
    new_id,
    (row_number() over (order by sec.ord, qs.ord) - 1)::int,
    (sec.ord - 1)::int,
    sec.elem->>'type',
    nullif(qs.elem->>'card_id', '')::uuid,
    (qs.elem->>'slide_number')::int,
    coalesce(qs.elem->>'slide_heading', ''),
    trim(qs.elem->>'prompt'),
    case when sec.elem->>'type' = 'multiple_choice' then coalesce(qs.elem->'choices', '[]'::jsonb) else '[]'::jsonb end,
    qs.elem->'answer'
  from jsonb_array_elements(p_sections) with ordinality as sec(elem, ord)
  cross join lateral jsonb_array_elements(sec.elem->'questions') with ordinality as qs(elem, ord);

  return jsonb_build_object('id', new_id, 'code', new_code);
end;
$$;

-- ─── get_quiz_for_taking ────────────────────────────────────────────────────

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
  boxes jsonb := '{}'::jsonb;
  sec record;
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

  -- A word box per fill-in-the-blank test that asked for one: that test's
  -- answers, shuffled stably. JSON comparison, never a cast (settings is
  -- client-supplied and must not be able to break taking).
  if jsonb_typeof(quiz.settings->'sections') = 'array' then
    for sec in
      select (t.ord - 1)::int as idx, t.elem
        from jsonb_array_elements(quiz.settings->'sections') with ordinality as t(elem, ord)
    loop
      if sec.elem->>'type' = 'fill_blank' and coalesce(sec.elem->'wordBox' = 'true'::jsonb, false) then
        boxes := boxes || jsonb_build_object(sec.idx::text, (
          select coalesce(jsonb_agg(w.word order by md5(w.word || quiz.id::text)), '[]'::jsonb)
            from (select distinct (qq.answer->>'text') as word
                    from quiz_questions qq
                   where qq.quiz_id = quiz.id
                     and qq.section_index = sec.idx
                     and qq.question_type = 'fill_blank') w));
      end if;
    end loop;
  elsif quiz.quiz_type = 'fill_blank' and coalesce(quiz.settings->'wordBox' = 'true'::jsonb, false) then
    boxes := jsonb_build_object('0', (
      select coalesce(jsonb_agg(w.word order by md5(w.word || quiz.id::text)), '[]'::jsonb)
        from (select distinct (qq.answer->>'text') as word from quiz_questions qq where qq.quiz_id = quiz.id) w));
  end if;

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

-- ─── submit_quiz_attempt ────────────────────────────────────────────────────

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
  norm text;
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
    ok := false;

    if given is not null and jsonb_typeof(given) <> 'null' then
      if rec.question_type = 'multiple_choice' then
        ok := jsonb_typeof(given) = 'number' and given = rec.answer;
      elsif rec.question_type = 'true_false' then
        ok := jsonb_typeof(given) = 'boolean' and given = rec.answer;
      elsif rec.question_type = 'fill_blank' then
        if jsonb_typeof(given) = 'string' then
          norm := normalize_answer(given #>> '{}');
          ok := norm <> '' and (
            norm = normalize_answer(rec.answer->>'text')
            or exists (
              select 1 from jsonb_array_elements_text(coalesce(rec.answer->'accepted', '[]'::jsonb)) a
              where normalize_answer(a) = norm)
          );
        end if;
      end if;
    end if;

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

-- ─── grants ─────────────────────────────────────────────────────────────────

revoke execute on function quiz_question_default_type() from public, anon, authenticated;
revoke execute on function create_quiz(uuid, text, text, jsonb) from public, anon;
grant execute on function create_quiz(uuid, text, text, jsonb) to authenticated;
revoke execute on function get_quiz_for_taking(text) from public, anon;
grant execute on function get_quiz_for_taking(text) to authenticated;
revoke execute on function submit_quiz_attempt(text, uuid, jsonb) from public, anon;
grant execute on function submit_quiz_attempt(text, uuid, jsonb) to authenticated;
