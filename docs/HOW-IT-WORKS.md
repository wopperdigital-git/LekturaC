# How LekturaC works

A plain-language tour of the whole app, written for people rather than for the
code. It covers what happens between typing a topic and holding a `.pptx` — and,
in the most detail, **how the AI decides what each slide says**.

`CLAUDE.md` is the engineering companion to this document: same system, but
organised around the rules a developer must not break. Where the two disagree,
the code wins, then `CLAUDE.md`, then this file.

Last updated: 2026-09-20.

---

## 1. What the app is

Describe a topic once, get a finished deck, then refine and present it.

- **The AI writes the deck exactly once.** A deck's slides come from a single
  creation flow, and nothing afterwards asks a model to rewrite them. To get
  different content on a topic, you start a new project.
- **You edit everything by hand afterwards.** Text is editable in place, slides
  can be added, deleted or reordered, individual elements can be added to a slide, and any element
  can be dragged, resized or rotated. None of that calls a model.
- **The AI decides *what* a slide says; the layout engine decides *how* it
  looks.** That split is the core design rule of the app.

Accounts are required (email + password via Supabase). An account is **General**,
**Teacher** or **Student**, chosen at sign-up and permanent afterwards; teachers
and students get classroom features on top of the deck tools.

---

## 2. The journey of one deck

```
   Brief                Generation pipeline                 Deck
  ┌──────┐   ┌───────────────────────────────────┐   ┌──────────────┐
  │topic │   │ research → write → check → repair │   │ cards in the │
  │count │──►│                                   │──►│  database    │──► editor
  │who   │   │        (all before saving)        │   │  + notes     │──► presenter
  │depth │   └───────────────────────────────────┘   └──────────────┘──► .pptx
  └──────┘                                                            └► narration
```

### 2.1 The brief

`/new` asks five questions, one at a time, each revealing the next:

1. **Topic** — free text.
2. **Slide count** — a number from 1 to 10, or "let AI decide". The field opens
   on 5. Ten is the ceiling.
3. **Audience** — General, Students, or your own description.
4. **Detail level** — Simplified, Balanced or Detailed.
5. **Guidance** (optional) — what to focus on or avoid. This is treated as a
   **hard constraint** that overrides the system's own content rules.

Every keystroke is saved as a **draft** in your browser, so leaving mid-sentence
loses nothing; drafts live at `/drafts` and disappear once a deck is created.
Tone was a sixth question; it is currently fixed at "professional".

### 2.2 Generation, stage by stage

Five stages run **before the deck exists**. Nothing here can rewrite a deck you
already have.

| Stage | What happens | If it fails |
| --- | --- | --- |
| **1. Research** | One model call with a web-search tool looks up the 4–8 facts the deck most needs, and returns sources and findings with their context (value, unit, place, year, definition). | The deck is written **without** evidence. Never blocks creation. |
| **2. Plan + write** | One model call returns the whole deck as JSON: a plan for each slide *and* the slide's content, notes and factual claims. | The only stage that can fail the generation. One self-correcting retry first. |
| **3. Check** | 16 deterministic rules (plain code, no AI) inspect the deck. | — |
| **4. Repair** | At most **one** extra model call, rewriting only the worst-flagged slides (up to 4). | The unrepaired deck is kept. |
| **5. Re-check** | The rules run again so the stored quality flags describe the final deck. | — |

Research is **skipped entirely** when your guidance says to use only your own
material ("only use the facts I gave", "don't research").

The create screen shows which stage is running: *Researching sources → Writing
slides from your brief → Checking quality → Tightening N slides*.

---

## 3. How the AI decides what a slide says

This is the part most people mean by "how does it come up with that?".

### 3.1 It plans before it writes

The model is told it is **planning and writing a presentation, not an article**.
For every slide it must first produce a plan, and the plan comes *first* in the
output so it is written before the words it governs:

| Plan field | Meaning |
| --- | --- |
| `purpose` | What the slide is for — hook, context, problem, evidence, comparison, summary, call to action… (20 options) |
| `audienceQuestion` | The question in the audience's head at that moment |
| `keyMessage` | The one thing this slide must land |
| `visualType` | The best information form — timeline, bar chart, comparison, metric cards, quote… |
| `layoutFamily` | The visual shape it expects |
| `transition` | How the previous slide leads into this one |
| `importance` | essential / supporting / optional |

Everything in the slide then has to deliver `keyMessage`. This is why slides come
out about one idea instead of a dump of facts.

### 3.2 It picks a narrative arc

Three blueprints exist, taken from a slide-design study:

- **Informing & Training** — title, why it matters, the gap, core ideas,
  application, recap.
- **Persuading & Selling** — hook, problem, why now, solution, proof, offer,
  call to action.
- **Storytelling & Engaging** — what is, complication, journey, insight, what
  could be, meaning, closing line.

Each has a 10-slide master sequence and scaling tables for 5–10 slides, held
verbatim from the design document. The model is shown **all three** plus a field
playbook (e.g. "thesis defence → informing", "investor pitch → persuading") and
picks the one that fits.

The sequence is **guidance, not rails**: the model may merge or replace rows, and
is told to *skip* agenda/objectives/roadmap slides unless the deck is a formal
lesson or you asked for them. The requested slide count is still exact.

### 3.3 The writing rules

These are the rules that shape the voice, tuned against a real Gamma deck:

- **Headings are 3–10 words**, never more than 14. A label, a claim or a
  question — never "This presentation explains…" or "You will learn…".
- **Visible text is 20–40 words per slide**, 55 at most, excluding the heading.
- **Bullets are 3–5 items of 8 words or fewer**; a paragraph is 35 words or fewer.
- **One idea per slide.**
- **No filler slides** — no agenda, objectives or thank-you unless warranted.
- **The last slide resolves the objective** (summary, conclusion, recommendation
  or call to action).
- **No marketing filler.** Words like "revolutionize", "cutting-edge",
  "seamless", "leverage" and "best-in-class" are banned outright.
- **Speaker notes are 40–90 words** and must *add* to the slide — context, how a
  number was measured, a transition, a caveat — never repeat it.

### 3.4 How it handles facts

This is the part that keeps a deck honest:

- Every number, date, named statistic or quotation must come from the **evidence
  pack** the research stage produced, and must be listed in that slide's
  `claims` with the pack's source ids.
- **The model never writes a source.** It only cites ids; the app attaches the
  real source records. A citation therefore cannot be invented.
- **"Verified" is computed, not claimed.** A claim counts as verified only if it
  cites at least one id and *every* id exists in the pack.
- Metrics must state what, where, when and the unit — "battery-electric share of
  new U.S. light-duty vehicle sales, 2024", not "EV share: 5.8%".
- Tailpipe and lifecycle emissions must stay distinct; approximate evidence gets
  approximate wording; no invented decimal precision.
- Language stays calibrated — no "proves", "always", "guarantees" beyond what the
  evidence supports.
- **With no evidence pack**, the model may state only long-established facts,
  phrased approximately, and must still list them as claims with no sources.

### 3.5 What the automatic checks look for

Sixteen rules, all plain deterministic code, each producing a flag with a
severity:

| Group | Flags |
| --- | --- |
| Text | `TITLE_TOO_LONG`, `BODY_TOO_DENSE` (over 55 words), `TOO_MANY_BULLETS` (over 6), `DUPLICATE_CONTENT`, `OVERCLAIM` |
| Evidence | `UNSUPPORTED_STATISTIC`, `MISSING_SOURCE`, `OUTDATED_EVIDENCE`, `AMBIGUOUS_METRIC`, `CONFLICTING_CLAIM` |
| Structure | `LAYOUT_REPETITION` (3 in a row), `TEXT_ONLY_DECK`, `WEAK_CONCLUSION`, `FILLER_SLIDE`, `VISUAL_MISMATCH` |
| Notes | `NARRATION_DUPLICATES_SLIDE` |

Severities are deliberately cautious, because a false alarm costs a repair call
that could damage good content. A rule that cannot be sure reports `low`, which
is logged and never repaired. For instance, an unsourced statistic is *high* when
the research actually found sources, but only *low* when research was skipped or
failed — with nothing to cite, that is the documented behaviour, not a defect.

### 3.6 The repair pass

Slides carrying a high-severity flag (or a repairable medium one) are ranked, and
the worst **four at most** are sent back in a single call with their flags and
suggested fixes. The reply may only replace slides that were actually targeted —
a replacement for any other slide is thrown away, the deck's length never
changes, and a repaired slide keeps its place in the arc.

---

## 4. How a slide becomes a picture

The AI never chooses a layout. It writes **content blocks** — heading, paragraph,
bullet list, stat, quote, timeline step, comparison group — and a per-slide mood
(`structured` or `expressive`). The layout engine does the rest.

### 4.1 The classifier

A rule-based classifier (no AI) reads which block types a slide actually holds
and picks one of twelve layouts: `hero`, `statHero`, `statGrid`, `comparison`,
`timeline`, `quote`, `iconGrid`, `numberedList`, `textFocus`, `gallery`,
`standardSplit`, `standard`. The opening slide is the only one eligible for the
cinematic `hero` treatment.

### 4.2 Arrangement per run, not per slide

Blocks are grouped **at render time**: a run of consecutive stats becomes a row
of boxes, a run of timeline steps becomes a timeline rail, a bullet list becomes
chips or a numbered list. One slide can therefore hold several arrangements,
each in its place.

The grouping never reorders, drops or duplicates a block, and every block keeps
its original position — which is what lets formatting, nudges, export and
narration all keep addressing the same thing.

### 4.3 Themes

Five celestial themes (Moonlight, Cosmic Observatory, Deep Space, Solar Flare,
Aurora). Backdrops are drawn with CSS and SVG — stars, orbits, nebulae, chart
grids — never images, and each theme's sky is seeded from its name so it looks
identical every time you scroll past it. Readability governs the decoration:
stars avoid the band where headings sit, and every palette was checked for
contrast.

---

## 5. What you can do afterwards

- **Edit any text in place.** Three scopes, narrowest first: element → slide →
  deck. Click a slide to select it, click again to pick something inside it.
- **Move, resize and rotate elements** directly on the slide. An adjustment is a
  *delta from* the layout, not a replacement for it, so everything else keeps
  flowing and switching layouts keeps your nudges.
- **Add, delete or reorder slides.** A slide's type is chosen when you add it and
  does not change afterwards.
- **Add content to a slide.** *Add content* in the tools panel asks what to add
  (Heading 1/2/3, body text, bullet list, stat, quote, timeline step, comparison
  group) and puts it at the end of the slide, ready to type into. A selected list
  shows a **+** under it that grows it by one and leaves the list highlighted, and
  every selected element shows a **bin** at its corner to delete it.
- **Tools live in a panel on the right, laid out like Figma's Design tab.** The
  header holds undo/redo, Present and the zoom; below it the sections follow what
  you have selected — Layout and Content once a slide is selected, then
  Typography (font, size, style, alignment), Fill (text colour) and Theme.
  Hovering a font previews it on the slide before you commit; font size and zoom
  take a typed value; layouts and themes are rows of small pictures.
- **Undo/redo** across the whole deck (⌘Z / ⌘⇧Z), in memory for the session.
- **Present** full-screen, and **narrate**.

---

## 6. Narration

`/deck/:id/narrate` pairs a read-only slide viewer with a script panel.

Most decks arrive here **already narrated**: the speaker notes written during
generation become each slide's starting script. The page's own generate button
fills gaps or deliberately rewrites a slide, always over a set of slides you
picked — and it will never write to a slide you did not tick, whatever the model
returns. Replacing hand-written words always asks twice.

---

## 7. Export to PowerPoint

Export produces **native, editable** PowerPoint slides — real text boxes, not
pictures.

The hard part is that PowerPoint's "shrink text on overflow" only runs inside
PowerPoint. Canva, Google Slides and Keynote draw whatever size is stored, so a
box sized by hope gets clipped. The export therefore **measures and fits its own
text** before writing the file:

- text is measured in the browser in the real font, with 10% headroom for font
  substitution;
- each size steps down until the text genuinely fits, down to a floor of 10pt,
  and no word is ever dropped;
- boxes are placed from measured heights — the heading's rule sits under its real
  bottom, body text is centred in the space below, title slides are centred as a
  group.

Size caps: **title and heading 30pt, sub-heading 18pt, body 14pt**, a single
stat 54pt, stats in a grid 40pt. The title slide is set apart by weight and
layout, not size — the same approach Gamma uses.

Twelve layouts collapse onto five arrangements in the file (title, body, stat,
two-column, quote), plus a sixth path for slides whose elements you moved, which
keeps your boxes and fits the text inside them.

---

## 8. Classroom

Accounts carry a permanent type, enforced in the database rather than only in
the interface. Teachers get Classes, Students and Quizzes; students see their own
classes; a General account can join a class with a code, which promotes it to
Student in the same transaction. Quiz *creation and taking* is not built yet —
those screens show honest empty states.

---

## 9. Where things are stored

Supabase holds `presentations`, `cards`, and the classroom tables, with
row-level security scoping decks to their owner. Eleven migrations exist
(`0001` … `0011`); the generation metadata column (`0011`) stores each deck's
brief, sources, per-slide plans, claims and quality flags. Nothing reads that
column yet — it is there so the reasoning behind a deck is not lost.

Drafts are the exception: they live in your browser only, namespaced per user.

---

## 10. Which model writes the deck

Requests run down a chain, and only a capacity failure (rate limit, overload,
too-large) moves to the next link:

1. **Claude `claude-sonnet-5`** — the writer, and also where research runs
   (Claude's own paid web search tool, not a free-tier one). Present only
   when an Anthropic key is configured; billed per token, unlike the free
   tiers below.
2. **Groq `openai/gpt-oss-120b`** — the writer.
3. **Groq `groq/compound`** — a second attempt on the same key.
4. **Gemini `gemini-flash-latest`**.

If no Anthropic key is configured, the chain starts at Groq instead, and
research runs on **Groq `openai/gpt-oss-20b`** with its own built-in web
search tool. Cancelling never falls through to the next provider — pressing
Cancel really does stop the work.

Known limits on the free tiers: the writer has roughly an 8,000 token-per-minute
window, and the research model has a 20,000 token-per-day cap. When research is
out of quota, decks are still written — just without evidence, and their claims
are flagged unverified.

---

## 11. Quality control in the codebase

909 automated tests cover the pure logic: the layout classifier, the grouping
invariant, the fitting maths, the validators, the repair merge, the pipeline's
failure behaviour, the classroom statistics, the storage rules. One deliberate
component test renders every layout against a slide holding every block type and
proves each block reaches the screen exactly once — a defect that lives only in
JSX and that no pure test can see.

Type-checking, linting, tests and a production build run on every push.

---

## 12. The rules that must not be broken

If you change one thing in this codebase, know these first:

1. **Generate once.** No code path asks a model to rewrite a deck that exists.
   Research and repair run *before* the deck is saved; narration is a separate
   field that no slide renders.
2. **The AI writes; the engine lays out.** No model picks a layout.
3. **Never drop a word.** Fitting shrinks text;
   every block must reach the screen, the export and the script.
4. **Research and repair are best effort.** Neither may ever cost the user a deck.
5. **Cancel means cancel.** An abort stops the work and never fails over.
6. **A model never authors a source.** It cites ids; the app attaches the records.
