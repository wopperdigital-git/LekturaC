-- Per-text-element formatting for the editor toolbar's Level 3 tools.
-- Run this in the Supabase SQL editor (or `supabase db push`) after 0004.
--
-- Keyed by a text reference ("2:text", "3:items:1") -> { marks, style }, where
-- marks are character ranges and style is the element-level font/size/align.
--
-- Stored beside `blocks` rather than inside them on purpose: `blocks` is the
-- shape the AI generates and zod validates, and threading editor metadata into
-- that union would mean touching the generation schema and its validation-retry
-- path to add something the model never produces. See engine/marks.ts.
--
-- Same not-null-with-empty-default reasoning as 0003 and 0004: `{}` already
-- means "nothing overridden here".

alter table cards add column if not exists inline jsonb not null default '{}'::jsonb;
