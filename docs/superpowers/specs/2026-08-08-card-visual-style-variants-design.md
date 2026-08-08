# Card visual style variants — design

## Problem

Every card that resolves to a given layout (e.g. `standard`, `quote`, `timeline`) always renders with the exact same visual treatment. In decks where a layout repeats several times, cards look templated/repetitive even though their content differs.

## Goal

Give each of the 12 layout components two distinct visual treatments, chosen by the AI per card at generation time, so decks read as varied rather than templated — without touching the deterministic layout-*selection* logic (`chooseLayout`), which stays exactly as-is.

## Data model

Each card gains a new field:

```ts
visualStyle: 'structured' | 'expressive'
```

Set once at generation time, same lifecycle as `blocks` — cards are never edited after creation in this app, so this field never changes post-generation either.

- `cardSchema` / `Card` type (`src/engine/contentBlocks.ts`): add `visualStyle: z.enum(['structured', 'expressive'])`, required.
- `generatedCardSchema` (`src/ai/provider.ts`): same field, required — the AI must choose a value for every card, no default at the AI layer.
- Supabase: new migration `supabase/migrations/0002_add_visual_style.sql`:
  ```sql
  alter table cards add column visual_style text not null default 'structured';
  ```
  Existing rows (created before this feature shipped) get `'structured'` automatically via the column default. The app's `Card` type itself stays required/non-optional — the `'structured'` fallback for legacy rows is applied once, at the `loadDeck` read boundary in `presentationStore.ts` (`row.visual_style ?? 'structured'`), not scattered through every layout component.

## AI prompt changes (`src/ai/prompts.ts`)

- `DECK_SYSTEM_PROMPT`'s JSON shape gains the field: `{ "blocks": ContentBlock[], "visualStyle": "structured" | "expressive" }`.
- New guidance line (placed near the existing "vary block types on purpose" rule): choose `expressive` for cards meant to feel bold/visually striking (a pivotal stat, a big moment, a rallying quote) and `structured` for calmer/informational cards. Vary it across the deck — don't default to one value throughout, and don't let it become a mechanical alternation either.

## The two treatments, per layout

`structured` stays close to each layout's current look (airy, line/border-based). `expressive` consistently leans on tinted `bg-slide-surface` panels and bolder accent badges, so the two "moods" read as a deliberate system rather than 12 unrelated tweaks.

| Layout | `structured` (≈ today's only look) | `expressive` |
|---|---|---|
| `hero` | centered, thin accent bar above heading | left-aligned block, tall accent bar beside the heading |
| `statHero` | centered stack (heading → stat → paragraph) | big number on the left, heading+text on the right, inside a tinted panel |
| `statGrid` | grid of stats, thin top border per stat | each stat inside a full tinted card, no top border |
| `comparison` | boxed columns side-by-side | stacked full-width rows separated by a divider, no boxes |
| `timeline` | vertical connecting line + small dot per step | each step inside a tinted card with a numbered accent badge; no connecting line |
| `iconGrid` | grid of bordered badge-cards | single-row wrapping chips, tinted background, no border |
| `numberedList` | hairline-divided rows, small accent number | each row inside a tinted card with a circular accent badge number |
| `quote` | centered, giant quote-mark glyph | left-aligned block with a left accent border bar (no quote-mark glyph) |
| `textFocus` | all paragraphs at uniform body size | first paragraph large/lead-style, rest at body size (today's only behavior) |
| `gallery` | uniform grid, all images equal size | first image featured/larger, remaining images smaller alongside |
| `standard` (fallback) | left accent border bar, plain stack | no border bar; whole stack inside a tinted panel |
| `standardSplit` | text left, image right | mirrored: image left, text right |

Constraints carried over from existing CLAUDE.md rules, applying to every `expressive` variant too: heading sizes stay uniform (`h2` via the shared `Heading` component, `h1` only for the opening `hero` card), no fixed aspect ratio/height on the card container, and all colors/radii/shadows/spacing must come from the existing `--slide-*` theme tokens (never hardcoded), so every variant still reskins correctly across all 5 built-in themes.

**Known behavior change for existing decks:** `textFocus`'s current lead-paragraph treatment becomes the `expressive` option. Existing decks default missing `visualStyle` to `'structured'`, so old `textFocus` cards will render plainer (uniform paragraph size) than they do today. Accepted as a minor, one-time visual change on legacy decks rather than special-casing the default per layout.

## Rendering wiring

- `LayoutRenderer` (`src/components/layouts/LayoutRenderer.tsx`) passes `card.visualStyle` to whichever component `resolveLayout` selects, as a `variant` prop.
- Each of the 12 layout components' signature changes from `{ blocks }` to `{ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }` and branches its JSX on `variant`. `BlockRenderer.tsx`'s per-block-type renderers (used inside `standard`/`standardSplit`) are untouched — variant only affects card-level structure, not individual block rendering.
- `resolveLayout`/`chooseLayout` (`src/engine/layoutEngine.ts`) are untouched — layout *selection* stays a pure function of block composition + `isFirstCard`, orthogonal to `visualStyle`.
- `presentationStore.ts`: `createDeckFromGeneration` copies `visualStyle` from the AI's generated card onto the new `Card`; `loadDeck` maps `row.visual_style` back with the `'structured'` fallback described above; `persistCardsReorder`'s upsert payload includes `visual_style` alongside the fields it already writes (`blocks`, `layout`).
- `CardOutlineSidebar`/`CardThumbnail` need no changes — they already render through the same `LayoutRenderer`, so thumbnails automatically match the main canvas.

## Testing

- `layoutEngine.test.ts` is unaffected in scope (layout selection logic doesn't change) — no new cases required there.
- Manual verification after implementation: generate a deck covering several layouts, confirm `structured`/`expressive` cards render distinctly in both the main canvas and the sidebar thumbnails (which must match, per the existing pixel-accurate-thumbnail architecture), confirm both variants reskin correctly across at least 2 built-in themes, and confirm an existing (pre-migration) deck still loads without error and defaults to `structured`.
