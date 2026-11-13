-- Admin: a developer-only flag and one site-wide statistics function.
--
-- Who is an admin: a row in `admins`. Nothing in the app can write one — there
-- are no insert/update/delete policies and the grants are revoked — so the only
-- way in is the Supabase SQL editor (or the service role):
--
--   insert into admins (user_id, note)
--   select id, 'developer' from auth.users where email = '<your email>';
--
-- Admin is a flag beside the account type, not a fourth type: `profiles.role`
-- stays General/Teacher/Student and pinned (0010).
--
-- What an admin sees: counts and categories only. `admin_overview()` reads
-- every table as its owner and hands back one jsonb of numbers. It never
-- returns a row, a name, an email, a deck title or anything a user typed
-- (`generation.brief.objective`, sources, claim text are all left out).
--
-- Does NOT gate anything else: without it the Admin link never shows and
-- /admin sends you home.
--
-- Requires 0009 (profiles, classroom), 0011 (presentations.generation),
-- 0012/0016 (quiz_type), 0015 (presentations.video), 0017 (cloned_voices),
-- 0018 (quiz_classes.mode).

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

-- An account may see its own row and nothing else: that is how the client asks
-- "am I an admin?" without being able to list who is.
drop policy if exists admins_self_read on admins;
create policy admins_self_read on admins
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on admins from anon, authenticated;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

create or replace function admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  with
  weeks as (
    select generate_series(
      date_trunc('week', now()) - interval '11 weeks',
      date_trunc('week', now()),
      interval '1 week'
    ) as week
  ),
  -- AI-made decks: generation defaults to '{}', so a real record has `version`.
  ai as (
    select generation as g from presentations where generation ? 'version'
  ),
  claim_rows as (
    select c.claim, a.g ->> 'research' as research
    from ai a
    cross join lateral jsonb_each(
      case when jsonb_typeof(a.g -> 'claims') = 'object' then a.g -> 'claims' else '{}'::jsonb end
    ) as per(card_id, list)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(per.list) = 'array' then per.list else '[]'::jsonb end
    ) as c(claim)
  ),
  flag_rows as (
    select f.flag
    from ai a
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(a.g -> 'flags') = 'array' then a.g -> 'flags' else '[]'::jsonb end
    ) as f(flag)
  ),
  deck_sizes as (
    select p.id, count(c.id) as slides
    from presentations p
    left join cards c on c.presentation_id = p.id
    group by p.id
  ),
  active_7 as (
    select owner_id as user_id from presentations where updated_at >= now() - interval '7 days'
    union
    select student_id from quiz_attempts where submitted_at >= now() - interval '7 days'
  ),
  active_30 as (
    select owner_id as user_id from presentations where updated_at >= now() - interval '30 days'
    union
    select student_id from quiz_attempts where submitted_at >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'generatedAt', now(),

    'users', jsonb_build_object(
      'total', (select count(*) from profiles),
      'byRole', coalesce((select jsonb_object_agg(role, n) from (
        select role, count(*) as n from profiles group by role
      ) s), '{}'::jsonb),
      'active7', (select count(*) from active_7),
      'active30', (select count(*) from active_30),
      'signupsByWeek', (select jsonb_agg(jsonb_build_object(
        'week', to_char(w.week, 'YYYY-MM-DD'),
        'count', (select count(*) from profiles p where p.created_at >= w.week and p.created_at < w.week + interval '1 week')
      ) order by w.week) from weeks w)
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

    'decks', jsonb_build_object(
      'total', (select count(*) from presentations),
      'aiMade', (select count(*) from ai),
      'createdByWeek', (select jsonb_agg(jsonb_build_object(
        'week', to_char(w.week, 'YYYY-MM-DD'),
        'count', (select count(*) from presentations p where p.created_at >= w.week and p.created_at < w.week + interval '1 week')
      ) order by w.week) from weeks w),
      'averageSlides', (select coalesce(round(avg(slides)::numeric, 1), 0) from deck_sizes),
      'slideCounts', coalesce((select jsonb_object_agg(bucket, n) from (
        select case when slides >= 8 then '8+' else slides::text end as bucket, count(*) as n
        from deck_sizes group by 1
      ) s), '{}'::jsonb)
    ),

    'generation', jsonb_build_object(
      'research', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(g ->> 'research', 'unknown') as k, count(*) as n from ai group by 1
      ) s), '{}'::jsonb),
      'presentationType', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(g -> 'brief' ->> 'presentationType', 'unknown') as k, count(*) as n from ai group by 1
      ) s), '{}'::jsonb),
      'audienceLevel', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(g -> 'brief' ->> 'audienceKnowledgeLevel', 'unknown') as k, count(*) as n from ai group by 1
      ) s), '{}'::jsonb),
      'flags', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(flag ->> 'type', 'unknown') as k, count(*) as n from flag_rows group by 1
      ) s), '{}'::jsonb),
      'flagSeverity', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(flag ->> 'severity', 'unknown') as k, count(*) as n from flag_rows group by 1
      ) s), '{}'::jsonb),
      'claims', (select count(*) from claim_rows),
      'unsourcedClaims', (select count(*) from claim_rows
        where (claim ->> 'verified') is distinct from 'true'
          and coalesce(claim ->> 'type', '') <> 'opinion'
          and research is distinct from 'skipped'),
      'reviewedClaims', (select coalesce(sum(jsonb_array_length(g -> 'reviewed')), 0) from ai
        where jsonb_typeof(g -> 'reviewed') = 'array')
    ),

    'made', jsonb_build_object(
      'videos', (select count(*) from presentations where video is not null),
      'quizzes', (select count(*) from quizzes),
      'quizTypes', coalesce((select jsonb_object_agg(quiz_type, n) from (
        select quiz_type, count(*) as n from quizzes group by quiz_type
      ) s), '{}'::jsonb),
      'clonedVoices', (select count(*) from cloned_voices),
      'savedVoiceSettings', (select count(*) from voice_settings)
    ),

    'classroom', jsonb_build_object(
      'classes', (select count(*) from classes),
      'studentsEnrolled', (select count(distinct student_id) from class_members),
      'quizPostings', (select count(*) from quiz_classes where mode = 'quiz'),
      'lessonPostings', (select count(*) from quiz_classes where mode = 'lesson'),
      'attempts', (select count(*) from quiz_attempts),
      'averageScore', (select round(avg(score)::numeric, 3) from quiz_attempts),
      'attemptsByWeek', (select jsonb_agg(jsonb_build_object(
        'week', to_char(w.week, 'YYYY-MM-DD'),
        'count', (select count(*) from quiz_attempts a where a.submitted_at >= w.week and a.submitted_at < w.week + interval '1 week')
      ) order by w.week) from weeks w)
    )
  )
  into result;

  return result;
end;
$$;

revoke execute on function admin_overview() from public, anon;
grant execute on function admin_overview() to authenticated;
