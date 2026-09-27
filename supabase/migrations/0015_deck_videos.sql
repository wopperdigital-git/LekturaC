-- The narrated video generated from a deck ("Generate Presentation" in the voice modal).
--
-- One video per deck: the file lives in the private `deck-videos` bucket at
-- `<user id>/<presentation id>.<mp4|webm>` and `presentations.video` points at it:
--   { "path": "...", "contentType": "video/mp4", "durationSeconds": 42.5, "generatedAt": "..." }
--
-- Does NOT gate anything else: the app writes `video` in its own best-effort update (never
-- through the card upsert), so a project that has not run this migration still saves and
-- loads decks. Generating a video then fails at the upload step with "Run migration 0015".
--
-- Deleting a deck removes the file client-side first (SQL cannot safely delete Storage
-- objects). delete_own_account() does NOT remove a user's videos: they are orphaned, the same
-- class of gap as cloned Cartesia voices.
alter table presentations add column if not exists video jsonb;

-- 50 MB is Supabase's default per-file ceiling; a deck of at most MAX_SLIDES static slides is
-- a few MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deck-videos', 'deck-videos', false, 52428800, array['video/mp4', 'video/webm'])
on conflict (id) do nothing;

-- Owner-only: the first folder of the object's name must be the caller's user id. Upsert
-- (replacing the deck's video) needs select + insert + update, so all four are defined.
drop policy if exists deck_videos_select on storage.objects;
create policy deck_videos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'deck-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists deck_videos_insert on storage.objects;
create policy deck_videos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'deck-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists deck_videos_update on storage.objects;
create policy deck_videos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'deck-videos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'deck-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists deck_videos_delete on storage.objects;
create policy deck_videos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'deck-videos' and (storage.foldername(name))[1] = auth.uid()::text);
