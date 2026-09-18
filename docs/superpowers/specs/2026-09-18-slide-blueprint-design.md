# Slide blueprints: structure follows goal

**Date:** 2026-09-18
**Status:** approved design, not yet implemented
**Source:** the user's "Slide Deck Blueprint" doc (2026-09-17), which collects three
research-backed deck structures and their 5–10 slide scaling tables.

## The problem

Generation today asks for a slide *count* and nothing about the deck's *purpose*.
The model receives topic, audience, detail level and guidance, then writes N
cards in whatever order it likes. The blueprint doc's central claim is that this
is the wrong first question:

> Structure follows goal, not habit. The slide order that works for teaching
> (build context, then understanding, then recap) is a different shape from the
> order that works for selling (build tension, then desire, then close).

So a lecture and an investor pitch on the same topic currently come out as the
same shape. They should not.

## Goals

1. Every generated deck follows one of three sequences, chosen for its goal.
2. The sequence is exact for the requested slide count, not approximated — the
   doc's scaling tables are the product, and they are reproduced verbatim.
3. The doc's content rules (assertion-evidence, one idea per slide, 7±2 items)
   apply to every deck in every blueprint.
4. A blueprint's structural slides render structurally — a closing line should
   not come out as a generic standard slide.

## Non-goals, and things explicitly unchanged

- **The generate-once rule stands.** This changes what the single creation call
  asks for. It adds no regenerate path and no second content call.
- **No new brief question.** The blueprint is inferred (decided below).
- **No database migration.** Roles are used at ingest and discarded.
- **No change to** the twelve layout components, the stored card schema, the
  PPTX export, or narration.

## Decisions taken (and what they rule out)

| Decision | Chosen | Rejected, and why |
| --- | --- | --- |
| Who picks the blueprint | **The model**, from topic + audience + detail level, guided by the field playbook | A brief question — explicit, but adds a step straight after tone was removed |
| Slide roles | **Returned per card, validated, used at ingest, then discarded** | Prompt-only (nothing verifies the sequence, no layout benefit); stored in a column (nothing downstream reads it yet) |
| Counts below 5 | **Compress the 5-slide column** | Falling back to the old unstructured prompt (deck character changes at an invisible threshold); raising the floor to 5 (reverses a decision made two tasks ago) |
| `'auto'` | Model picks 5–10, as today, and follows that column | Always producing the 10-slide master |

## Architecture

### 1. `src/ai/slideBlueprints.ts` — the doc as data

Pure. No React, no store, no provider — so every sequence is checkable without
running a generation. This is the whole reason it is a module and not string
literals inside the prompt builder.

```ts
export type BlueprintId = 'inform' | 'persuade' | 'story'

/** One slide's place in a sequence. */
export interface SlideSpec {
  /** Stable id the model echoes back on the card, e.g. 'core-idea-1'. */
  role: SlideRole
  /** What the doc calls it, e.g. 'Gap + objectives'. Shown to the model. */
  label: string
  /** The doc's one-line instruction for this slide. */
  instruction: string
}

export interface Blueprint {
  id: BlueprintId
  name: string            // 'Informing & Training'
  useFor: string          // 'lectures, training sessions, onboarding, …'
  logic: string           // the doc's paragraph on why this order works
  master: SlideSpec[]     // exactly 10
  /** The doc's scaling table: key = slide count 5..10. */
  columns: Record<5 | 6 | 7 | 8 | 9 | 10, SlideSpec[]>
}

export const BLUEPRINTS: Record<BlueprintId, Blueprint>
export function sequenceFor(id: BlueprintId, count: number): SlideSpec[]
export const FIELD_PLAYBOOK: PlaybookEntry[]
```

A merged row ("Problem + why now") is one `SlideSpec` with its own role
(`problem-why-now`), not two — it is one slide, and the model must return one
card for it.

#### The three master sequences (verbatim from the doc)

**Informing & Training** — lectures, training, onboarding, status reports,
internal briefings, how-to decks. Opens with context (SCQA), states a roadmap,
teaches in self-contained chunks, closes with the three-part summary.

1. Title + roadmap · 2. Why this matters · 3. The gap · 4. Objectives ·
5. Core idea 1 · 6. Core idea 2 · 7. Core idea 3 · 8. Application · 9. Recap ·
10. Next steps

**Persuading & Selling** — sales pitches, investor decks, client proposals,
marketing. AIDA fused with the Kawasaki problem/solution pitch.

1. Hook · 2. The problem · 3. Why now · 4. The solution · 5. How it works ·
6. Proof · 7. Why us · 8. The offer · 9. Handling hesitation ·
10. Call to action

**Storytelling & Engaging** — conference talks, keynotes, brand story,
portfolio, motivational talks, case-study narratives. Duarte's
"what is" / "what could be" oscillation over a three-act shape.

1. Hook · 2. What is · 3. Complication · 4. The journey · 5. The insight ·
6. What could be · 7. Meaning · 8. Proof · 9. Call to action ·
10. Closing line

> **The source doc contradicts itself here, and the table wins.** Its prose
> master list has Proof at 7 and Meaning at 8; its scaling table — the one
> headed "verbatim" — has Meaning at 7 and Proof at 8. The implementation
> follows the table, so `master` equals the 10-slide column for all three
> blueprints, which is an invariant worth having. Nothing generated differs
> either way: `sequenceFor(id, 10)` returns the *column*, and `master` is used
> only for the role vocabulary.

#### The scaling tables (verbatim)

Informing & Training:

| # | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Title + why it matters | Title + why it matters | Title + roadmap | Title + roadmap | Title + roadmap | Title + roadmap |
| 2 | Gap + objectives | Gap + objectives | Why it matters | Why it matters | Why it matters | Why it matters |
| 3 | Core content (main idea) | Core idea 1 | Gap + objectives | Gap + objectives | Gap | Gap |
| 4 | Application | Core idea 2 | Core idea 1 | Core idea 1 | Objectives | Objectives |
| 5 | Recap + next steps | Application | Core idea 2 | Core idea 2 | Core idea 1 | Core idea 1 |
| 6 | | Recap + next steps | Application | Core idea 3 | Core idea 2 | Core idea 2 |
| 7 | | | Recap + next steps | Application | Core idea 3 | Core idea 3 |
| 8 | | | | Recap + next steps | Application | Application |
| 9 | | | | | Recap + next steps | Recap |
| 10 | | | | | | Next steps |

Persuading & Selling:

| # | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Hook | Hook | Hook | Hook | Hook | Hook |
| 2 | Problem + why now | Problem + why now | Problem + why now | Problem + why now | Problem + why now | Problem |
| 3 | Solution + how it works | Solution + how it works | Solution + how it works | Solution | Solution | Why now |
| 4 | Proof + why us | Proof + why us | Proof + why us | How it works | How it works | Solution |
| 5 | Offer + handling + CTA | Offer + handling | Offer | Proof + why us | Proof | How it works |
| 6 | | Call to action | Handling | Offer | Why us | Proof |
| 7 | | | Call to action | Handling | Offer | Why us |
| 8 | | | | Call to action | Handling | Offer |
| 9 | | | | | Call to action | Handling |
| 10 | | | | | | Call to action |

Storytelling & Engaging:

| # | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Hook | Hook | Hook | Hook | Hook | Hook |
| 2 | What is | What is + complication | What is | What is | What is | What is |
| 3 | Journey + insight | Journey | Complication | Complication | Complication | Complication |
| 4 | What could be + meaning | Insight | Journey | Journey | Journey | Journey |
| 5 | Closing | What could be + meaning | Insight | Insight | Insight | Insight |
| 6 | | Closing | What could be + meaning | What could be + meaning | What could be | What could be |
| 7 | | | Closing | Proof | Meaning | Meaning |
| 8 | | | | Closing | Proof | Proof |
| 9 | | | | | Closing | Call to action |
| 10 | | | | | | Closing line |

#### Compression below 5 slides

`sequenceFor` handles 1–4 by compressing the **5-slide column**, which is
already the doc's own most-compressed shape:

- Always keep the **first** row (the opening: title/context or hook) and the
  **last** row (the close: recap+next steps, offer+handling+CTA, or closing).
- Fill the remaining `count - 2` from the middle rows **in order**.
- `count === 1` → the first row only. A single slide is a title slide.
- `count === 2` → first and last.

So a 3-slide Informing deck is: Title + why it matters · Core content ·
Recap + next steps. Recognisably the blueprint, thinner. Pure and tested.

Above 10 it clamps to the 10-slide column. `slideCountProblem` already refuses
those, so this is defensive only — but `sequenceFor` is the thing the prompt
depends on for its row count, and it must be total rather than return
`undefined` for an input the UI is currently trusted to prevent.

### 2. Prompt changes (`src/ai/prompts.ts`)

**System prompt** gains the doc's content rules, which apply to every deck:

- Every heading is a **full-sentence assertion**, not a topic phrase
  ("Retention drops after 15 minutes", not "Retention").
- **One idea per slide**, with supporting evidence for that one idea.
- **At most 7±2 items** on a slide.

> **Conflict resolved here:** assertion-evidence asks for "one supporting
> visual or short data point". The existing CONTENT QUALITY RULES deliberately
> treat numbers as **opt-in** so the model stops inventing statistics. The
> assertion rule is therefore worded so evidence may be an example, mechanism
> or explanation — a figure only when the user's material supports one. Without
> this, the change reintroduces invented figures into every deck.

**User prompt** gains a blueprint-selection section, because the model is the
one choosing:

1. The three blueprints with their `useFor` and `logic` lines.
2. The condensed field playbook (field → presentation type → best-fit
   blueprint), so "thesis defense" and "investor pitch" land correctly.
3. **The candidate sequences, each row labelled with its role id.**
4. The instruction: pick the one blueprint that fits, then produce exactly one
   card per row of that blueprint's sequence, in order, echoing each row's role.

**An exact count and `'auto'` differ only in what step 3 sends**, and this is
the one place the two paths diverge:

- **Exact count (1–10):** the three sequences at that count, one column each.
  ~+600 tokens.
- **`'auto'`:** all three blueprints' full 5–10 tables, plus the instruction to
  choose *both* a blueprint and a count in 5–10 and then follow that column
  exactly. ~+1200 tokens, since the cells are short labels.

`'auto'` cannot be resolved client-side first without throwing away the model's
judgment about the topic's depth, which the decision above keeps. The
alternative — sending only the 10-slide masters and asking the model to merge
rows itself — was rejected: the merges *are* the doc's content, and a model
inventing its own would make the exactness this spec is built on a fiction.

Both bound *input* tokens; `max_tokens` bounds output and is unaffected.

Rejected: a two-call "pick the blueprint, then generate" flow. It doubles
latency and failure surface for a choice the model can make inline, and a
failure between the calls leaves the user with nothing.

### 3. Response schema (`src/ai/provider.ts`)

- Deck gains `blueprint: 'inform' | 'persuade' | 'story'`.
- Each card gains `role: string`.

**Shape is validated strictly; sequence is not.** A missing field or a bad
blueprint id fails validation and takes the existing single self-correcting
retry (the one that returns the zod errors to the model). But a deck whose
roles do not match the chosen blueprint's sequence — wrong order, a skipped
row, an unknown role — **still ingests**, with a `console.warn`. Nothing here
can be regenerated, so a near-miss must not cost the user their deck.

### 4. Ingest: roles to layouts (`store/presentationStore.ts`)

`roleLayoutHint(role, blocks)` runs inside `createDeckFromGeneration`, next to
`applyEmphasis`, and writes an explicit `card.layout` only where the role makes
the layout unambiguous **and** the card's blocks support it:

| Role | Layout | Guard |
| --- | --- | --- |
| `hook`, `title-roadmap`, `title-why-matters` | `hero` | first card, or a card with a heading and at most one paragraph |
| `insight`, `closing-line`, `closing` | `hero` | heading + at most one paragraph |
| `recap` | `numberedList` | has a `bulletList` |

Everything else keeps `layout: 'auto'` and goes through `chooseLayout` exactly
as now.

**Why this is worth doing:** `chooseLayout` awards `hero` only when
`context.isFirstCard`, so today a closing line or an insight slide — the two
most deliberately dramatic slides in the story blueprint — render as generic
standard slides. The role is the only thing that knows they are different.

The written layout is a normal explicit layout, so the Level 2 picker can still
override it and `cardKindOf` already reports named layouts correctly.

### 5. What the user sees

Nothing new in the brief. The deck simply arrives in a coherent order. The
chosen blueprint is not surfaced in the UI (it is discarded after ingest) —
deliberately, since with nothing able to regenerate, showing a label the user
cannot act on only invites "change it to Persuading" requests the app cannot
serve.

## Testing

`src/ai/slideBlueprints.test.ts`, pure-logic only per repo convention:

- Every blueprint's `master` has exactly 10 entries.
- For every blueprint and every count 5–10, the column matches the doc's table
  row for row (the table above is the fixture).
- For every blueprint and every count 1–10, `sequenceFor` returns exactly
  `count` specs — the bound the prompt depends on.
- Compression keeps the first and last rows at every count ≥ 2.
- Every role in every column exists in that blueprint's role vocabulary, so a
  typo in a table cannot silently create an unvalidatable role.
- Role ids are unique within a blueprint (they address cards positionally).

Not tested (no component tests in this repo): the prompt string itself, and the
ingest layout mapping — though `roleLayoutHint` is pure and cheap to test, so
it gets a small table test alongside.

## Risks

1. **The model ignores the sequence.** Mitigated by warning-not-rejecting, so
   the deck still lands. Worth watching in the first few real generations.
2. **Prompt growth.** +600 tokens for an exact count, +1200 for `'auto'`.
   Groq's free tier may count prompt tokens against its per-minute window
   (unconfirmed, noted in CLAUDE.md); if so this brings that ceiling slightly
   closer, and `'auto'` brings it closer than an exact count does. It surfaces
   as a 429, which does fail over to Gemini.
3. **Three blueprints may not cover a deck.** The playbook has no "none of
   these" row. The model must pick one, so an odd topic gets the nearest fit
   rather than an unstructured deck. Accepted: the doc's position is that every
   deck has one of these three goals.

## Follow-on work, explicitly out of scope

- Storing `role` (migration + editor affordance) once something reads it.
- Surfacing or overriding the blueprint in the UI, which needs a regenerate
  path to be useful.
- Per-blueprint narration guidance.
