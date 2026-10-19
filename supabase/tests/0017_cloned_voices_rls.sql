-- Hand-run checks for 0017_cloned_voices.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying 0017. One
-- transaction that rolls back, so no fixture survives. Any failed check raises and
-- aborts with a message naming it; a clean run ends with one row, "cloned voices checks
-- passed" (a select, since the SQL editor shows only the last result and not notices).
-- Same shape as 0014_voice_rls.sql.
--
-- Run against the LekturaC project on 2026-10-19: all checks passed, no fixtures left behind.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a300-000000000001', 'clone-a@example.test', '{"display_name":"Ada Clone"}'),
  ('00000000-0000-4000-a300-000000000002', 'clone-b@example.test', '{"display_name":"Ben Clone"}');

set local role authenticated;

-- ── user A records a voice and reads it back; the owner defaults to the caller ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a300-000000000001","role":"authenticated"}', true);

insert into cloned_voices (voice_id, name) values ('voice-a', 'Ada narrating');

do $$ begin
  if (select count(*) from cloned_voices where user_id = '00000000-0000-4000-a300-000000000001') <> 1 then
    raise exception 'own row: user A cannot read the voice they recorded';
  end if;
end $$;

-- ── user A cannot record a voice as user B's ────────────────────────────────
do $$ begin
  begin
    insert into cloned_voices (user_id, voice_id) values ('00000000-0000-4000-a300-000000000002', 'voice-x');
    raise exception 'rls: user A recorded a voice as user B''s';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── user B sees none of A's voices, cannot claim or delete them ─────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a300-000000000002","role":"authenticated"}', true);

do $$
declare n integer;
begin
  if (select count(*) from cloned_voices) <> 0 then
    raise exception 'rls: user B can read user A''s voices';
  end if;
  delete from cloned_voices where voice_id = 'voice-a';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'rls: user B deleted user A''s voice';
  end if;
  update cloned_voices set user_id = '00000000-0000-4000-a300-000000000002' where voice_id = 'voice-a';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'rls: user B took over user A''s voice';
  end if;
end $$;

-- A voice already recorded as someone's cannot be recorded again as B's.
do $$ begin
  begin
    insert into cloned_voices (voice_id) values ('voice-a');
    raise exception 'unique: user B claimed a voice already recorded as user A''s';
  exception when unique_violation then null;
  end;
end $$;

-- ── deleting the account takes the rows with it ─────────────────────────────
reset role;

delete from auth.users where id = '00000000-0000-4000-a300-000000000001';

do $$ begin
  if exists (select 1 from cloned_voices where user_id = '00000000-0000-4000-a300-000000000001') then
    raise exception 'cascade: a voice record outlived its user';
  end if;
end $$;

select 'cloned voices checks passed' as result;

rollback;
