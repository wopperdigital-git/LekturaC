-- Hand-run checks for 0021_talking_bookends.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying 0021. One
-- transaction that rolls back, so no fixture survives. Any failed check raises and aborts
-- with a message naming it; a clean run ends by printing "face photo checks passed".
--
-- Last run: 2026-11-21, passed, right after 0021 was applied.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a500-000000000001', 'face-a@example.test', '{"display_name":"Faye Face"}'),
  ('00000000-0000-4000-a500-000000000002', 'face-b@example.test', '{"display_name":"Fred Face"}');

-- ── the column exists with the right default ────────────────────────────────
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'presentations' and column_name = 'bookends'
      and data_type = 'jsonb' and is_nullable = 'NO'
      and column_default like '''{}''::jsonb%'
  ) then
    raise exception 'column: presentations.bookends must be jsonb not null default ''{}''';
  end if;
end $$;

-- ── the bucket is private and limited to photos ─────────────────────────────
do $$ begin
  if (select public from storage.buckets where id = 'face-photos') is distinct from false then
    raise exception 'bucket: face-photos must exist and be private';
  end if;
  if (select allowed_mime_types from storage.buckets where id = 'face-photos')
     is distinct from array['image/jpeg', 'image/png', 'image/webp']::text[] then
    raise exception 'bucket: face-photos must allow exactly image/jpeg, image/png and image/webp';
  end if;
  if (select file_size_limit from storage.buckets where id = 'face-photos') is distinct from 10485760 then
    raise exception 'bucket: face-photos must be limited to 10485760 bytes (10 MB)';
  end if;
end $$;

set local role authenticated;

-- ── user A stores a photo in their own folder ───────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a500-000000000001","role":"authenticated"}', true);

insert into storage.objects (bucket_id, name)
values ('face-photos', '00000000-0000-4000-a500-000000000001/face.jpg');

do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'face-photos') <> 1 then
    raise exception 'own folder: user A cannot read the object they wrote';
  end if;
end $$;

-- ── user A can replace it (upsert needs update) ─────────────────────────────
do $$
declare n int;
begin
  update storage.objects set name = name
  where bucket_id = 'face-photos' and name = '00000000-0000-4000-a500-000000000001/face.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'own folder: user A cannot update their own object'; end if;
end $$;

-- ── user A cannot write into user B's folder ────────────────────────────────
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('face-photos', '00000000-0000-4000-a500-000000000002/face.jpg');
    raise exception 'rls: user A wrote into user B''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── user B cannot see, update or delete user A's object ─────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a500-000000000002","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'face-photos') <> 0 then
    raise exception 'rls: user B can read user A''s face photo';
  end if;
end $$;

do $$
declare n int;
begin
  update storage.objects set name = '00000000-0000-4000-a500-000000000002/stolen.jpg'
  where bucket_id = 'face-photos' and name = '00000000-0000-4000-a500-000000000001/face.jpg';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'rls: user B updated user A''s face photo'; end if;
end $$;

-- Storage blocks direct deletes unless this is set; RLS still decides what the delete may touch.
select set_config('storage.allow_delete_query', 'true', true);

delete from storage.objects
where bucket_id = 'face-photos' and name = '00000000-0000-4000-a500-000000000001/face.jpg';

reset role;
do $$ begin
  -- Scoped to A's fixture object: as postgres this would otherwise count every photo in the bucket.
  if (select count(*) from storage.objects
      where bucket_id = 'face-photos'
        and name = '00000000-0000-4000-a500-000000000001/face.jpg') <> 1 then
    raise exception 'rls: user B deleted or renamed user A''s face photo';
  end if;
end $$;

-- ── user A can delete their own photo ───────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a500-000000000001","role":"authenticated"}', true);
select set_config('storage.allow_delete_query', 'true', true);

delete from storage.objects
where bucket_id = 'face-photos' and name = '00000000-0000-4000-a500-000000000001/face.jpg';

reset role;
do $$ begin
  if (select count(*) from storage.objects
      where bucket_id = 'face-photos'
        and name = '00000000-0000-4000-a500-000000000001/face.jpg') <> 0 then
    raise exception 'own folder: user A cannot delete their own face photo';
  end if;
end $$;

do $$ begin raise notice 'face photo checks passed'; end $$;

rollback;
