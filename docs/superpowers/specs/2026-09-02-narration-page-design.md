# Narration page — design

**Date:** 2026-09-02
**Status:** approved, not yet implemented

A `/deck/:id/narrate` page pairing a read-only, one-slide-at-a-time viewer on
the left with a narration script panel on the right. Each slide gets an
expanded spoken script — full sentences written to be read aloud, not the
slide's own terse bullets — which a cloned voice will read in later
development. This finally lights up the disabled **Narrate PPT** button in
`TopBar`.

## Decisions

Five choices settled before design, in the order they constrain everything
else:

1. **Scripts are AI-written for the whole deck in one pass**, not per slide and
   not by hand. Narration that flows slide-to-slide ("…which brings us to the
   numbers themselves") cannot be produced by N independent calls that each
   start cold.
2. **A hand-edited script is never overwritten.** Regenerating fills empty and
   untouched slides and writes *around* the ones the user has edited.
3. **Reset restores the AI's version literally**, so a card stores two strings:
   the current script and the generated one it came from.
4. **A separate page**, not a third panel in the editor's right dock.
5. **Presenter-style stepping** on the left — ‹ › buttons, arrow keys, an
   `n / total` counter — not the editor's scrolling outline rail.

### On the generate-once rule

The architecture's most load-bearing rule is that *a deck's card content comes
from a single AI call at creation time and no code path asks the model for
content a second time.* This feature adds a second AI call, so the rule needs
restating rather than quietly bending:

**No code path regenerates a card's `blocks`.** That is the rule, and it still
holds absolutely. Narration is a distinct field that is never rendered on a
slide, never exported to `.pptx`, and never read by the layout engine — the
deck the user sees is still the deck the first call produced. What "generate
once" protects is the user's content against being silently rewritten; a script
written into an empty field, which the user can then edit and which is never
overwritten once edited, does not touch that.

Anyone extending this must not use `generateNarration` as precedent for a
`regenerate this slide` button.

### Rejected

**A third panel in the editor's right dock.** `RightPanel` in `TopBar.tsx` is
still a `'theme' | null` union rather than a boolean precisely because a
narration panel once docked there, so the slot exists. But the editor's canvas
is a scrolling list of every card, all of them editable; delivering "one
read-only slide at a time" inside it means suppressing the editor rather than
building a viewer, and every future editor change would have to stay aware of a
mode that turns it off.

**A `readOnly` prop threaded through the layout components.** Twelve
hand-designed layouts would each gain a branch, and a divergent render path is
exactly the drift this codebase designs against. Read-only instead falls out of
*not providing* the editing contexts — see below.

**A boolean `edited` flag on the card.** Storing both strings makes "edited"
derivable (`text !== generated`), and a derived value cannot fall out of sync
with the thing it describes.

## Module map

```
src/pages/NarratePage.tsx                     the split shell, navigation, AbortController
src/components/narrate/SlideViewer.tsx        left column: read-only stepped slide
src/components/narrate/ScriptPanel.tsx        right column: slide list + editor + Generate all
src/components/narrate/ScriptEditor.tsx       one slide's textarea, word count, Reset
src/engine/narration.ts                       schema, derived status, the merge rule (pure)
src/lib/speakingTime.ts                       words -> estimated seconds             (pure)
src/ai/narrationPrompt.ts                     system + user prompt, response schema  (pure)
supabase/migrations/0008_add_card_narration.sql
```

`generateNarration` joins `generateDeck` on the existing `AIProvider` interface
and is implemented in `groqProvider.ts`, `geminiProvider.ts`, and
`fallbackProvider.ts`.

## Data model

```ts
// src/engine/narration.ts
export const narrationSchema = z.object({
  text: z.string(),
  generated: z.string().optional(),
})
```

added to `Card` as `narration: narrationSchema.optional()` — absent by default,
matching `textStyle`, `inline` and `adjusts`. A freshly generated deck has none;
a card gains one only when somebody generates or writes a script for it.

Two strings rather than a string and a flag:

- `text` is the script — the thing a voice will read.
- `generated` is the AI's last output for this slide, kept so Reset can restore
  it literally.

Everything else is derived, in pure functions unit-tested directly:

| State | Condition | Meaning |
|---|---|---|
| `empty` | no narration, or `text` is blank | nothing to speak |
| `generated` | `text === generated` | as the AI wrote it |
| `edited` | otherwise | the user's own words |

A blank `text` reads as `empty` even when `generated` still holds the AI's
version, because the chip has to predict what regenerating will do: a blanked
script *is* rewritten, so calling it `edited` would be a lie the user only
discovers afterwards. Reset stays available on it, so blanking is not a way to
lose the generated copy.

- **Regenerable** — `text` is blank, or `text === generated`. Both "never
  written" and "untouched since generated" get rewritten; an edited script does
  not.
- **Resettable** — `generated` exists and `text !== generated`.

A user who blanks an edited script deliberately leaves it regenerable, which is
the reading that matches the gesture.

### Persistence

Migration `0008_add_card_narration.sql`:

```sql
alter table cards add column if not exists narration jsonb not null default '{}';
```

`cardRow` gains `narration: card.narration ?? {}`. `cardFromRow` gains
`parseNarration(row.narration)`, which maps `{}` back to `undefined` for the
same reason `parseAdjusts` does: *has a narration column* is not the same
question as *has a script*, and treating every pre-existing row as narrated
would show a deck full of empty-but-present scripts.

**Consequence, and it must go in CLAUDE.md.** `cardRow` names every column on
every upsert, so once `narration` is in it, **0008 becomes required before any
card write at all** — card delete, reorder and undo/redo in the editor included,
not just narration. This is the identical trap 0006 already documents.

## Left column — the read-only viewer

Renders through the exact chain `PresentPage` uses:

```
ThemeProvider -> SlideStage -> TextStyleScope -> SlideSurface -> SlideBody -> LayoutRenderer
```

**Read-only is achieved by omission, and that is the load-bearing part.**
Editing is gated on two contexts the page simply does not provide:
`TextEditingContext` (which `CardCanvas` provides only to the selected card,
enabling typing) and the interaction half of `BlockAdjustContext` (selection
boxes, drag and resize handles). What the page *does* provide, through
`SlideBody card={card}`, is `BlockDataContext` — the data half, which is what
makes stored element nudges and bold marks render at all. That split is already
documented as load-bearing; this page is a third consumer of it and adds no new
rule.

So the viewer is faithful to the editor's rendering by construction, with no
`readOnly` prop and no second render path to drift.

Navigation mirrors `PresentPage`: ‹ › buttons, ←/→ and space keys, an
`n / total` counter, and Escape returning to `/deck/:id`. The keyboard listener
returns early when the event target is an `input` or `textarea`, or arrow keys
would step the slide while the user is typing a script.

**No fixed aspect ratio.** Cards size to their content; a long card scrolls
vertically inside the column exactly as it does in the presenter.
`aspect-video` is not reintroduced on the card container.

## Right column — the script panel

App chrome, so `app-*` tokens throughout — the `ThemeProvider` wraps the left
column only.

- A **slide list**: order index, heading, status chip (`✓ generated` /
  `✎ edited` / `— empty`) and estimated duration. Clicking a row steps the
  viewer, so the two columns are always showing the same slide.
- **Generate all scripts**, with a progress state and a Cancel while in flight.
- The current slide's script in a **textarea**, editable, with word count and
  estimated speaking time.
- **Reset to generated**, shown only when the slide is resettable, restoring
  `text` from `generated`.

Estimated duration is `lib/speakingTime.ts` at 150 wpm — the low end of
conversational narration pace, chosen because a script that runs short is a
better failure than one that overruns.

## The AI call

`generateNarration(deck, signal)` joins `generateDeck` on `AIProvider`. Putting
it on the interface rather than in a standalone helper means `FallbackProvider`
wraps it with no new machinery: the capacity-only failover rule, the
`ai/retry.ts` backoff, and the abort handling all apply unchanged, and a
missing key still drops that provider from the chain.

**Input.** Every slide is sent, including ones with edited scripts, each marked
as fixed or to-write. The model needs the whole deck to write narration that
flows *around* the kept scripts — a call that only sees the gaps produces
transitions into nothing. `contentLines()` from `engine/cardTemplates.ts`
already flattens a card to its words and is reused rather than reimplemented.

**Output.** `{ scripts: [{ index: number, text: string }] }`, validated by zod.
As with deck generation, one retry is sent with the exact zod error messages on
a validation failure.

**The merge rule, which is the whole guarantee.** `mergeNarration(cards,
scripts)` in `engine/narration.ts` applies results **only to regenerable
slides, regardless of what came back**. If the model returns text for a slide
the user has edited, it is dropped. The protection lives in that pure merge
rather than in the prompt, because a prompt is a request and this is an
invariant — and keeping it out of the provider is what makes it directly
testable. A returned index that matches no card is ignored.

**Token budget.** `max_tokens` scales with card count and clamps at 8192, as the
deck path does. An expanded script runs 90–140 words (~180 tokens); at the
`MAX_SLIDES` cap of 30 that is ~5,400 plus JSON overhead, inside the clamp.

**Cancellation.** `NarratePage` owns an `AbortController`, aborts on unmount,
and treats `signal.aborted` as a return to the idle panel rather than an error —
the same shape as `CreatePage`.

**Accepted limitation.** The creation brief (audience, tone, detail level) is
deleted with the draft once a deck is created and is not stored on the deck, so
narration infers tone from the deck's own text. Storing the brief on the
presentation row would fix it and is out of scope here.

## Persistence timing

The three rules the store already holds are what this page has to respect, not
extend:

- **Generate-all writes immediately** through `persistCardsSync` and pushes one
  undo entry. It is a structural change, like a card delete — the debounce
  exists to absorb per-keystroke churn and has nothing to absorb here.
- **Typing debounces at 500ms**, coalescing history on `narration:<cardId>` so a
  paragraph is one undo step rather than one per character.
- **`flushScheduledSaves()` on unmount**, so stepping back to the editor cannot
  outrun the last sentence typed. Navigating editor → narrate is already safe:
  `loadDeck` returns early when it holds that deck id, so the in-memory copy
  wins over a stale read.

## Testing

Following the repo's narrow-but-high-value policy — pure logic and rules with
consequences, no component tests:

- `engine/narration.test.ts` — the derived states and **the merge rule**. That
  an edited script is not regenerable protects the user's writing; that a blank
  one is covers the deliberate-blank gesture; and a model response carrying text
  for an edited slide must leave that slide untouched. The merge case is
  mutation-checked the way `fallbackProvider.test.ts`'s failover rule is: the
  test has to fail if the guard is removed.
- `store/narrationRow.test.ts` — the `narration` round-trip through
  `cardRow`/`cardFromRow`, including `{}` reading back as `undefined`.
- `lib/speakingTime.test.ts` — word counting across punctuation and whitespace.

## Out of scope

Voice cloning, audio synthesis, playback and per-slide timing. This page
produces the scripts those will read; nothing here calls a TTS service or stores
audio.
