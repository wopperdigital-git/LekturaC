# The AI writes structured blocks (Phase 2, part 2): design

Part 2 of Phase 2 of the slide composition upgrade (`docs/superpowers/specs/2026-11-13-slide-composition-design.md`, "Phase 2"). Part 1 (`2026-11-18-structured-blocks-design.md`, merged 2026-11-19) added a heading `kicker` and the `point`, `callout` and `code` blocks, drawn, edited and exported everywhere, but kept the model from writing them. This part teaches the deck generator to write them, and to write headings that state the slide's point.

## Why

The user wants Gamma-quality lesson slides; their own decks are teaching decks (C++). Part 1 made the pieces exist, but a new deck still arrives as headings, paragraphs and bullet lists, so nothing changes for the user until the AI uses them. "Generate once" means this only affects decks created after it ships.

## Goals

- The deck generator writes a `kicker` on most content slides, `point` runs for terms and definitions, at most one `callout` on a slide (on about one slide in three) and `code` in programming decks.
- Headings state the slide's point as a short claim.
- Two new plan visual types, `definitions` and `code_example`, bound to the blocks that draw them (the existing "visual type must match the blocks" check).
- A deterministic clean-up of the model's output (no extra call) that enforces the rules a deck must never break.
- The quality checks understand the new blocks.

## Non-goals

- Changing existing decks (generate once).
- A `plan.shape` field (the original Phase 2 idea): `plan.visualType` already names the slide's shape and is checked against its blocks, so a second field would say the same thing twice. *Decided in conversation; the user picked the approach that extends `visualType`.*
- Zone labels over runs, density chunks, diagrams (Phase 3).
- The quiz and narration prompts (they read deck text through `contentLines`, which already includes the new blocks).
- New layouts or drawing changes.

## Anti-goals

- A deck that fails, or costs an extra repair call, because of the new blocks: every rule below is either prompt guidance, a deterministic fix at ingest, or a `low` flag. None of them sends a slide to repair on its own.
- A second accent fill on a slide (the clean-up holds it to one callout).
- Invented code in a non-technical deck, and invented "definitions" that are really ordinary bullet points.
- A prompt so much longer that the free Groq backup (about 8,000 tokens a minute, input plus requested output) starts failing.

## Decided with the user (2026-11-19)

- **How often (option B, "Gamma-like")**: a kicker on most content slides, naming the topic or part of the talk; a callout on about one slide in three; term rows wherever a slide gives 2 to 6 terms with their meanings; code only in programming decks.
- **Approach 3, "prompt plus a safety net"**: the prompt teaches the blocks, and a fixed clean-up when the deck arrives repairs what the model oversteps, without an extra AI call. Rejected: prompt only (oversteps show in the deck) and converting patterns after the fact with no prompt change (brittle; cannot write a good kicker or pick the key idea).
- **Headings state the point** (approved in the original Phase 2 plan): "heading states the point, not the topic".

## Design

### Output schema (`src/generation/schemas.ts`, `src/ai/deckOutputSchema.ts`)

- `generatedBlockSchema` gains `point`, `callout` and `code`, and the generated heading keeps `kicker` (Part 1 omitted it). Strings the model writes are required non-empty (`min(1)` after trim) for `point.label`, `point.text`, `callout.text` and `code.code`; an empty optional (`callout.label`, `code.label`, `code.caption`, `kicker`) is dropped, not fatal (`.catch(undefined)` on a trimmed string, the pattern `imageQuery` uses).
- `VISUAL_TYPES` gains `definitions` and `code_example`.
- The Anthropic structured-output mirror (`deckOutputSchema.ts`) gets its **own loose shapes** for the three blocks and the kicker: plain strings, no `.trim()`, `min(1)` or `.catch` (*my call*, following that file's existing rule, the one `imageQuery` already follows). On the default chain Claude's reply is checked against the mirror first, and a mirror failure is a `response` error with no retry and no failover, so a strict mirror would let one empty string cost the whole deck; the real schema behind it keeps `min(1)` and its one retry with the exact errors.
- The tests Part 1 added that pin "the model cannot write these" are reversed: they now pin that it can, and that an `image` block still parses (the photo stage strips model-written ones).

### Prompt (`src/ai/prompts.ts`, `src/ai/repairPrompt.ts`)

Kept short: the addition to the deck system prompt targets about 1,200 characters, with a **hard cap of 1,600** pinned by a test against today's length (*my call*). If the wording does not fit, cut in this order: the SPEAKER NOTES line, then words from the visual-type binding sentence; the KICKER line, the callout line and the definitions line stay. The prompt is input on every call because the prompt is input on every call against Groq's per-minute window. The prompt keeps having no long dashes (models copy their prompt's punctuation).

- **Block list**: four more shapes: `{ "type": "heading", "text": string, "kicker"?: string }`, `{ "type": "point", "label": string, "text": string }`, `{ "type": "callout", "label"?: string, "text": string }`, `{ "type": "code", "code": string, "label"?: string, "caption"?: string }`.
- **HEADINGS** (replaces "a topic label, a clear claim, or a question"): state the slide's point as a short claim ("A for loop repeats a known number of times", not "For loops"). A question or a topic label only for the title slide or a slide that opens a part of the talk. The word limits stay.
- **KICKER**: 1 to 3 words naming the part of the talk or the topic the slide belongs to ("Loops", "Why it matters"); consecutive slides in the same part share it; on most content slides; never on the title slide; never repeating the heading.
- **VISUAL CHOICE** gains two lines: terms with their meanings (a definition each, 2 to 6 of them) → a run of `point` blocks, visual type `definitions`; a short program or command the audience must read → one `code` block, visual type `code_example`, **only when the deck's subject is programming or computing**. And: `callout` holds the slide's single most important takeaway in one sentence (label such as "Key idea", "Remember" or "Watch out"); at most one per slide, on about one slide in three; it never repeats the heading.
- **Sizes** go in the SLIDE DENSITY section from `DENSITY` (`ai/detailLevel.ts`), never as literal numbers in the system prompt: a point's meaning follows the level's `bulletWords`, a run follows `bulletItems` with a hard cap of 6, a callout's text the level's `bulletWords` + 6 (*my call*: a callout is one sentence, a little longer than a list item). Code: at most 12 lines of at most 60 characters (*my call*: what fits the code panel at the body size without clipping, measured on the gallery card).
- **SPEAKER NOTES**: one line: explain what code does; never read it out character by character.
- **A definitions slide holds only its heading, at most one short paragraph and the points; a code slide only its heading, at most one short paragraph and the code** (*my call*): anything else on it (a callout, a list, a photo) stops the slide drawing as term rows, so such slides put their callout on another slide, and IMAGES says to skip `imageQuery` for `definitions` and `code_example` slides.
- **Repair prompt** (`REPAIR_SYSTEM_PROMPT`, which today carries no block shapes): gains the same four block shapes and one compact line each for kicker, callout and the two visual types, at most about 600 characters (*my call*: a repaired slide must be able to write what the deck prompt asked for, and repair touches at most four slides, so the extra input is small).

### Safety net (`src/generation/normalizeStructured.ts`, pure, tested)

`normalizeStructuredBlocks(deck): GeneratedDeck`, run inside `generatePresentation` right after the model's reply parses and again after a repair lands, before validation, so validators and repair see the cleaned deck. It never calls a provider, never changes the slide count, and never drops words (it re-expresses them):

1. **Title slide** (card 0): drop its heading's kicker. (Any callout, point or code there is already "more than a heading and one line", which `OPENING_NOT_TITLE` sends to repair as today.)
2. **More than one callout on a card**: keep the first; each later one becomes a `paragraph` whose text is `label: text` (or `text` without a label).
3. **A lone point** (a `point` with no `point` directly before or after it): becomes a `paragraph` `**label**: text`, which ingest's `applyEmphasis` turns into a bold term (*my call*, as promised to the user: one row of a table reads as a stray). If the card then holds no point and its `plan.visualType` is `definitions`, the visual type becomes `text`, so the clean-up never creates a mismatch.
4. **A kicker over 4 words or 32 characters**: dropped (it would wrap and stop reading as an eyebrow).
5. **A card holding a `code` block**: its `imageQuery` is dropped (a photo beside code puts it in a narrow column, where 60-character lines clip).
6. **A point run longer than 6**: left as is (dropping a real definition is worse; the run draws fine) and flagged `low` (see below).

*Not* in the net (*my call*, against what the conversation floated): turning code into text in a non-programming deck. Nothing in the brief says reliably whether a deck is about programming, and a wrong guess would destroy real code. The prompt's "only when the subject is programming or computing" carries it, and a code block in such a deck is the model's own judgement.

### Quality checks (`src/generation/validation/`)

- `visibleLines`/`visibleWordCount` count point labels and meanings (they replace a bullet list and have its budget); **the kicker and the callout are not counted** (*my call*: the kicker is a 1-to-3-word label on the heading, which is already uncounted; the callout restates the slide's key message in one sentence, and counting it would push ordinary slides past the ceilings, e.g. a balanced slide of 5 points plus a callout is about 64 words against 55, sending it to repair, which the anti-goals forbid); **code is exempt** (like a timeline or quote: its words are not prose), so a code slide is never `BODY_TOO_DENSE` from its code. A card holding a `code` block is also exempt from `BODY_TOO_THIN`. **`BODY_TOO_THIN` does add a callout's words toward its minimum** (final review: the exclusion protects the ceiling, but a detailed slide built around a callout is not thin). `point` and `code` count as rich blocks for `TEXT_ONLY_DECK`.
- `VISUAL_MISMATCH`: `definitions` needs 2+ `point` blocks and `code_example` needs a `code` block, but these two cases are reported **`low`** (*my call*, from the anti-goal: the new blocks never send a slide to repair on their own); the existing cases stay medium.
- `LIST_DOMINANT`: a slide led by a point run is **not** a list slide (it draws as term rows, not bullets). The current code already treats it so; a test pins it.
- New flags, all `low` (logged, never repaired): `POINT_RUN_TOO_LONG` (more than 6), `CODE_TOO_LONG` (more than 12 lines or a line over 60 characters), `CALLOUT_REPEATS_HEADING` (normalized callout text equals or contains the heading). `QUALITY_FLAG_TYPES` and the admin page's flag breakdown (which reads stored flag types) gain them.
- No check for "heading is a claim": not reliably measurable; prompt only, like the plain-language rules.

### Token budgets

- Output grows by a few tokens per slide (a kicker, slightly longer headings). `deckMaxTokens` and `geminiDeckMaxTokens` stay as they are; the builder confirms with a measured 7-slide detailed deck on Groq that it still completes (one live run, by hand).
- Input grows by at most ~1,200 characters (about 300 tokens), inside the existing slack of Groq's window at the 7-slide cap.

### Ingest and layout

Nothing new: ingest already stores whatever blocks validate, `applyEmphasis` runs, the classifier awards `termRows` to a non-first card holding one point run with headings and paragraphs, and `structuralLayout`/`roleLayoutHint`/`varyLayouts` leave points, callouts and code alone. A card that is a heading, a kicker and one paragraph is still named `statement` (the kicker is on the heading, not a block).

## Testing

- Schema: each new block and a kicker parse; empty optionals are dropped; empty required strings fail (whitespace-only code too, with indentation kept); an `image` block still parses; the mirror accepts the same.
- Prompt: the four shapes, the HEADINGS, KICKER and VISUAL CHOICE lines, SLIDE DENSITY carrying the point and callout sizes from `DENSITY`, no long dashes, the length budget.
- `normalizeStructuredBlocks`: each rule, idempotence (running twice equals once), never changes card count, keeps every word of a converted block.
- Validators: visible-word counting, code exemptions, the two visual-type bindings, `LIST_DOMINANT` not counting point runs, the three low flags.
- Pipeline: the net runs before validation and after repair (a fake provider returning two callouts yields one callout and one paragraph in the result).
- **By hand (the user, logged in)**: generate a 5-slide C++ deck and a 5-slide non-technical deck on the default chain, and one on Groq only (unset the Anthropic key), and look at them in the editor.

## Known costs

- The model's judgement on "programming deck" is trusted for code.
- Existing decks gain nothing (generate once).
- A slightly longer prompt on every deck call.
- A second callout the safety net turns into a paragraph counts toward the word ceiling, so a slide near it can be sent to repair; this happens only when the model wrote two callouts (accepted).

## Left to the builder

- Exact prompt wording within the character budget; where the clean-up module lives; the callout label vocabulary in the prompt; how the admin page names the three new flags.
