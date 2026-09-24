-- 0012_quizzes.sql
-- Quiz generation, sharing and taking. Builds on 0009's quiz tables.
--
--   * quizzes gain a share code, a type and its presentation settings.
--   * create_quiz saves a quiz and its questions atomically (security INVOKER,
--     so RLS still decides who may save it).
--   * get_quiz_for_taking / submit_quiz_attempt are the ONLY way a student
--     touches a quiz. quiz_questions stays owner-only: answers never leave the
--     database except to the deck's owner, and scoring happens here.
-- No RLS policy selects from another RLS table; cross-table checks live in
-- security definer functions (the 0009 rule).

-- ─── share codes ────────────────────────────────────────────────────────────

-- 8 characters from the same alphabet as generate_join_code() (no 0/O/1/I/L).
-- Keep in step with src/quiz/quizCode.ts.
create or replace function generate_quiz_code()
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
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from quizzes where code = candidate);
  end loop;
  return candidate;
end;
$$;

alter table quizzes add column if not exists quiz_type text not null default 'multiple_choice'
  check (quiz_type in ('multiple_choice', 'fill_blank', 'true_false'));
alter table quizzes add column if not exists settings jsonb not null default '{}';
alter table quizzes add column if not exists code text;
update quizzes set code = generate_quiz_code() where code is null;
alter table quizzes alter column code set not null;
alter table quizzes alter column code set default generate_quiz_code();
create unique index if not exists quizzes_code_key on quizzes (code);

-- ─── helpers ────────────────────────────────────────────────────────────────

-- Blank answers compare after lower-casing, dropping punctuation and collapsing
-- whitespace, so "The Mitochondria." matches "mitochondria".
-- Only punctuation is removed ([[:punct:]]), never "everything that is not
-- alphanumeric": under an ASCII-only database ctype [:alnum:] would not match a
-- non-Latin letter, so "東京" would normalise to '' and every such blank would
-- score wrong. Note lower() case folding of non-ASCII letters is also
-- locale-dependent.
create or replace function normalize_answer(t text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(t, '')), '[[:punct:]]', '', 'g'), '\s+', ' ', 'g'));
$$;

-- Refuses a question whose shape doesn't match the quiz type on the create_quiz
-- path, so a tampered client cannot use that function to store garbage that
-- would break taking or scoring. It guards create_quiz ONLY: the 0009
-- quiz_questions_owner_all policy lets a deck's owner write their own questions
-- directly, bypassing it (an owner-only effect; no answer is ever exposed).
create or replace function assert_quiz_question(p_type text, q jsonb)
returns void
language plpgsql
immutable
as $$
declare
  n integer;
begin
  -- `is distinct from` throughout: a MISSING field makes jsonb_typeof() NULL, and
  -- `NULL <> 'x'` is NULL, which `if` treats as false — the check would silently
  -- pass. `is distinct from` treats NULL as different, so absence is refused.
  if jsonb_typeof(q) is distinct from 'object' then raise exception 'Each question must be an object.'; end if;
  if trim(coalesce(q->>'prompt', '')) = '' then raise exception 'Every question needs a prompt.'; end if;
  if jsonb_typeof(q->'slide_number') is distinct from 'number' or (q->>'slide_number')::numeric < 1 then
    raise exception 'Every question needs a slide number.';
  end if;

  if p_type = 'multiple_choice' then
    if jsonb_typeof(q->'choices') is distinct from 'array' then raise exception 'A multiple-choice question needs choices.'; end if;
    n := jsonb_array_length(q->'choices');
    if n < 3 or n > 4 then raise exception 'A multiple-choice question has 3 or 4 choices.'; end if;
    if exists (select 1 from jsonb_array_elements(q->'choices') c where jsonb_typeof(c) <> 'string' or trim(c #>> '{}') = '') then
      raise exception 'Choices cannot be blank.';
    end if;
    if jsonb_typeof(q->'answer') is distinct from 'number' then
      raise exception 'The answer must be the index of a choice.';
    end if;
    if (q->>'answer')::numeric < 0 or (q->>'answer')::numeric >= n
       or (q->>'answer')::numeric <> floor((q->>'answer')::numeric) then
      raise exception 'The answer must be the index of a choice.';
    end if;
  elsif p_type = 'fill_blank' then
    if position('___' in q->>'prompt') = 0 then raise exception 'A fill-in-the-blank prompt needs a blank (_____).'; end if;
    if jsonb_typeof(q->'answer') is distinct from 'object' or jsonb_typeof(q->'answer'->'text') is distinct from 'string' then
      raise exception 'A fill-in-the-blank question needs an answer.';
    end if;
    if trim(q->'answer'->>'text') = '' then
      raise exception 'A fill-in-the-blank question needs an answer.';
    end if;
    if jsonb_exists(q->'answer', 'accepted') and jsonb_typeof(q->'answer'->'accepted') is distinct from 'array' then
      raise exception 'Accepted answers must be a list.';
    end if;
  elsif p_type = 'true_false' then
    if jsonb_typeof(q->'answer') is distinct from 'boolean' then raise exception 'A true/false question needs a true or false answer.'; end if;
  else
    raise exception 'Unknown quiz type.';
  end if;
end;
$$;

-- ─── create_quiz ────────────────────────────────────────────────────────────

create or replace function create_quiz(
  p_presentation_id uuid,
  p_title text,
  p_deck_title text,
  p_quiz_type text,
  p_settings jsonb,
  p_questions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
  q jsonb;
  new_id uuid := gen_random_uuid();
  new_code text := generate_quiz_code();
begin
  if auth.uid() is null then raise exception 'Log in to create a quiz.'; end if;
  if trim(coalesce(p_title, '')) = '' then raise exception 'A quiz needs a title.'; end if;
  if jsonb_typeof(p_questions) is distinct from 'array' then raise exception 'Questions must be a list.'; end if;
  n := jsonb_array_length(p_questions);
  if n < 1 or n > 20 then raise exception 'A quiz has between 1 and 20 questions.'; end if;
  -- Under invoker rights, presentations' owner-only RLS decides visibility.
  if not exists (select 1 from presentations where id = p_presentation_id) then
    raise exception 'That deck isn''t available.';
  end if;

  for q in select value from jsonb_array_elements(p_questions) loop
    perform assert_quiz_question(p_quiz_type, q);
  end loop;

  -- id and code are chosen up front and there is deliberately NO `returning`.
  -- `insert … returning` also checks the new row against the SELECT policy
  -- (quizzes_select = can_read_quiz(id)) BEFORE the row exists, and that helper
  -- looks the row up in the table, so it would answer false and the insert would
  -- be refused as an RLS violation. Without `returning` only the INSERT policy
  -- (teacher_id = auth.uid()) applies.
  insert into quizzes (id, presentation_id, title, deck_title, quiz_type, settings, code)
  values (new_id, p_presentation_id, trim(p_title), coalesce(nullif(trim(p_deck_title), ''), trim(p_title)), p_quiz_type, coalesce(p_settings, '{}'), new_code);

  insert into quiz_questions (quiz_id, order_index, card_id, slide_number, slide_heading, prompt, choices, answer)
  select
    new_id,
    (t.ord - 1)::int,
    nullif(t.elem->>'card_id', '')::uuid,
    (t.elem->>'slide_number')::int,
    coalesce(t.elem->>'slide_heading', ''),
    trim(t.elem->>'prompt'),
    case when p_quiz_type = 'multiple_choice' then coalesce(t.elem->'choices', '[]'::jsonb) else '[]'::jsonb end,
    t.elem->'answer'
  from jsonb_array_elements(p_questions) with ordinality as t(elem, ord);

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
  words jsonb := null;
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
             'slide_number', qq.slide_number,
             'prompt', qq.prompt,
             'choices', qq.choices
           ) order by qq.order_index), '[]'::jsonb)
    into question_list
    from quiz_questions qq
    where qq.quiz_id = quiz.id;

  -- The word box is every answer, shuffled stably (same on every load). It
  -- reveals the set of answers but not which blank each one fills.
  -- (Compared as jsonb, not cast: settings is client-supplied, and a garbage
  -- value must not be able to make a cast raise and break taking.)
  if quiz.quiz_type = 'fill_blank' and coalesce(quiz.settings->'wordBox' = 'true'::jsonb, false) then
    select coalesce(jsonb_agg(s.w order by md5(s.w || quiz.id::text)), '[]'::jsonb)
      into words
      from (select distinct (qq.answer->>'text') as w from quiz_questions qq where qq.quiz_id = quiz.id) s;
  end if;

  return jsonb_build_object(
    'id', quiz.id,
    'title', quiz.title,
    'deck_title', quiz.deck_title,
    'quiz_type', quiz.quiz_type,
    'settings', quiz.settings,
    'classes', eligible,
    'questions', question_list,
    'word_box', words
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

  for rec in select qq.id, qq.answer from quiz_questions qq where qq.quiz_id = quiz.id order by qq.order_index loop
    total := total + 1;
    given := p_answers -> (rec.id::text);
    ok := false;

    if given is not null and jsonb_typeof(given) <> 'null' then
      if quiz.quiz_type = 'multiple_choice' then
        ok := jsonb_typeof(given) = 'number' and given = rec.answer;
      elsif quiz.quiz_type = 'true_false' then
        ok := jsonb_typeof(given) = 'boolean' and given = rec.answer;
      elsif quiz.quiz_type = 'fill_blank' then
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
-- generate_quiz_code is the column default and runs as the inserting user, so
-- (like generate_join_code) it keeps its default execute grant.

revoke execute on function normalize_answer(text) from public, anon;
grant execute on function normalize_answer(text) to authenticated;
revoke execute on function assert_quiz_question(text, jsonb) from public, anon;
grant execute on function assert_quiz_question(text, jsonb) to authenticated;
revoke execute on function create_quiz(uuid, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function create_quiz(uuid, text, text, text, jsonb, jsonb) to authenticated;
revoke execute on function get_quiz_for_taking(text) from public, anon;
grant execute on function get_quiz_for_taking(text) to authenticated;
revoke execute on function submit_quiz_attempt(text, uuid, jsonb) from public, anon;
grant execute on function submit_quiz_attempt(text, uuid, jsonb) to authenticated;
