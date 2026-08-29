-- Per-element nudges: how far one block has been dragged from where the layout
-- engine put it, and what size it was given.
--
-- One column, not two. There is deliberately no card-level "this card is now
-- free-form" flag: the layout engine still arranges every card, and this is a
-- set of deltas layered on top of that. A card nobody has touched has `{}`
-- here, which is exactly what every row written before this migration reads
-- back as.
--
-- jsonb rather than a table of its own for the same reason `inline` is: it is
-- read and written only as a whole, always with its card, and never queried
-- across cards.

alter table cards
  add column if not exists adjusts jsonb not null default '{}'::jsonb;
