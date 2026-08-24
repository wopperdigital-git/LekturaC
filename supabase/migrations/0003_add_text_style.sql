-- Adds deck-wide text formatting overrides for the editor toolbar's Level 1
-- tools (font family, size scale, bold, italic, alignment).
-- Run this in the Supabase SQL editor (or `supabase db push`) after 0002.
--
-- `not null default '{}'` rather than nullable: an empty object already means
-- "no overrides, use the theme's own typography", so a null would be a second
-- way to say the same thing and every read site would have to handle both.
-- Postgres 11+ stores a non-volatile default in the catalog instead of
-- rewriting the table, so this is cheap on an existing deck table.
--
-- jsonb (not json) to match `presentations.theme`: it is read far more often
-- than written, and jsonb parses once on write rather than on every read.

alter table presentations add column if not exists text_style jsonb not null default '{}'::jsonb;
