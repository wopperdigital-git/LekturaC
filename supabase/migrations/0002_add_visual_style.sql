-- Adds per-card visual style variants (structured/expressive).
-- Run this in the Supabase SQL editor (or `supabase db push`) after 0001_init.sql.

alter table cards add column if not exists visual_style text not null default 'structured';
