# Requirements

A running record of what's actually been requested for this app, so it doesn't get lost or accidentally re-litigated. Organized by area, reflecting the **current** intended behavior — a couple of items were explicitly reversed partway through (noted at the bottom).

## Concept

An AI presentation generator modeled on Gamma: describe a topic once, get a full deck, then view/present it. Not a general-purpose manual slide editor.

## Stack choices

- React + TypeScript, Tailwind CSS, Zustand, `@dnd-kit` for drag-reorder.
- AI: Gemini (free tier, generous rate limits), not a paid API — client-side call directly from the browser using a user-supplied key (accepted tradeoff of not proxying through a server, in exchange for no backend/cost to run).
- Persistence: Supabase (real hosted Postgres + anonymous auth), not just `localStorage` — chosen for genuine multi-device access and a real backend, over a local-only or self-hosted alternative.

## Deck creation flow

- The topic/generation prompt lives on its **own separate page**, not inside the editor.
- **One topic per project.** Generation happens once, at creation. There is no "regenerate" inside the editor — to make a different topic, start a new project.
- The intake is conversational (one question at a time, chat-bubble style), asking in order:
  1. Topic
  2. **Slide count** — free entry, no fixed cap (explicitly: *"do not limit the pages to 7 only"*)
  3. Audience
  4. Detail level (simplified / balanced / detailed)
  5. Tone (professional / casual / bold)
- Content quality bar: specific and concrete (real numbers, named entities, timeframes), never generic marketing filler — this was an explicit complaint ("better content") that led to banning stock phrases and requiring every card to open with a real heading.
- No AI-generated stock/placeholder images — they were random and unrelated to content, which looked worse than no image at all.

## Editor layout

- **Left panel** — the card outline:
  - Smaller than a standard sidebar.
  - Shows a live preview of each slide (not just a text label) plus its slide number.
  - Toggles open/closed (slides in and out), not permanently docked.
- **Right panel** — theme:
  - Premade themes only — no manual color picking.
  - Each premade theme has its own font style.
  - Also toggles open/closed independently of the left panel.
  - Corner radius and spacing are no longer user-editable controls — these are decided automatically per theme, not exposed as sliders.
- **Center (the cards themselves)**:
  - Not editable manually anymore — no click-to-edit text, no manual layout override. Content only comes from generation; a project's cards are read-only after creation. (Reordering and deleting cards is unaffected — that's a structural/deck-management action, not content editing.)
  - Size is driven purely by content — no fixed/locked card dimensions.
  - Not internally scrollable.
  - Responsive, and reasonably wide (not cramped).
  - Text sizing (headings, body) should be uniform/consistent across slides, not vary slide-to-slide.

## Visual style

- The page background behind the cards should be a shade of the active theme's color, just a little darker — not a plain unrelated neutral.
- Cards should read as clean floating panels with a subtle shadow, distinct from the background.
- Changing the theme must only restyle the slides — it must never affect or break the surrounding app UI (topbar, panels, buttons, other pages).

## Changes made along the way (superseded requirements, kept here for context)

- Card sizing went through two states: first "fixed rectangular size" (a specific ask), then explicitly reversed to "no fixed size — depends only on content."
- The theme panel's side went through two states: first the left panel (sharing a slot with the outline), then explicitly moved to its own independent right-side panel.
