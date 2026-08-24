-- Per-card text formatting overrides for the editor toolbar's Level 2 tools.
-- Run this in the Supabase SQL editor (or `supabase db push`) after 0003.
--
-- Same shape and same reasoning as presentations.text_style (0003): `{}` means
-- "no card-level override, fall through to the deck's", so the column is
-- not-null with an empty-object default rather than nullable.
--
-- Resolution order at render time is theme -> deck text_style -> card
-- text_style, merged per field. See engine/textStyle.ts `mergeTextStyle`.

alter table cards add column if not exists text_style jsonb not null default '{}'::jsonb;
