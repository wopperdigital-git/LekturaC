-- Presentation design system: core schema
-- Run this in the Supabase SQL editor (or `supabase db push`) on a fresh project.
-- Uses Supabase anonymous auth: every browser gets a persistent auth.uid()
-- with no login screen, and rows are scoped to that id via RLS.

create table if not exists presentations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  title text not null default 'Untitled',
  theme jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references presentations(id) on delete cascade,
  order_index integer not null,
  blocks jsonb not null,
  layout text not null default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists themes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  tokens jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists cards_presentation_id_idx on cards (presentation_id, order_index);
create index if not exists presentations_owner_id_idx on presentations (owner_id);
create index if not exists themes_owner_id_idx on themes (owner_id);

alter table presentations enable row level security;
alter table cards enable row level security;
alter table themes enable row level security;

create policy "presentations_owner_all" on presentations
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "themes_owner_all" on themes
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "cards_owner_all" on cards
  for all using (
    exists (
      select 1 from presentations
      where presentations.id = cards.presentation_id
      and presentations.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from presentations
      where presentations.id = cards.presentation_id
      and presentations.owner_id = auth.uid()
    )
  );

-- Keep updated_at fresh on edit.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger presentations_set_updated_at
  before update on presentations
  for each row execute function set_updated_at();

create trigger cards_set_updated_at
  before update on cards
  for each row execute function set_updated_at();
