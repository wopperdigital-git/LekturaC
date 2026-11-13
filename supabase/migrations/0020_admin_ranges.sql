-- Admin statistics with a time range and a previous-period comparison.
--
-- Replaces 0019's `admin_overview()` with `admin_overview(p_range)`:
--   '7d'  last 7 days, by day      '30d' last 30 days, by day
--   '12w' last 12 weeks, by week   '12m' last 12 months, by month
-- The window runs from the start of the oldest bucket to now (so the newest
-- bucket is partial); the previous window is the same length right before it,
-- which is what every "vs previous" number compares against. Buckets are in
-- the database's time zone (UTC on Supabase).
--
-- Same rules as 0019: admins only (`is_admin()`), counts and categories only,
-- never a row, name, email, title or anything a user typed.
--
-- "Active" is approximate: it counts the moments the database keeps (a deck
-- created, a deck's *last* edit, a quiz made, a quiz submitted, a lesson
-- question answered). An account that edited an old deck twice in a range
-- shows once, at its latest edit.
--
-- Requires 0019. Does not gate anything else.

drop function if exists admin_overview();

-- A malformed timestamp in client-written jsonb (presentations.video) must not
-- break the whole read.
create or replace function admin_try_timestamp(p text)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
begin
  return p::timestamptz;
exception when others then
  return null;
end;
$$;

revoke execute on function admin_try_timestamp(text) from public, anon, authenticated;

create or replace function admin_overview(p_range text default '12w')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  unit text;
  n_buckets int;
  step interval;
  w_start timestamptz;
  w_end timestamptz := now();
  p_start timestamptz;
  result jsonb;
begin
  if not is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  case p_range
    when '7d' then unit := 'day'; n_buckets := 7; step := interval '1 day';
    when '30d' then unit := 'day'; n_buckets := 30; step := interval '1 day';
    when '12w' then unit := 'week'; n_buckets := 12; step := interval '1 week';
    when '12m' then unit := 'month'; n_buckets := 12; step := interval '1 month';
    else raise exception 'Unknown range.' using errcode = '22023';
  end case;

  w_start := date_trunc(unit, now()) - step * (n_buckets - 1);
  p_start := w_start - (w_end - w_start);

  with
  buckets as (
    select generate_series(w_start, date_trunc(unit, now()), step) as b
  ),
  -- Every moment an account did something the database remembers.
  act as (
    select owner_id as user_id, created_at as at from presentations
    union all select owner_id, updated_at from presentations
    union all select teacher_id, created_at from quizzes
    union all select student_id, submitted_at from quiz_attempts
    union all select student_id, answered_at from lesson_answers where answered_at is not null
  ),
  decks as (
    select
      created_at as at,
      case
        when not (generation ? 'version') then 'manual'
        when generation ->> 'research' in ('ok', 'failed', 'skipped') then generation ->> 'research'
        else 'unknown'
      end as kind
    from presentations
  ),
  ai as (
    select created_at as at, generation as g from presentations where generation ? 'version'
  ),
  claim_rows as (
    select a.at, c.claim, a.g ->> 'research' as research
    from ai a
    cross join lateral jsonb_each(
      case when jsonb_typeof(a.g -> 'claims') = 'object' then a.g -> 'claims' else '{}'::jsonb end
    ) as per(card_id, list)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(per.list) = 'array' then per.list else '[]'::jsonb end
    ) as c(claim)
  ),
  unsourced as (
    select at from claim_rows
    where (claim ->> 'verified') is distinct from 'true'
      and coalesce(claim ->> 'type', '') <> 'opinion'
      and research is distinct from 'skipped'
  ),
  flag_rows as (
    select f.flag
    from ai a
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(a.g -> 'flags') = 'array' then a.g -> 'flags' else '[]'::jsonb end
    ) as f(flag)
    where a.at >= w_start
  ),
  deck_sizes as (
    select p.id, count(c.id) as slides
    from presentations p
    left join cards c on c.presentation_id = p.id
    where p.created_at >= w_start
    group by p.id
  ),
  videos as (
    select admin_try_timestamp(video ->> 'generatedAt') as at from presentations where video is not null
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object('key', p_range, 'unit', unit, 'start', w_start, 'previousStart', p_start),

    'series', (select jsonb_agg(jsonb_build_object(
      'start', to_char(bk.b, 'YYYY-MM-DD'),
      'signupsGeneral', (select count(*) from profiles where role = 'general' and date_trunc(unit, created_at) = bk.b),
      'signupsTeacher', (select count(*) from profiles where role = 'teacher' and date_trunc(unit, created_at) = bk.b),
      'signupsStudent', (select count(*) from profiles where role = 'student' and date_trunc(unit, created_at) = bk.b),
      'active', (select count(distinct user_id) from act where date_trunc(unit, at) = bk.b),
      'decksManual', (select count(*) from decks where kind = 'manual' and date_trunc(unit, at) = bk.b),
      'decksResearchOk', (select count(*) from decks where kind = 'ok' and date_trunc(unit, at) = bk.b),
      'decksResearchFailed', (select count(*) from decks where kind = 'failed' and date_trunc(unit, at) = bk.b),
      'decksResearchSkipped', (select count(*) from decks where kind in ('skipped', 'unknown') and date_trunc(unit, at) = bk.b),
      'videos', (select count(*) from videos where date_trunc(unit, at) = bk.b),
      'quizzes', (select count(*) from quizzes where date_trunc(unit, created_at) = bk.b),
      'attempts', (select count(*) from quiz_attempts where date_trunc(unit, submitted_at) = bk.b)
    ) order by bk.b) from buckets bk),

    'compare', jsonb_build_object(
      'signups', jsonb_build_object(
        'current', (select count(*) from profiles where created_at >= w_start),
        'previous', (select count(*) from profiles where created_at >= p_start and created_at < w_start)),
      'active', jsonb_build_object(
        'current', (select count(distinct user_id) from act where at >= w_start),
        'previous', (select count(distinct user_id) from act where at >= p_start and at < w_start)),
      'decks', jsonb_build_object(
        'current', (select count(*) from decks where at >= w_start),
        'previous', (select count(*) from decks where at >= p_start and at < w_start)),
      'aiDecks', jsonb_build_object(
        'current', (select count(*) from ai where at >= w_start),
        'previous', (select count(*) from ai where at >= p_start and at < w_start)),
      'researchFailed', jsonb_build_object(
        'current', (select count(*) from decks where kind = 'failed' and at >= w_start),
        'previous', (select count(*) from decks where kind = 'failed' and at >= p_start and at < w_start)),
      'claims', jsonb_build_object(
        'current', (select count(*) from claim_rows where at >= w_start),
        'previous', (select count(*) from claim_rows where at >= p_start and at < w_start)),
      'unsourcedClaims', jsonb_build_object(
        'current', (select count(*) from unsourced where at >= w_start),
        'previous', (select count(*) from unsourced where at >= p_start and at < w_start)),
      'videos', jsonb_build_object(
        'current', (select count(*) from videos where at >= w_start),
        'previous', (select count(*) from videos where at >= p_start and at < w_start)),
      'quizzes', jsonb_build_object(
        'current', (select count(*) from quizzes where created_at >= w_start),
        'previous', (select count(*) from quizzes where created_at >= p_start and created_at < w_start)),
      'attempts', jsonb_build_object(
        'current', (select count(*) from quiz_attempts where submitted_at >= w_start),
        'previous', (select count(*) from quiz_attempts where submitted_at >= p_start and submitted_at < w_start)),
      'averageScore', jsonb_build_object(
        'current', (select round(avg(score)::numeric, 3) from quiz_attempts where submitted_at >= w_start),
        'previous', (select round(avg(score)::numeric, 3) from quiz_attempts where submitted_at >= p_start and submitted_at < w_start)),
      'classes', jsonb_build_object(
        'current', (select count(*) from classes where created_at >= w_start),
        'previous', (select count(*) from classes where created_at >= p_start and created_at < w_start)),
      'clonedVoices', jsonb_build_object(
        'current', (select count(*) from cloned_voices where created_at >= w_start),
        'previous', (select count(*) from cloned_voices where created_at >= p_start and created_at < w_start))
    ),

    -- All time, whatever the range.
    'totals', jsonb_build_object(
      'accounts', (select count(*) from profiles),
      'byRole', coalesce((select jsonb_object_agg(role, n) from (
        select role, count(*) as n from profiles group by role) s), '{}'::jsonb),
      'decks', (select count(*) from presentations),
      'averageSlides', (select coalesce(round(avg(slides)::numeric, 1), 0) from (
        select count(cd.id) as slides from presentations p left join cards cd on cd.presentation_id = p.id group by p.id) s),
      'videos', (select count(*) from presentations where video is not null),
      'quizzes', (select count(*) from quizzes),
      'classes', (select count(*) from classes),
      'studentsEnrolled', (select count(distinct student_id) from class_members),
      'attempts', (select count(*) from quiz_attempts),
      'clonedVoices', (select count(*) from cloned_voices),
      'savedVoiceSettings', (select count(*) from voice_settings)
    ),

    'funnel', jsonb_build_object(
      'signedUp', (select count(*) from profiles),
      'madeDeck', (select count(distinct owner_id) from presentations),
      'madeVideoOrQuiz', (select count(*) from (
        select owner_id as user_id from presentations where video is not null
        union
        select teacher_id from quizzes
      ) s),
      'postedToClass', (select count(distinct q.teacher_id) from quiz_classes qc join quizzes q on q.id = qc.quiz_id)
    ),

    -- Within the range.
    'breakdowns', jsonb_build_object(
      'research', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(g ->> 'research', 'unknown') as k, count(*) as n from ai where at >= w_start group by 1) s), '{}'::jsonb),
      'presentationType', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(g -> 'brief' ->> 'presentationType', 'unknown') as k, count(*) as n from ai where at >= w_start group by 1) s), '{}'::jsonb),
      'audienceLevel', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(g -> 'brief' ->> 'audienceKnowledgeLevel', 'unknown') as k, count(*) as n from ai where at >= w_start group by 1) s), '{}'::jsonb),
      'flags', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(flag ->> 'type', 'unknown') as k, count(*) as n from flag_rows group by 1) s), '{}'::jsonb),
      'flagSeverity', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(flag ->> 'severity', 'unknown') as k, count(*) as n from flag_rows group by 1) s), '{}'::jsonb),
      'slideCounts', coalesce((select jsonb_object_agg(bucket, n) from (
        select case when slides >= 8 then '8+' else slides::text end as bucket, count(*) as n from deck_sizes group by 1) s), '{}'::jsonb),
      'quizTypes', coalesce((select jsonb_object_agg(quiz_type, n) from (
        select quiz_type, count(*) as n from quizzes where created_at >= w_start group by quiz_type) s), '{}'::jsonb),
      'postings', jsonb_build_object(
        'quiz', (select count(*) from quiz_classes where mode = 'quiz' and posted_at >= w_start),
        'lesson', (select count(*) from quiz_classes where mode = 'lesson' and posted_at >= w_start)),
      'reviewedClaims', (select coalesce(sum(jsonb_array_length(g -> 'reviewed')), 0) from ai
        where at >= w_start and jsonb_typeof(g -> 'reviewed') = 'array')
    )
  )
  into result;

  return result;
end;
$$;

revoke execute on function admin_overview(text) from public, anon;
grant execute on function admin_overview(text) to authenticated;
