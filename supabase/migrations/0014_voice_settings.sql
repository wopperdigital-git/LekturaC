-- The narration voice a user picked (or cloned) with Cartesia, and how it should sound.
--
-- One row per user, owner-only. It is deliberately NOT a column on `profiles`: the
-- profiles_select policy (0009) lets a teacher read their students' profiles and the
-- reverse, so a voice choice stored there would be visible to classmates.
--
-- The voice itself lives in the user's Cartesia account; this row only remembers which
-- voice was picked and its settings. Deleting an account (delete_own_account deletes the
-- auth user) removes the row by cascade; it cannot delete the cloned voices from Cartesia.
--
-- Does NOT gate anything else: nothing but the Clone voice modal reads it, and a project
-- that has not run this migration works normally (the voice then lasts for the session).
create table if not exists voice_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  voice_id text,
  voice_name text,
  voice_source text check (voice_source in ('premade', 'cloned')),
  language text not null default 'en',
  speed numeric not null default 1,
  volume numeric not null default 1,
  emotion text,
  updated_at timestamptz not null default now()
);

alter table voice_settings enable row level security;

drop policy if exists voice_settings_owner on voice_settings;
create policy voice_settings_owner on voice_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
