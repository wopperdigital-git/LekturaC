-- Talking intro & outro: a lip-synced face clip before slide 1 and after the last slide of the
-- narrated video.
--
-- `presentations.bookends` holds `{intro?, outro?}`: the text spoken in the talking intro and outro
-- of one deck. Its shape is owned by the app (src/avatar), not by SQL; `{}` means never edited.
--
-- Gates ONLY the talking intro/outro: the app writes `bookends` in its own best-effort update
-- (never through the card upsert), so a project that has not run this migration still saves and
-- loads decks and still makes plain narrated videos.
alter table presentations add column if not exists bookends jsonb not null default '{}'::jsonb;

-- The face photo a user uploads to animate, in the private `face-photos` bucket at
-- `<user id>/<file>`. A face is personal data, so the bucket is private and owner-only.
-- 10 MB is generous for a portrait photo. On conflict the settings are forced rather than
-- left alone: a `face-photos` bucket that already exists as public would otherwise stay
-- public and serve every face without RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('face-photos', 'face-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Owner-only: the first folder of the object's name must be the caller's user id. Replacing a
-- photo (upsert) needs select + insert + update, so all four are defined.
drop policy if exists face_photos_select on storage.objects;
create policy face_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'face-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists face_photos_insert on storage.objects;
create policy face_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'face-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists face_photos_update on storage.objects;
create policy face_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'face-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'face-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists face_photos_delete on storage.objects;
create policy face_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'face-photos' and (storage.foldername(name))[1] = auth.uid()::text);
