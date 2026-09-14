-- One slide's narration: { text, generated }.
--
-- `text` is the script a voice will read; `generated` is the AI's version of it,
-- kept so "Reset to generated" can restore it literally after a hand edit.
--
-- Defaults to '{}' like `adjusts` before it, so every existing row is valid
-- immediately. The app maps that empty object back to "no script" on read
-- (`parseNarration`) — a card with the column is not a card with a script.
alter table cards add column if not exists narration jsonb not null default '{}';
