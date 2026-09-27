-- Hand-run checks for 0015_deck_videos.sql.
--
-- Paste into the Supabase SQL editor (runs as postgres) after applying 0015. One
-- transaction that rolls back, so no fixture survives. Any failed check raises and aborts
-- with a message naming it; a clean run ends by printing "deck video checks passed".
--
-- NOT YET RUN against a database.

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a300-000000000001', 'video-a@example.test', '{"display_name":"Vera Video"}'),
  ('00000000-0000-4000-a300-000000000002', 'video-b@example.test', '{"display_name":"Vic Video"}');

-- ── the bucket is private and limited to video ──────────────────────────────
do $$ begin
  if (select public from storage.buckets where id = 'deck-videos') is distinct from false then
    raise exception 'bucket: deck-videos must exist and be private';
  end if;
  if (select allowed_mime_types from storage.buckets where id = 'deck-videos')
     is distinct from array['video/mp4', 'video/webm']::text[] then
    raise exception 'bucket: deck-videos must allow exactly video/mp4 and video/webm';
  end if;
  if (select file_size_limit from storage.buckets where id = 'deck-videos') is distinct from 52428800 then
    raise exception 'bucket: deck-videos must be limited to 52428800 bytes (50 MB)';
  end if;
end $$;

set local role authenticated;

-- ── user A stores a video in their own folder ───────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a300-000000000001","role":"authenticated"}', true);

insert into storage.objects (bucket_id, name)
values ('deck-videos', '00000000-0000-4000-a300-000000000001/deck.mp4');

do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'deck-videos') <> 1 then
    raise exception 'own folder: user A cannot read the object they wrote';
  end if;
end $$;

-- ── user A can replace it (upsert needs update) ─────────────────────────────
do $$
declare n int;
begin
  update storage.objects set name = name
  where bucket_id = 'deck-videos' and name = '00000000-0000-4000-a300-000000000001/deck.mp4';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'own folder: user A cannot update their own object'; end if;
end $$;

-- ── user A cannot write into user B's folder ────────────────────────────────
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('deck-videos', '00000000-0000-4000-a300-000000000002/deck.mp4');
    raise exception 'rls: user A wrote into user B''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── user B cannot see or delete user A's object ─────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a300-000000000002","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'deck-videos') <> 0 then
    raise exception 'rls: user B can read user A''s video';
  end if;
end $$;

-- Storage blocks direct deletes unless this is set; RLS still decides what the delete may touch.
select set_config('storage.allow_delete_query', 'true', true);

delete from storage.objects
where bucket_id = 'deck-videos' and name = '00000000-0000-4000-a300-000000000001/deck.mp4';

reset role;
do $$ begin
  -- Scoped to A's fixture object: as postgres this would otherwise count every video in the bucket.
  if (select count(*) from storage.objects
      where bucket_id = 'deck-videos'
        and name = '00000000-0000-4000-a300-000000000001/deck.mp4') <> 1 then
    raise exception 'rls: user B deleted user A''s video';
  end if;
end $$;

do $$ begin raise notice 'deck video checks passed'; end $$;

rollback;
