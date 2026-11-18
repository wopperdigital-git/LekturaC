# Structured blocks (Phase 2, part 1): design

Part 1 of Phase 2 of the slide composition upgrade (`docs/superpowers/specs/2026-11-13-slide-composition-design.md`, "Phase 2"). It adds the new kinds of content a slide can hold and everything that draws, edits and exports them. Part 2 (separate design) teaches the AI to write them.

## Why

Lektura's slides read as a school project next to Gamma's because the content model is flat: a slide holds headings, paragraphs, lists, stats, quotes, steps and comparison groups, so a definition can only be a sentence, a key idea is just another paragraph and code has nowhere to go (the C++ deck shows it as prose). Phases 1 to 1b-C fixed how slides are composed and drawn; the remaining gap is what they can say. The user wants Gamma-quality lesson slides; their own decks are teaching decks (C++).

## Intent

Add four structures: an eyebrow over a heading, a term-and-meaning row, a key-idea callout and a code panel. They are usable by hand from the editor as soon as this part ships, and drawn the same on every surface (editor, thumbnails, Present, presenter, video, phone view, PPTX).

## Goals

- `heading` gains an optional `kicker` (the eyebrow).
- New `point` block `{label, text}`: a term and its meaning. A consecutive run is one table of ruled rows.
- New `callout` block `{label?, text}`: the slide's accent owner.
- New `code` block `{code, label?, caption?}`: a monospace panel on the deep ground.
- Insert menu entries for each; a plus to add a row under a selected run of points; a layout for a slide that is mostly points.
- Every surface draws them; PPTX exports them; quiz and narration deck text include them.

## Non-goals (this part)

- The AI writing any of them (Part 2): `generatedDeckSchema` and every prompt stay unchanged.
- Zone labels over runs (a list, a run of points, comparison groups): Part 2.
- `plan.shape`, claim-heading prompts, density chunks, token budgets: Part 2.
- A column arrangement for points (shown to the user and declined: rows read better). Can be added later as a variety.
- Syntax highlighting, a `language` field, marks (bold, colour) inside code.

## Anti-goals

- Breaking the block-index invariant: a run of points is several blocks, each its own index, `textRef`, `adjusts` key and selection, exactly like stats and timeline steps today. No nested item addressing.
- A second accent fill on a slide: `accentBudget.test.tsx` keeps holding at one.
- Any change to existing decks' look: a deck with none of the new blocks renders byte-identical (except where an existing test proves otherwise).

## Decided with the user (2026-11-18, browser mockups)

- **Points are ruled rows only**: term on the left (about a third of the width) in the heading font and accent colour at h3 or larger weight, meaning on the right at body size, a hairline above each row and below the last (per-element borders, since `Adjustable` is `display: contents`).
- **Strong treatment**: the callout is filled with the theme accent (`bg-slide-accent`, accent-foreground text), its label in small capitals above the text; the code panel sits on the theme's deep ground (a local `data-ground="deep"` like `beforeAfter`'s after-half, so colours re-point and picks are ignored), label above, caption below in muted deep ink. Two strong blocks on one slide is accepted.
- **Kicker**: small capitals, letter-spaced, accent colour, `SLIDE_SIZE.eyebrow`, directly above its heading with `SLIDE_GAP.tight` or less.

## Design

### Content model (`src/engine/contentBlocks.ts`)

- `heading`: optional `kicker: string`. Absent on every existing row. `textRef` field `kicker` (marks and typography keyed like `text`). Editable in place where drawn; empty after an edit = removed.
- `point`: `{type: 'point', label: string, text: string}`. `textRef` fields `label` and `text`.
- `callout`: `{type: 'callout', label?: string, text: string}`. Fields `label`, `text`.
- `code`: `{type: 'code', code: string, label?: string, caption?: string}`. Field `code` is plain text: no marks are applied (the editor refuses bold/italic/colour on it, and `applyEmphasis` never runs on it), whitespace preserved (`white-space: pre`, horizontal overflow scrolls inside the panel on the live editor and is clipped on read-only surfaces), Enter inserts a newline (as every run already does), Tab is left to the browser. `label` and `caption` are ordinary runs.
- The zod union and every exhaustive switch over block types gain the three types.

### Grouping and layout

- `inferGroups`: a consecutive run of two or more `point` blocks is one group, arrangement `rows` (new `GroupRenderer` case). A single point is a leaf drawn by `BlockRenderer` as a one-row table. Runs stay consecutive only, never reorder, drop or duplicate (`groups.test.ts` exhaustive check extended).
- New family layout `termRows` in `FLOW_LAYOUTS` (*builder check, controller's call*): the classifier awards it when the card holds exactly one run of two or more points and otherwise only headings and paragraphs (no image, stat, list, quote, step, comparison group, callout or code), and the card is not first (the first card stays `hero`). Because the signature excludes every other block type, it does not compete with any existing rule; the master-baseline stability test must show no existing card moves. Points plus a lone photo take the existing photo path (`setAsidePhoto`), drawing the run as `rows` in the text column. `cardKind`: a card whose typed content is only points is kind `list` (so the picker offers `termRows` beside the list varieties); in a mixed card points do not count toward the kind. `varyLayouts` and `roleLayout` never touch it.
- `callout` and `code` are leaves drawn by `BlockRenderer` in any layout. **No classifier exclusion** (*controller's call*): every `SlideFrame` layout draws them in the body, and every self-composing frame (`hero`, `statHero`, `quote`, `section`, `statement`) draws them through `<Leftovers>`, which draws any block type.
- `accentOwner` (*controller's call*): the first `callout` owns the accent fill in **every** layout, including those that return `null` today, ahead of the `statHero` stat and the featured comparison group. The loser draws exactly as its arrangement does when `accentIndex` is null; where no such path exists (the expressive stat hero's figure), the figure is accent text with no panel. The code panel is a ground, not an accent fill, so it never counts toward the budget.
- `compositionOf`: a run of points is one unit; a callout and a code block are one unit each. A body holding a code block stays `stack` (the panel needs width).
- `slotsOf`: unchanged; a heading's kicker belongs to the heading (drawn inside the head zone by `Heading`).
- Grounds: unchanged at slide level; the code panel's local deep ground is inside the slide.

### Drawing

- `Heading` draws the kicker above the title when present, never a fill behind it. Frames that draw their own h1 (`hero`, `section`, `statement`) draw it too, through one shared `Kicker` component (*controller's call*).
- **On a deep or tint slide** (*controller's call*): the callout keeps `bg-slide-accent`, which on a deep slide is the re-pointed (inverted) accent, the same accepted behaviour as any accent fill there. The code panel must stay distinct from its ground: on a plain or tint slide it is the local deep ground; on a deep slide it swaps to a light panel with dark ink (the builder picks tokens that survive the deep re-pointing; a test pins its text at 4.5:1 or better in every theme).
- `rows` arrangement (structured and expressive): as decided; expressive gives the term a larger step (`itemStep` rules apply to the meaning text), structured keeps hairlines; numerals none. `fill` stretches rows like other lone groups.
- Callout: rounded (`rounded-slide`), padding `SLIDE_GAP.group`, `data-accent-owner` when it is the owner, text at `SLIDE_SIZE.lead`.
- Code: rounded panel, padding `SLIDE_GAP.group`, monospace stack `'JetBrains Mono', 'JetBrains Mono Variable', ui-monospace, monospace` (JetBrains Mono is already imported for Blueprint; the video's font probe must include it), size `calc(var(--slide-size-body) * 0.85)`.
- Wireframes: `termRows` gets its own; no layout's wireframe changes for callout/code.
- Text on a photo and the deep-ground colour rules apply to the new blocks unchanged.

### Editing

- Insert menu (`ContentGrid`, `engine/newContent.ts`): Term row, Callout, Code, each with placeholder text (`isPlaceholderText`), appended at the end (the existing append-only rule). Inserting a Term row right after an existing run extends that run.
- Add-row plus (*controller's call*): with any point of a run selected, a plus is drawn under the run's **last** row (`ElementActions`, beside the existing list plus). Pressing it inserts a new `point` directly after the run, wherever the run sits, through a new pure `insertBlock` in `engine/` that is the exact inverse of `removeElement`: every later address (`textRef`, `adjusts` key, bare-index typography key, runs) shifts up by one, written immediately after dropping the card's pending `blockText:`/`inline:`/`adjusts:` saves, one undo step. Tested as a round trip with `removeElement` (insert then remove = identity). Cap with `MAX_BLOCKS`. The Insert menu itself stays append-only.
- Rows are elements like stats and steps: each is selectable and nudgeable on its own; Backspace and the bin remove only the selected row.
- Kicker: Insert has no entry; a selected heading gets an "Add small heading" action in the floating toolbar (*controller's call*), and the kicker is removed by clearing its text.
- Code typography (*controller's call*): marks (bold, italic, underline, character colour, font, size) are refused on the `code` field; element, card and deck **font** and **colour** picks never reach it (always the monospace stack, always the panel's ink); **size** picks (`fontScale`) apply. `label` and `caption` behave like ordinary runs.
- Removal (`removeElement.ts`): the three new blocks renumber like any block; removing a kicker's text clears the field.
- Card templates: no new card type in `CardTypeModal`; `contentLines` includes point (label: text), callout (text), code (its lines), kicker.

### Other readers

- Quiz and narration deck text (`quizPrompt`, `narrationPrompt` inputs via `contentLines` or their own flatteners): include the new text; code is sent as-is (it is short; the existing per-slide character caps apply).
- Narrated video, presenter, phone view: drawn through the same layouts, nothing extra.
- PPTX (`src/export/`, read its "Implementation invariants" first): a run of points as a two-column table or two aligned text columns with rules; a callout as an accent-filled rounded rectangle with text; code as a monospace text box (Courier New or Consolas face) on a deep-coloured rectangle; kicker as a small accent paragraph above the heading. Fit through the existing text fitter. `GROUP_BY_LAYOUT` maps `termRows` to `body` (or a new arrangement if the export needs one). **The `adjusted` path (any nudged element) draws all four too** (*controller's call*), or they would vanish from nudged cards; a code panel on a deep slide uses the same light panel as on screen.
- Fact check, generation meta: unaffected (no AI writes these yet).

## Testing

- Pure: schema round-trip; `inferGroups` with point runs (exhaustive invariant); `chooseLayout` awards `termRows` exactly on its signature and nothing else moves (the master-baseline stability test pattern); `accentOwner` with a callout; `compositionOf` units; `newContent`/add-row append-only; `removeElement` renumbering; `contentLines`; export renderers.
- Render: `everyBlockRenders` kitchen sink gains a point run, a callout, a code block and a kicker (every layout, both treatments, each text exactly once); `accentBudget` (callout owner, still one); `noHeadingFill` (kicker never filled); `redrawRules`-style test for rows; the class-token scan; wireframe test for `termRows`.
- Gallery: new `GALLERY_DECK` cards for rows, callout, code and a kicker; browser check on `/dev/slides` in Bordo (both treatments), Deep Space and Chalkboard.

## Known costs

- Existing decks gain nothing until edited by hand (generate once); Part 2 makes the AI write them for new decks.
- The code panel on a narrow phone view clips long lines.
- A deck exported to PPTX shows the new blocks in the export's own simpler drawing.

## Left to the builder

- Exact control for adding a kicker; placeholder strings; the PPTX table vs. columns choice; the deep-ink muted shade for the caption; how `GroupRenderer` names the rows component.
