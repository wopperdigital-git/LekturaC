# Smart layout groups: arrangement per run, not per card

**Date:** 2026-09-18
**Status:** approved design for Stages 1–3; Stages 4–6 are recorded as future work
**Supersedes:** the "where grouping happens" and "path addressing" decisions of
the plan-mode plan for this revamp, which proposed storing nested groups. See
*Decisions revised* below.

## The problem

A card's layout is chosen for the **whole card**. `chooseLayout(blocks)` scans
every block and picks one of 12 components, and each component draws the block
types it understands. Any block outside the winner's vocabulary has nowhere to
go. Before Stage 0 that meant it was drawn nowhere at all, while the PPTX export
and the narration script both still carried it.

Stage 0 (`f970a98`) stopped the content loss: every layout now draws its
leftovers. But leftovers are a patch. A paragraph between two timeline steps
still gets pushed to the bottom of the card, and a card holding both a timeline
and a stat row still has to pick one of the two to present properly.

Gamma's answer, and ours, is to move arrangement from the card to the **run of
items** it describes. A card is a stack of blocks; a run of consecutive stats is
arranged as boxes, a run of timeline steps as a timeline, a bullet list as chips
or numbered rows. One card can then hold several arrangements, each in its place.

## The design

### Groups are derived at render time, never stored

A pure function, `inferGroups(blocks, hint)`, turns a card's flat block array
into a list of render nodes: a **leaf** (one block) or a **group** (a run of
same-type blocks plus the arrangement to draw them in). It runs inside the
renderer. Nothing about it is persisted.

The invariant that makes this safe:

> **`inferGroups` never reorders, drops or duplicates a block, and every block
> keeps its original index.** Flattening its output returns exactly
> `blocks.map((block, index) => ({ block, index }))`.

Because of that invariant, **nothing that addresses a block changes.** The
original index is still the `textRef` (`"4:value"`), still the `card.adjusts`
key (`"4"`), still the `data-block-index` attribute, still `selectedBlockIndex`.
The store, persistence, the PPTX export, narration and the emphasis pass are all
untouched. A block's index is fixed for the card's whole life, because nothing
in the app inserts, deletes or reorders a single block within a card — blocks
are only ever written wholesale (created, appended to by Add content, or
text-edited in place).

### Which runs become groups

| Block type | Run of | Arrangement | Why this threshold |
| --- | --- | --- | --- |
| `stat` | 2 or more consecutive | `boxes` | today's `statGrid` needs 2 |
| `timelineStep` | 2 or more consecutive | `timeline` | a one-step timeline is not a timeline |
| `comparisonGroup` | 2 or more consecutive | `columns` | comparison needs two sides |
| `image` | 2 or more consecutive | `gallery` | today's `gallery` needs 2 |
| `bulletList` | each list on its own | `chips` or `numbered` | a list's arrangement applies to its items |

A run shorter than its threshold stays as leaves. Headings, paragraphs and
quotes are always leaves.

**Runs are consecutive only.** Two stats separated by a paragraph are two leaves
and a paragraph, in that order — not a grid with the paragraph moved to the end.
The old layouts reordered content to fit their shape; this design keeps the
order the author wrote. In practice the model emits a card's stats together, so
this rarely changes what a real deck looks like.

**A bullet list's arrangement** follows the card's explicit layout when it has
one — `iconGrid` → `chips`, `numberedList` → `numbered` — so the Level 2 picker
keeps working unchanged. Otherwise it uses the classifier's existing rule:
at most 6 items, each at most 40 characters, is `chips`; anything else is
`numbered`. Both thresholds move out of `layoutEngine.ts` into exported
constants so the classifier and `inferGroups` cannot drift apart.

### Frames and families

The 12 layouts split into two kinds:

- **Families** describe how a run of items looks: `statGrid`, `timeline`,
  `comparison`, `iconGrid`, `numberedList`, `gallery`. Each becomes an
  arrangement in `GroupRenderer`, and its old component is deleted.
- **Frames** describe how a whole card looks: `hero`, `statHero`, `quote`,
  `textFocus`, `standard`, `standardSplit`. They are untouched in this work.
  `statHero` is a frame, not a family: it is a whole-card spotlight around one
  number, the same kind of thing as `hero` and `quote`.

`LayoutRenderer` still runs the classifier first. When the resolved layout is a
family, it renders the new `FlowLayout`, which draws every render node in order —
leaves through `BlockRenderer`, groups through `GroupRenderer`. Frames still get
their own component. The classifier, `layoutVarieties`, the picker,
`roleLayoutHint` and the export's `slideGroup` bucketing all keep working
because they all read `card.layout` and `resolveLayout`, which do not change.

### Staging inside Stages 1–3

`GroupRenderer` is built one family at a time. An arrangement not yet ported
renders its items as plain blocks, exactly as Stage 0's leftovers drew them, so
a card containing an unported run looks no worse than it does today. Each port
adds one family to `FLOW_LAYOUTS`, and the type system then requires that
family's entry to be removed from `LAYOUT_COMPONENTS`. The last task removes the
fallback and makes the arrangement switch exhaustive, so a new arrangement added
later cannot be silently drawn as plain blocks.

## The guard

The defect this work exists to prevent lives only in JSX: a component that
forgets to draw something. No pure function can see it. So this work adds **one
server-render test** — `components/layouts/everyBlockRenders.test.tsx` — that
renders every layout, forced and automatic, in both visual treatments, against a
card holding every block type, and asserts every block's text appears in the
markup. It is a deliberate, documented exception to the repo's "no component
tests" rule, for a defect class that has no other place to be caught. It passes
on today's code, fails if any layout's `<Leftovers>` is removed, and must keep
passing through every port.

## Decisions revised

The plan-mode plan chose **stored nested groups with dotted-path addresses**, and
rejected render-time derivation because "the screen would see groups while
export and narration still saw flat blocks, recreating the divergence this
fixes." That reason was wrong. The divergence being fixed was **missing content**,
which Stage 0 already removed; render-time grouping preserves every block and
its order, so the export and narration see the same content in the same order.
What still differs between screen and .pptx is *arrangement*, and that differed
before this work too.

Stored groups would have required changing the `textRef` format, `card.adjusts`
keys, the DOM selector, selection state, every layout's index handling, the
export and the store — roughly 30 files, where a misaddressed mark silently and
permanently bolds the wrong letters. Render-time grouping touches roughly 10 and
changes no stored format.

**What it costs:** groups always follow runs of the same type. A user cannot
hand-build an arbitrary group, move a block into a group, or group non-adjacent
blocks. None of that is in Stages 1–3, and when a hand-grouping feature is built
it will need stored groups — at which point the leaf-index scheme (address a
block by its position in a depth-first walk) keeps most stored keys valid.

## Not in this work

- The Level 2 picker offering arrangements per group (Stage 4). Until then the
  picker keeps offering varieties of the card's type, and they keep working.
- Narrowing `LayoutType` to frames (Stage 4).
- Gamma's arrows, pyramid, staircase and smart diagrams.
- Nudging a whole group as a unit — it would nest `Adjustable` holders, the bug
  `AdjustedIndexContext` exists to prevent.
- The 16:9 minimum (Stage 5) and stock images (Stage 6).
- Any change to the PPTX export's arrangement.
