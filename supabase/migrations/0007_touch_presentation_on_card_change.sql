-- A deck's `updated_at` should mean "when this deck last changed", but it only
-- ever meant "when its title or theme last changed".
--
-- 0001 put a `set_updated_at` trigger on both tables, so editing a card
-- refreshed `cards.updated_at` — and nothing else. The dashboard lists decks
-- from `presentations` and reads `presentations.updated_at`, which no amount of
-- editing slide content ever touched. A deck rewritten this morning still read
-- "Updated 2 days ago", and because the list is *ordered* by that column, it
-- also sorted as though it had not been opened.
--
-- Fixed in the database rather than in the client for two reasons: it costs no
-- extra round-trip on a debounced save, and it cannot be forgotten. Card writes
-- come from several store actions already (text, marks, inline style, layout
-- variety, element nudges, delete, reorder, undo/redo) and any future one gets
-- this for free.

create or replace function touch_parent_presentation()
returns trigger as $$
begin
  /*
    Branched on TG_OP rather than `coalesce(new.…, old.…)`.

    In a PL/pgSQL row trigger `NEW` is not merely null on DELETE, it is
    *unassigned* — reading a field off it raises `record "new" is not assigned
    yet` and aborts the statement. A coalesce would therefore have looked
    correct and broken every card deletion: deleting a slide, and undo/redo
    crossing one, both go through `persistCardsSync`.
  */
  if (tg_op = 'DELETE') then
    update presentations set updated_at = now() where id = old.presentation_id;
  else
    update presentations set updated_at = now() where id = new.presentation_id;
  end if;
  return null;
end;
$$ language plpgsql;

-- Deliberately SECURITY INVOKER (the default): the caller owns the parent
-- presentation — the cards RLS policy has already proved it via the same join —
-- so the update satisfies `presentations_owner_all` on its own. A definer-rights
-- function here would let any future caller touch a row it does not own.

drop trigger if exists cards_touch_presentation on cards;

-- Row-level rather than statement-level. A bulk reorder therefore touches the
-- parent once per card instead of once per statement, which is wasted work in
-- principle; with a deck capped at 30 cards it is a handful of updates inside
-- one transaction, and it keeps this to a single trigger instead of three
-- (transition tables cannot cover INSERT, UPDATE and DELETE at once).
create trigger cards_touch_presentation
  after insert or update or delete on cards
  for each row execute function touch_parent_presentation();
