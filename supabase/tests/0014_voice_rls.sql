-- Hand-run checks for 0014_voice_settings.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying 0014. One
-- transaction that rolls back, so no fixture survives. Any failed check raises and
-- aborts with a message naming it; a clean run ends by printing "voice settings
-- checks passed". Same shape as 0009_classroom_rls.sql: fixtures as postgres, then
-- each check under `set local role authenticated` with a forged jwt claim.
--
-- Run against the LekturaC project on 2026-09-27: all checks passed, no fixtures left behind.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a200-000000000001', 'voice-a@example.test', '{"display_name":"Vera Voice"}'),
  ('00000000-0000-4000-a200-000000000002', 'voice-b@example.test', '{"display_name":"Vic Voice"}');

set local role authenticated;

-- ── user A writes and reads their own row ───────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a200-000000000001","role":"authenticated"}', true);

insert into voice_settings (user_id, voice_id, voice_name, voice_source, language)
values ('00000000-0000-4000-a200-000000000001', 'v-a', 'A voice', 'cloned', 'en');

do $$ begin
  if (select count(*) from voice_settings) <> 1 then
    raise exception 'own row: user A cannot read the row they wrote';
  end if;
end $$;

-- ── user A cannot write a row for user B ────────────────────────────────────
do $$ begin
  begin
    insert into voice_settings (user_id, voice_id) values ('00000000-0000-4000-a200-000000000002', 'x');
    raise exception 'rls: user A inserted a row for user B';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── a source outside premade/cloned is refused ──────────────────────────────
do $$ begin
  begin
    update voice_settings set voice_source = 'stolen'
      where user_id = '00000000-0000-4000-a200-000000000001';
    raise exception 'check: an unknown voice_source was accepted';
  exception when check_violation then null;
  end;
end $$;

-- ── user B sees none of A's row and cannot change it ────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a200-000000000002","role":"authenticated"}', true);

do $$
declare n integer;
begin
  if (select count(*) from voice_settings) <> 0 then
    raise exception 'rls: user B can read user A''s voice settings';
  end if;
  update voice_settings set voice_id = 'hijack'
    where user_id = '00000000-0000-4000-a200-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'rls: user B updated user A''s voice settings';
  end if;
end $$;

-- ── deleting the account takes the row with it ──────────────────────────────
reset role;

delete from auth.users where id = '00000000-0000-4000-a200-000000000001';

do $$ begin
  if exists (select 1 from voice_settings where user_id = '00000000-0000-4000-a200-000000000001') then
    raise exception 'cascade: the row outlived its user';
  end if;
end $$;

do $$ begin raise notice 'voice settings checks passed'; end $$;

rollback;
