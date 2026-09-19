# Lektura Content Generation Improvement Specification

## Purpose

This document is an implementation instruction for Claude Code.

The goal is **not to redesign one presentation**. The goal is to improve the **system-wide principles, content-generation pipeline, planning logic, factual reliability, visual reasoning, and quality control** used by Lektura whenever it creates a presentation.

Treat this as a product-level generation specification.

The current weakness is that a language model can produce content that is:
- factually plausible but wrong,
- too generic,
- too text-heavy,
- repetitive in structure,
- weakly connected from slide to slide,
- based on outdated information,
- poorly sourced,
- written like an AI report instead of a presentation,
- visually under-specified,
- and insufficiently aware of the purpose of each slide.

The system must move from:

`prompt -> generate slide text -> place into templates`

toward:

`understand request -> research/extract -> verify -> plan narrative -> plan slide purposes -> choose evidence -> choose visual form -> generate concise content -> validate -> render`

---

# 1. Core Product Principle

Lektura must not treat a presentation as a collection of independent slides.

A presentation is a **structured argument, explanation, lesson, report, or story**.

Every generated deck must have:

1. a clear audience,
2. a clear objective,
3. a coherent narrative,
4. evidence appropriate to the claims,
5. slide-to-slide progression,
6. intentional visual communication,
7. concise presentation-style writing,
8. source grounding where facts are used,
9. and a conclusion that resolves the presentation.

The system should generate **presentation content**, not simply summarize a topic into boxes.

---

# 2. High-Level Generation Pipeline

Refactor or extend the generation pipeline so the logical stages are separated.

Recommended pipeline:

```text
INPUT
  |
  v
1. REQUEST ANALYSIS
  |
  v
2. RESEARCH / SOURCE EXTRACTION
  |
  v
3. CLAIM EXTRACTION + VERIFICATION
  |
  v
4. NARRATIVE / DECK PLANNING
  |
  v
5. SLIDE PURPOSE PLANNING
  |
  v
6. VISUAL COMMUNICATION PLANNING
  |
  v
7. SLIDE CONTENT GENERATION
  |
  v
8. DECK-LEVEL QUALITY REVIEW
  |
  v
9. SLIDE-LEVEL QUALITY REVIEW
  |
  v
10. RENDERING
```

These do not necessarily need to be separate expensive AI agents.

They may be implemented as:
- separate model calls,
- one structured model call with multiple stages,
- deterministic validation code,
- or a hybrid.

Prefer deterministic validation whenever possible.

---

# 3. Request Analysis

Before creating slides, derive a `PresentationBrief`.

Example schema:

```ts
interface PresentationBrief {
  topic: string;
  objective: string;
  audience: string;
  audienceKnowledgeLevel: "beginner" | "intermediate" | "advanced";
  presentationType:
    | "educational"
    | "persuasive"
    | "informational"
    | "report"
    | "project"
    | "pitch"
    | "tutorial"
    | "comparison"
    | "other";
  desiredSlideCount?: number;
  tone: string;
  sourceMode: "user_material_only" | "research_allowed" | "mixed";
  freshnessRequired: boolean;
  keyQuestions: string[];
  constraints: string[];
}
```

If audience or presentation type is not explicitly provided, infer conservatively from the request.

Do not invent highly specific audience information without evidence.

---

# 4. Narrative Planning

Generate a deck outline **before generating slide copy**.

The outline must answer:

- What does the audience need to know first?
- What context is necessary?
- What are the major ideas?
- What evidence supports those ideas?
- What should the audience understand at the end?
- What information can be removed without weakening the presentation?

Each slide should exist for a reason.

Example slide-purpose types:

```ts
type SlidePurpose =
  | "hook"
  | "title"
  | "context"
  | "problem"
  | "definition"
  | "overview"
  | "timeline"
  | "process"
  | "concept_explanation"
  | "evidence"
  | "data"
  | "comparison"
  | "case_study"
  | "example"
  | "diagram"
  | "summary"
  | "recommendation"
  | "conclusion"
  | "call_to_action"
  | "references";
```

Every planned slide should contain:

```ts
interface SlidePlan {
  index: number;
  purpose: SlidePurpose;
  audienceQuestion: string;
  keyMessage: string;
  supportingPoints: string[];
  evidenceNeeded: boolean;
  preferredVisualType: VisualType;
  transitionFromPrevious: string;
  importance: "essential" | "supporting" | "optional";
}
```

---

# 5. Principle: One Main Idea Per Slide

Each slide must communicate one dominant idea.

The slide title and content should support that idea.

Avoid slides that combine unrelated information just because it fits.

Bad:
- history + market share + environmental impact on one slide.

Good:
- one slide explains historical transition,
- another shows market growth,
- another compares emissions.

If several bullets do not support one common message, split or reorganize the slide.

---

# 6. Principle: Titles Must Communicate, Not Ramble

Avoid long AI-style titles.

Target:
- ideally 3–10 words,
- maximum around 12–14 words unless necessary.

Titles may be:
- topic labels,
- clear claims,
- questions,
- or concise takeaways.

Avoid repetitive constructions such as:

- "X is reshaping Y and Z"
- "X highlights clear advantages"
- "Modern breakthroughs accelerated..."
- "This slide explains..."
- "You will learn..."

Do not write the presentation as if it were an AI-generated report.

Prefer direct wording.

Example:

Bad:
> Global EV sales have surged to a significant share of new car registrations

Better:
> EV adoption is accelerating

The slide content should prove the title.

---

# 7. Principle: Do Not Generate Filler Slides

Do not automatically create slides such as:
- "Objectives"
- "Agenda"
- "What you will learn"
- "Introduction"
- "Background"
- "Thank you"

unless they are actually useful for the requested presentation type.

Examples:

Educational lesson with explicit learning outcomes:
- Objectives slide may be appropriate.

Short 6-slide topic presentation:
- Objectives slide is probably unnecessary.

Pitch deck:
- Agenda is often unnecessary.

The planner must evaluate whether a slide adds informational value.

---

# 8. Principle: Evidence Before Claims

When a slide makes a factual claim, the system should identify evidence.

Internally represent claims separately from prose.

Example:

```ts
interface Claim {
  id: string;
  statement: string;
  type:
    | "statistic"
    | "historical"
    | "scientific"
    | "comparison"
    | "definition"
    | "general_fact"
    | "opinion";
  sourceIds: string[];
  confidence: number;
  timeSensitive: boolean;
  verified: boolean;
}
```

Do not allow unsupported statistics to silently pass into the final deck.

---

# 9. Source Grounding

For researched presentations, each non-trivial factual claim should be traceable to a source.

Recommended source object:

```ts
interface Source {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  publicationDate?: string;
  accessedAt?: string;
  sourceType:
    | "government"
    | "academic"
    | "official"
    | "industry"
    | "news"
    | "user_file"
    | "other";
  reliabilityScore?: number;
}
```

Preferred source order:

1. government / official datasets,
2. peer-reviewed / academic,
3. official organization reports,
4. reputable industry reports,
5. established news organizations,
6. secondary summaries.

Avoid basing important claims on random blogs when stronger sources exist.

---

# 10. Freshness Rules

If the presentation contains terms such as:
- today,
- current,
- latest,
- recent,
- modern,
- this year,
- current market,
- current trends,

the system should prefer the latest reliable data available.

Add a freshness check.

Example:

```ts
if (brief.freshnessRequired && sourceIsOutdated(claim)) {
  flag("OUTDATED_EVIDENCE");
}
```

Do not present a 2022 statistic as "today" if newer reliable data is available.

Historical presentations are exempt when old data is intentionally being discussed.

---

# 11. Ambiguous Metrics Must Be Defined

Statistics must include enough context to be meaningful.

A number should answer:

- what is being measured?
- what population?
- what geography?
- what year?
- what unit?
- what definition?

Bad:
> EV share: 5.8%

Better:
> Battery-electric vehicles accounted for X% of U.S. new light-duty vehicle sales in YEAR.

Avoid mixing:
- EV vs BEV,
- registrations vs sales,
- passenger vehicles vs all vehicles,
- global vs U.S.,
- nominal vs real prices,
- tailpipe vs lifecycle emissions.

---

# 12. Distinguish Tailpipe and Lifecycle Claims

For environmental comparisons, do not oversimplify.

Example:

Bad:
> EVs produce 0 g CO₂.

Better:
> Battery-electric vehicles have zero tailpipe CO₂ emissions, while lifecycle emissions depend on electricity generation, manufacturing, battery production, vehicle lifetime, and other factors.

The level of detail should match the audience.

---

# 13. Avoid False Precision

Do not fabricate or over-specify numbers.

If evidence only supports an approximate value, use:
- about,
- roughly,
- approximately,
- nearly,
- more than,
- less than.

Never invent decimal precision to make a claim appear authoritative.

---

# 14. Contradiction Check

Before rendering, compare claims across slides.

Detect:
- duplicated numbers with different values,
- inconsistent dates,
- conflicting definitions,
- contradictory conclusions.

Example validator:

```text
Slide 4: "EV share was 10% in 2022"
Slide 6: "EV share was 14% in 2022"

=> FLAG: SAME_METRIC_CONFLICT
```

---

# 15. Visual Communication Is Part of Content Generation

Do not generate text first and leave visual design as an afterthought.

For every slide, determine the best information form.

Visual types:

```ts
type VisualType =
  | "hero_image"
  | "photo"
  | "illustration"
  | "timeline"
  | "bar_chart"
  | "line_chart"
  | "pie_chart"
  | "donut_chart"
  | "scatter_plot"
  | "map"
  | "comparison_table"
  | "two_column_comparison"
  | "process_flow"
  | "diagram"
  | "icon_grid"
  | "metric_cards"
  | "quote"
  | "text"
  | "mixed";
```

Ask:

> Can this information be understood faster through a visual than through prose?

If yes, prefer the visual.

Examples:

Historical sequence:
- timeline

Growth over years:
- line or bar chart

Two alternatives:
- comparison table or two-column layout

Geographic distribution:
- map

Process:
- flow diagram

Four categories:
- icon grid

One strong statistic:
- metric + supporting visual

---

# 16. Charts Must Match the Claim

Do not generate charts only for decoration.

Examples:

Claim:
> adoption increased rapidly over time

Use:
- line chart,
- bar chart.

Do not use:
- three disconnected KPI cards if the point is growth.

Claim:
> A is larger than B

Use:
- side-by-side bars.

Claim:
> composition of a whole

Use:
- donut/pie only when category count is small and proportions are meaningful.

---

# 17. Avoid "Cardification"

Do not put every idea inside a rounded rectangle.

Cards are useful when:
- grouping distinct items,
- showing metrics,
- comparing categories,
- representing steps.

Cards are not a default layout.

The content planner should not assume:

`every bullet = one card`

or:

`every slide = heading + rounded container`

The layout system should support whitespace and different compositions.

---

# 18. Layout Diversity

Add a deck-level diversity constraint.

Avoid more than 2 consecutive slides with essentially the same composition.

Track layout family.

Example:

```ts
interface LayoutMetadata {
  family:
    | "hero"
    | "list"
    | "timeline"
    | "data"
    | "comparison"
    | "visual_left"
    | "visual_right"
    | "full_visual"
    | "process"
    | "grid"
    | "quote"
    | "summary";
}
```

Validator:

```text
if 3 consecutive slides use same layout family:
    flag LAYOUT_REPETITION
```

This is a soft rule, not an absolute rule.

Do not force useless variety.

---

# 19. Text Density Rules

Use concise presentation language.

Suggested defaults:

```text
Title:
- ideal: <= 10 words
- soft maximum: 14 words

Body:
- target: 20–50 words per slide
- soft maximum: ~70 words

Bullets:
- target: 3–5
- ideal bullet length: <= 12 words
```

Exceptions:
- timeline,
- references,
- code,
- quotations,
- technical definitions,
- user-requested detailed slides.

Do not reduce clarity just to satisfy a word count.

---

# 20. Presentation Copy Should Be Scannable

Avoid:
- full paragraphs,
- repeated prose,
- verbose qualifiers,
- redundant explanations.

Prefer:
- concise phrases,
- short evidence statements,
- labels,
- visual annotations,
- comparison rows,
- captions.

Presenter narration can contain detail that does not belong on the slide.

Important Lektura principle:

> Slide content and narration content should be generated separately.

The slide is for scanning.
The narration is for explanation.

Do not put the full narration onto the slide.

---

# 21. Generate Narration Separately

For every slide, store:

```ts
interface GeneratedSlide {
  title: string;
  visibleContent: SlideContent;
  speakerNotes: string;
}
```

Speaker notes may:
- explain context,
- expand statistics,
- give transitions,
- define terms,
- mention source limitations.

Visible content should remain concise.

---

# 22. Slide-to-Slide Transitions

The deck planner should maintain continuity.

Each slide should logically answer a question raised by the previous one.

Example:

```text
Why does this topic matter?
        ->
How did we get here?
        ->
What changed?
        ->
What does the data show?
        ->
How does it compare?
        ->
What does this mean?
```

Avoid a deck that feels like unrelated search results.

---

# 23. Opening Slide Principles

The opening should establish:
- topic,
- relevance,
- scope.

Avoid generic phrases such as:

> This presentation explains...

Prefer:
- concise title,
- clear framing statement,
- relevant hero visual where appropriate.

Do not overload the title slide.

---

# 24. Ending Slide Principles

The deck should not stop abruptly after the last information slide.

For most informational decks, include a meaningful ending:
- key takeaway,
- summary,
- implications,
- next steps,
- recommendations,
- conclusion.

Do not automatically add a generic "Thank You" slide unless requested or appropriate.

---

# 25. Educational Deck Principles

When the audience is students:

- define unfamiliar terms,
- build complexity gradually,
- use examples,
- prefer concrete visuals,
- avoid unexplained jargon,
- reinforce key ideas,
- ensure factual claims are teachable and sourced.

Learning objectives should be included only when:
- the user requests them,
- the deck is designed as a formal lesson,
- or they materially improve the learning structure.

---

# 26. Avoid Overclaiming

The generator should not convert limited evidence into absolute conclusions.

Avoid:
- "proves"
- "always"
- "clearly superior"
- "best"
- "guarantees"
- "completely eliminates"

unless the evidence genuinely supports the wording.

Prefer calibrated language:
- suggests,
- is associated with,
- tends to,
- can,
- may,
- in this dataset,
- under these conditions.

---

# 27. Separate Fact From Interpretation

Store them distinctly when possible.

Example:

```ts
{
  fact: "Sales increased from X to Y between YEAR and YEAR.",
  interpretation: "This indicates rapid market expansion."
}
```

The interpretation may appear in the slide title while the evidence appears in the chart.

Do not generate interpretation without supporting evidence.

---

# 28. Source Display Strategy

Do not clutter slides with full URLs.

Use short citations:

```text
Source: IEA, 2025
```

or:

```text
Sources: IEA; U.S. DOE
```

Maintain full metadata in the presentation project.

Optionally generate a references slide for research-heavy decks.

---

# 29. User-Provided Files

If the presentation is based on PDFs, documents, or user uploads:

1. treat those files as the primary source,
2. preserve the author's intended meaning,
3. do not silently replace their claims with unrelated web research,
4. distinguish source material from added external research,
5. cite the uploaded source internally.

If the user requests "use only this file", do not introduce outside claims.

---

# 30. YouTube Input

For YouTube-based presentations:

- extract major claims and structure from the transcript,
- do not assume every speaker claim is factually correct,
- distinguish "the video states..." from independently verified facts,
- optionally verify factual claims if research is permitted.

---

# 31. Generation Output Schema

Prefer structured output from the model.

Example:

```json
{
  "deck": {
    "title": "...",
    "objective": "...",
    "audience": "...",
    "narrative": "...",
    "slides": [
      {
        "index": 1,
        "purpose": "hook",
        "title": "...",
        "keyMessage": "...",
        "visibleContent": {
          "type": "minimal",
          "items": []
        },
        "visualPlan": {
          "type": "hero_image",
          "description": "...",
          "reason": "..."
        },
        "speakerNotes": "...",
        "claims": [],
        "sources": [],
        "layoutFamily": "hero"
      }
    ]
  }
}
```

Do not rely on free-form markdown from the model if structured JSON can be used safely.

Validate model output with a schema.

---

# 32. Quality Review Stage

After the full deck has been generated, run a review pass.

The review should inspect the entire deck, not each slide independently.

Checks:

```text
[ ] Is the deck logically ordered?
[ ] Does every slide have a clear purpose?
[ ] Are any slides redundant?
[ ] Are any slides filler?
[ ] Are titles concise?
[ ] Are factual claims sourced?
[ ] Are time-sensitive claims current?
[ ] Are metrics correctly defined?
[ ] Are claims internally consistent?
[ ] Are visuals appropriate to the information?
[ ] Are charts used when trends are discussed?
[ ] Is the deck too text-heavy?
[ ] Are layouts repetitive?
[ ] Does the final slide provide closure?
[ ] Does narration add detail rather than duplicate slide text?
```

---

# 33. Automatic Quality Flags

Implement deterministic flags where possible.

Suggested flags:

```ts
type QualityFlag =
  | "TITLE_TOO_LONG"
  | "BODY_TOO_DENSE"
  | "TOO_MANY_BULLETS"
  | "UNSUPPORTED_STATISTIC"
  | "MISSING_SOURCE"
  | "OUTDATED_EVIDENCE"
  | "AMBIGUOUS_METRIC"
  | "CONFLICTING_CLAIM"
  | "LAYOUT_REPETITION"
  | "TEXT_ONLY_DECK"
  | "WEAK_CONCLUSION"
  | "FILLER_SLIDE"
  | "VISUAL_MISMATCH"
  | "DUPLICATE_CONTENT"
  | "OVERCLAIM"
  | "NARRATION_DUPLICATES_SLIDE";
```

The validator should return both:
- severity,
- recommended fix.

Example:

```ts
{
  type: "OUTDATED_EVIDENCE",
  severity: "high",
  slideIndex: 6,
  message: "The deck claims to describe the current market but uses data older than the freshness threshold.",
  suggestedAction: "Search for a newer authoritative statistic."
}
```

---

# 34. Quality Score Internally, Not as User-Facing Truth

An internal score may be useful for retry logic.

Example dimensions:

```text
Narrative coherence
Factual grounding
Source quality
Visual suitability
Content concision
Layout diversity
Audience fit
Freshness
```

Use scores only internally to trigger regeneration.

Do not rely on one overall score alone.

A deck with beautiful formatting but incorrect facts should fail.

---

# 35. Regeneration Strategy

Do not regenerate the entire deck for one bad slide unless necessary.

Allow targeted repair.

Examples:

```text
UNSUPPORTED_STATISTIC
-> research and regenerate claim + slide content

TITLE_TOO_LONG
-> rewrite title only

LAYOUT_REPETITION
-> request a different layout family

BODY_TOO_DENSE
-> move detail into speaker notes

WEAK_CONCLUSION
-> regenerate final slide
```

This reduces cost and latency.

---

# 36. Prompting Principles for the Content Model

Use instructions similar to:

```text
You are planning and writing a presentation, not an article.

Your job is to help an audience understand a topic through a sequence of slides.

Before writing slide text:
1. identify the presentation objective,
2. determine what the audience must understand,
3. construct a logical narrative,
4. assign one purpose and one key message to each slide,
5. identify which claims require evidence,
6. choose the most effective visual form for each slide.

Do not default to bullet lists or cards.

Use charts for trends, timelines for chronology, comparisons for alternatives,
diagrams for systems/processes, and images where they add understanding.

Keep visible slide text concise.
Place explanation in speaker notes.

Do not invent statistics, dates, quotations, sources, or citations.

When data is time-sensitive, prefer current reliable sources.

Avoid filler slides unless they materially improve the presentation.

Avoid long generic AI-style titles.

Ensure the final deck has a coherent beginning, middle, and ending.
```

---

# 37. Research Prompt Principles

For a research stage:

```text
Find evidence only for claims that materially support the presentation.

Prefer authoritative and primary sources.

For every fact, return:
- claim,
- value if applicable,
- unit,
- geography,
- population,
- year/date,
- definition,
- source,
- source date,
- confidence.

Do not return a statistic without its context.

If reliable sources disagree, preserve the disagreement rather than selecting a number arbitrarily.

If a claim cannot be verified, mark it unverified.
```

---

# 38. Deck Planner Prompt Principles

```text
Create a slide-by-slide narrative plan.

Do not write final slide copy yet.

For every slide provide:
- purpose,
- audience question,
- key message,
- evidence needed,
- preferred visual type,
- reason this slide is necessary,
- transition from previous slide.

Remove slides that do not advance the presentation.

Avoid creating an agenda/objectives slide by habit.

Ensure the final slide resolves the main objective.
```

---

# 39. Slide Writer Prompt Principles

```text
Write presentation copy for the supplied SlidePlan.

Rules:
- one main idea,
- concise title,
- minimal visible text,
- no unsupported facts,
- no unnecessary repetition,
- no essay-style paragraphs,
- use the evidence provided,
- preserve metric definitions,
- write speaker notes separately,
- do not add new factual claims unless supported by the supplied evidence.
```

---

# 40. Visual Planner Prompt Principles

```text
Choose the best visual communication method for each slide.

Do not default to decorative images.

The visual must support the information.

Examples:
- chronology -> timeline
- trend -> line/bar chart
- comparison -> comparison layout
- process -> flow diagram
- geography -> map
- categories -> icon grid
- historical/person/product context -> relevant image

Explain why the visual helps comprehension.

Avoid using identical visual/layout patterns repeatedly.
```

---

# 41. Reviewer Prompt Principles

```text
Review the deck as a single presentation.

Find:
- factual inconsistencies,
- unsupported claims,
- outdated evidence,
- vague metrics,
- filler slides,
- redundant slides,
- poor narrative transitions,
- text-heavy slides,
- inappropriate visual choices,
- repeated layouts,
- generic titles,
- missing conclusion,
- visible content that belongs in narration.

Return specific repair instructions.
Do not rewrite the entire deck unless necessary.
```

---

# 42. Cost and Performance Guidance

Lektura should remain fast and affordable.

Do not create one model call per small validation rule.

Prefer:

### Deterministic code for:
- word counts,
- bullet counts,
- repeated layouts,
- missing source IDs,
- duplicated claims,
- date freshness thresholds,
- schema validation.

### AI for:
- narrative reasoning,
- deciding slide purpose,
- deciding whether a visual is appropriate,
- rewriting weak content,
- identifying subtle redundancy,
- audience adaptation.

### Research/search tools for:
- current facts,
- source validation,
- resolving conflicting data.

---

# 43. Suggested Architecture

Possible internal modules:

```text
presentation/
  brief/
    analyzeRequest.ts

  research/
    researchClaims.ts
    sourceRanker.ts
    freshness.ts

  planning/
    narrativePlanner.ts
    slidePlanner.ts
    visualPlanner.ts

  generation/
    slideWriter.ts
    narrationWriter.ts

  validation/
    validateDeck.ts
    validateSlide.ts
    claimValidator.ts
    densityValidator.ts
    repetitionValidator.ts

  repair/
    repairSlide.ts
    repairDeck.ts

  schemas/
    presentationBrief.ts
    slidePlan.ts
    claim.ts
    source.ts
    generatedDeck.ts
```

Adapt this to the current codebase rather than forcing this exact directory structure.

---

# 44. Implementation Order

Do not attempt to rebuild everything at once.

Recommended priority:

## Phase 1 — Foundation
1. introduce structured `PresentationBrief`,
2. introduce structured `SlidePlan`,
3. generate deck outline before slide copy,
4. separate visible slide content from narration.

## Phase 2 — Content Quality
5. introduce claim objects,
6. attach source IDs to factual claims,
7. add freshness and ambiguity checks,
8. add deck-level reviewer.

## Phase 3 — Presentation Intelligence
9. add visual type planning,
10. add layout diversity metadata,
11. add text-density checks,
12. remove automatic filler slides.

## Phase 4 — Repair
13. add targeted regeneration,
14. regenerate only failed sections,
15. track validation flags.

---

# 45. Acceptance Criteria

A generation pipeline is considered improved when the following are true.

## Narrative
- slides form a logical sequence,
- each slide has a reason to exist,
- no obvious filler slides,
- deck ends with a meaningful conclusion.

## Content
- one main idea per slide,
- titles are concise,
- visible text is presentation-friendly,
- narration provides additional explanation.

## Factual Quality
- important factual claims are sourced,
- statistics include context,
- time-sensitive information is checked for freshness,
- conflicting claims are detected,
- unverified claims are not presented as facts.

## Visual Reasoning
- trends are usually represented with charts,
- chronology uses timelines when appropriate,
- comparisons use comparison layouts,
- visuals are chosen because they improve comprehension,
- deck is not mostly text cards.

## Variety
- no unnecessary repeated layouts,
- visual structure changes with the purpose of the slide,
- consistency is maintained without monotony.

---

# 46. Anti-Patterns to Explicitly Prevent

Do not allow the system to default to:

```text
TITLE
+
4–5 BULLETS
+
ROUNDED RECTANGLE
```

for most slides.

Also prevent:

- invented statistics,
- historical hallucinations,
- source-free factual decks,
- old numbers described as current,
- long AI-sounding titles,
- unnecessary objectives slides,
- unnecessary agenda slides,
- duplicated slide content,
- narration copied directly from slide text,
- charts without actual data,
- decorative visuals unrelated to the message,
- comparison claims with undefined metrics,
- abrupt endings.

---

# 47. Important Product Philosophy

Presentation quality is not primarily a styling problem.

A beautiful slide containing:
- the wrong statistic,
- weak reasoning,
- a generic title,
- or unnecessary information

is still a bad slide.

Lektura should prioritize:

```text
1. correct information
2. useful information
3. coherent story
4. appropriate evidence
5. clear communication
6. appropriate visualization
7. concise wording
8. visual polish
```

Visual polish should enhance strong content, not hide weak content.

---

# 48. Claude Code Task

When implementing this specification:

1. inspect the current Lektura generation pipeline,
2. identify where content planning, generation, rendering, and narration currently occur,
3. do not rewrite unrelated parts of the application,
4. propose the smallest architectural changes required to support this specification,
5. create/update typed schemas first,
6. separate planning from final slide writing,
7. add deterministic validators,
8. preserve current functionality where possible,
9. add targeted repair rather than full-deck retries,
10. document important architectural decisions.

Before making large changes, output:

```text
CURRENT PIPELINE
PROBLEMS FOUND
PROPOSED PIPELINE
FILES TO CHANGE
NEW FILES
IMPLEMENTATION ORDER
RISKS
```

Then implement incrementally.

Do not make visual redesign the primary goal of this task.

The main objective is to improve the **principles and intelligence behind presentation generation**.

---

# 49. Final System Principle

Every generated slide should pass this question:

> Why does this slide exist, what does the audience need to understand from it, what evidence supports it, and what is the clearest way to communicate that information?

If the system cannot answer those questions, the slide is not ready to render.
