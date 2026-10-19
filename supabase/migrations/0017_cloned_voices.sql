-- Who cloned which Cartesia voice.
--
-- Every user of a deployment shares one Cartesia account (the key is the site's), so
-- Cartesia's "your voices" are every user's. Before this table, the voice dialog listed
-- all of them under "Your voices": one teacher's recorded voice could be picked, and a
-- video narrated with it, by any other. The app now records the owner when a voice is
-- cloned (`src/voice/clonedVoices.ts`) and lists, uses and deletes only the caller's.
--
-- Owner-only. `voice_id` is unique across users, so nobody can claim a voice already
-- recorded as someone else's. Voices cloned before this migration have no row and are
-- shown to nobody; whoever runs the site can still see them in the Cartesia dashboard,
-- or give one an owner by inserting its row here.
--
-- Deleting an account removes these rows by cascade; the app deletes the voices
-- themselves from Cartesia first (`authStore.deleteAccount`), since SQL cannot reach them.
--
-- Does NOT gate card writes or anything outside the voice dialog. Without it, premade
-- voices still work and recording your own voice is off, with a message naming 0017.
create table if not exists cloned_voices (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  voice_id text not null unique,
  name text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, voice_id)
);

alter table cloned_voices enable row level security;

drop policy if exists cloned_voices_owner on cloned_voices;
create policy cloned_voices_owner on cloned_voices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
