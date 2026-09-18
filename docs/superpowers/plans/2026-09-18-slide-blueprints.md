# Slide Blueprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every generated deck follows one of three research-backed structures, chosen by the model for the deck's goal, with the slide sequence exact for the requested count.

**Architecture:** A new pure module (`src/ai/slideBlueprints.ts`) holds the three blueprints, their 10-slide master sequences and their 5–10 scaling tables verbatim, plus `sequenceFor(id, count)` which also compresses below 5. The prompt sends the candidate sequences and the field playbook; the model returns which blueprint it used and a role per card. The response schema validates shape strictly and sequence loosely (a mismatch warns, never rejects), and at ingest a role picks a better layout where it is unambiguous, then is discarded.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), zod, Vitest (`environment: 'node'`), oxlint, React 19 + Vite 8.

**Spec:** `docs/superpowers/specs/2026-09-18-slide-blueprint-design.md`

## Global Constraints

- **Generate-once rule:** this changes what the single creation call asks for. Add no regenerate path and no second content call.
- **No database migration.** Roles are used at ingest and discarded; do not add a `cards.role` column.
- **Type-only imports must use `import type`** (`verbatimModuleSyntax: true`).
- **No TS constructor-parameter properties** (`erasableSyntaxOnly: true`).
- **Path alias:** `@/*` → `src/*`.
- **Tests cover pure logic only.** No component or integration tests — this repo has none by design.
- **Slide bounds:** `MAX_SLIDES = 10`, `DEFAULT_SLIDE_COUNT = 5`, floor of 1 enforced only as a ceiling check (`src/lib/slideCount.ts`).
- **Numbers stay opt-in in prompts.** The assertion-evidence rule must not ask for a data point on every slide; evidence may be an example, mechanism or explanation.
- **Sequence mismatch warns, never rejects.** Nothing here can be regenerated.
- **Commands:** `npm run test`, `npx tsc -b`, `npm run lint`. Lint must stay at its current 10 pre-existing warnings.

---

### Task 1: Blueprint module — types, `sequenceFor`, and the Informing blueprint

**Files:**
- Create: `src/ai/slideBlueprints.ts`
- Test: `src/ai/slideBlueprints.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type BlueprintId = 'inform' | 'persuade' | 'story'`
  - `type SlideRole` — a string-literal union of every role across the three blueprints, spelled out in the implementation below (not `string`)
  - `interface SlideSpec { role: SlideRole; label: string; instruction: string }`
  - `interface Blueprint { id: BlueprintId; name: string; useFor: string; logic: string; master: SlideSpec[]; columns: Record<5|6|7|8|9|10, SlideSpec[]> }`
  - `const BLUEPRINTS: Record<BlueprintId, Blueprint>` (only `inform` is populated in this task)
  - `function sequenceFor(id: BlueprintId, count: number): SlideSpec[]`

- [ ] **Step 1: Write the failing test**

Create `src/ai/slideBlueprints.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BLUEPRINTS, sequenceFor } from './slideBlueprints'

/**
 * The scaling tables are the product here — a wrong cell silently produces a
 * differently-shaped deck that nothing else in the app would notice. So the
 * columns are pinned against the doc's own labels, verbatim, rather than
 * against whatever the module happens to hold.
 */
const INFORM_COLUMNS: Record<number, string[]> = {
  5: ['Title + why it matters', 'Gap + objectives', 'Core content (main idea)', 'Application', 'Recap + next steps'],
  6: ['Title + why it matters', 'Gap + objectives', 'Core idea 1', 'Core idea 2', 'Application', 'Recap + next steps'],
  7: ['Title + roadmap', 'Why it matters', 'Gap + objectives', 'Core idea 1', 'Core idea 2', 'Application', 'Recap + next steps'],
  8: ['Title + roadmap', 'Why it matters', 'Gap + objectives', 'Core idea 1', 'Core idea 2', 'Core idea 3', 'Application', 'Recap + next steps'],
  9: ['Title + roadmap', 'Why it matters', 'Gap', 'Objectives', 'Core idea 1', 'Core idea 2', 'Core idea 3', 'Application', 'Recap + next steps'],
  10: ['Title + roadmap', 'Why it matters', 'Gap', 'Objectives', 'Core idea 1', 'Core idea 2', 'Core idea 3', 'Application', 'Recap', 'Next steps'],
}

describe('inform blueprint', () => {
  it('has a ten-slide master sequence', () => {
    expect(BLUEPRINTS.inform.master).toHaveLength(10)
  })

  it('matches the doc table for every count from 5 to 10', () => {
    for (const [count, labels] of Object.entries(INFORM_COLUMNS)) {
      expect(sequenceFor('inform', Number(count)).map((s) => s.label)).toEqual(labels)
    }
  })
})

describe('sequenceFor', () => {
  it('returns exactly the requested number of slides for every count 1-10', () => {
    for (let count = 1; count <= 10; count++) {
      expect(sequenceFor('inform', count)).toHaveLength(count)
    }
  })

  it('compresses below five by keeping the opening and the close', () => {
    // 1-4 are outside the doc's tables; the 5-slide column is compressed so a
    // short deck is still the blueprint's shape rather than a different one.
    const five = sequenceFor('inform', 5)
    for (let count = 2; count <= 4; count++) {
      const seq = sequenceFor('inform', count)
      expect(seq[0]).toEqual(five[0])
      expect(seq[seq.length - 1]).toEqual(five[five.length - 1])
    }
  })

  it('fills the middle in order', () => {
    expect(sequenceFor('inform', 3).map((s) => s.label)).toEqual([
      'Title + why it matters',
      'Gap + objectives',
      'Recap + next steps',
    ])
  })

  it('gives a single slide the opening only', () => {
    expect(sequenceFor('inform', 1).map((s) => s.label)).toEqual(['Title + why it matters'])
  })

  it('clamps above ten rather than returning nothing', () => {
    // slideCountProblem already refuses these; sequenceFor must still be total,
    // because the prompt builder depends on its length.
    expect(sequenceFor('inform', 11)).toHaveLength(10)
    expect(sequenceFor('inform', 0)).toHaveLength(1)
  })
})

describe('role vocabulary', () => {
  it('uses unique role ids within a blueprint', () => {
    for (const blueprint of Object.values(BLUEPRINTS)) {
      const roles = blueprint.master.map((s) => s.role)
      expect(new Set(roles).size).toBe(roles.length)
    }
  })

  it('only uses roles from the master sequence or a documented merge', () => {
    for (const blueprint of Object.values(BLUEPRINTS)) {
      for (const column of Object.values(blueprint.columns)) {
        for (const spec of column) {
          expect(spec.role).toMatch(/^[a-z0-9-]+$/)
          expect(spec.instruction.length).toBeGreaterThan(0)
        }
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ai/slideBlueprints.test.ts`
Expected: FAIL — `Failed to resolve import "./slideBlueprints"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ai/slideBlueprints.ts`:

```ts
/**
 * The three deck structures, from the "Slide Deck Blueprint" doc (2026-09-17).
 *
 * Pure data plus one function: no React, no store, no provider, so every
 * sequence is checkable without running a generation. That matters because the
 * scaling tables ARE the feature — a wrong cell produces a differently-shaped
 * deck and nothing downstream would notice.
 *
 * Design doc: docs/superpowers/specs/2026-09-18-slide-blueprint-design.md
 */

export type BlueprintId = 'inform' | 'persuade' | 'story'

/**
 * A slide's place in a sequence. The model echoes this back per card, which is
 * how a sequence can be checked and how a role can pick a layout at ingest.
 *
 * A merged table row ("Gap + objectives") is ONE role, not two: it is one
 * slide, and the model must return one card for it.
 */
export type SlideRole =
  // Informing & Training
  | 'title-roadmap'
  | 'title-why-matters'
  | 'why-matters'
  | 'gap'
  | 'objectives'
  | 'gap-objectives'
  | 'core-idea-1'
  | 'core-idea-2'
  | 'core-idea-3'
  | 'core-content'
  | 'application'
  | 'recap'
  | 'next-steps'
  | 'recap-next-steps'
  // Persuading & Selling
  | 'hook'
  | 'problem'
  | 'why-now'
  | 'problem-why-now'
  | 'solution'
  | 'how-it-works'
  | 'solution-how-it-works'
  | 'proof'
  | 'why-us'
  | 'proof-why-us'
  | 'offer'
  | 'handling'
  | 'offer-handling'
  | 'offer-handling-cta'
  | 'cta'
  // Storytelling & Engaging
  | 'what-is'
  | 'complication'
  | 'what-is-complication'
  | 'journey'
  | 'insight'
  | 'journey-insight'
  | 'what-could-be'
  | 'meaning'
  | 'what-could-be-meaning'
  | 'closing'
  | 'closing-line'

export interface SlideSpec {
  role: SlideRole
  /** What the doc calls this row, e.g. 'Gap + objectives'. Shown to the model. */
  label: string
  /** The doc's one-line instruction for this slide. */
  instruction: string
}

export type SlideCountColumn = 5 | 6 | 7 | 8 | 9 | 10

export interface Blueprint {
  id: BlueprintId
  name: string
  useFor: string
  logic: string
  /** Exactly 10 entries. */
  master: SlideSpec[]
  /** The doc's scaling table, one entry per supported count. */
  columns: Record<SlideCountColumn, SlideSpec[]>
}

/** Every spec the inform blueprint can use, by role, so columns stay DRY. */
const INFORM: Record<string, SlideSpec> = {
  'title-roadmap': {
    role: 'title-roadmap',
    label: 'Title + roadmap',
    instruction: 'Topic, presenter, audience, and a one-line map of what is ahead.',
  },
  'title-why-matters': {
    role: 'title-why-matters',
    label: 'Title + why it matters',
    instruction: 'The topic, plus why this audience should listen — merged opening.',
  },
  'why-matters': {
    role: 'why-matters',
    label: 'Why it matters',
    instruction: 'The current situation; what the audience already knows or does today.',
  },
  gap: {
    role: 'gap',
    label: 'Gap',
    instruction: 'What is missing, changing, or hard; the question this session answers.',
  },
  objectives: {
    role: 'objectives',
    label: 'Objectives',
    instruction: '"By the end, you will be able to…" — 2-3 objectives, no more.',
  },
  'gap-objectives': {
    role: 'gap-objectives',
    label: 'Gap + objectives',
    instruction: 'The gap this session closes, and the 2-3 things the audience will be able to do.',
  },
  'core-idea-1': {
    role: 'core-idea-1',
    label: 'Core idea 1',
    instruction: 'One assertion plus one supporting example or explanation. Self-contained.',
  },
  'core-idea-2': {
    role: 'core-idea-2',
    label: 'Core idea 2',
    instruction: 'One assertion plus one supporting example or explanation. Self-contained.',
  },
  'core-idea-3': {
    role: 'core-idea-3',
    label: 'Core idea 3',
    instruction: 'One assertion plus one supporting example or explanation. Self-contained.',
  },
  'core-content': {
    role: 'core-content',
    label: 'Core content (main idea)',
    instruction: 'The single most important idea, stated as an assertion and supported.',
  },
  application: {
    role: 'application',
    label: 'Application',
    instruction: 'A worked example, case, or check-for-understanding.',
  },
  recap: {
    role: 'recap',
    label: 'Recap',
    instruction: 'The three takeaways, restated as one-line statements.',
  },
  'next-steps': {
    role: 'next-steps',
    label: 'Next steps',
    instruction: 'What to do with this, resources, contact or Q&A.',
  },
  'recap-next-steps': {
    role: 'recap-next-steps',
    label: 'Recap + next steps',
    instruction: 'The takeaways restated, then what to do with them.',
  },
}

function informColumn(...roles: string[]): SlideSpec[] {
  return roles.map((role) => INFORM[role])
}

const INFORM_BLUEPRINT: Blueprint = {
  id: 'inform',
  name: 'Informing & Training',
  useFor:
    'lectures, training sessions, onboarding, status and progress reports, internal briefings, how-to and tutorial decks',
  logic:
    'Open with context so the audience knows why to listen (situation-complication, as in SCQA), state a roadmap, teach in self-contained chunks, then close with the three-part summary: tell them what you will tell them, tell them, tell them what you told them.',
  master: informColumn(
    'title-roadmap',
    'why-matters',
    'gap',
    'objectives',
    'core-idea-1',
    'core-idea-2',
    'core-idea-3',
    'application',
    'recap',
    'next-steps',
  ),
  columns: {
    5: informColumn('title-why-matters', 'gap-objectives', 'core-content', 'application', 'recap-next-steps'),
    6: informColumn('title-why-matters', 'gap-objectives', 'core-idea-1', 'core-idea-2', 'application', 'recap-next-steps'),
    7: informColumn('title-roadmap', 'why-matters', 'gap-objectives', 'core-idea-1', 'core-idea-2', 'application', 'recap-next-steps'),
    8: informColumn('title-roadmap', 'why-matters', 'gap-objectives', 'core-idea-1', 'core-idea-2', 'core-idea-3', 'application', 'recap-next-steps'),
    9: informColumn('title-roadmap', 'why-matters', 'gap', 'objectives', 'core-idea-1', 'core-idea-2', 'core-idea-3', 'application', 'recap-next-steps'),
    10: informColumn('title-roadmap', 'why-matters', 'gap', 'objectives', 'core-idea-1', 'core-idea-2', 'core-idea-3', 'application', 'recap', 'next-steps'),
  },
}

export const BLUEPRINTS: Record<BlueprintId, Blueprint> = {
  inform: INFORM_BLUEPRINT,
  // persuade and story arrive in Task 2
} as Record<BlueprintId, Blueprint>

/**
 * The sequence for a blueprint at a given slide count.
 *
 * Total on purpose: the prompt builder depends on its length, so an out-of-range
 * count clamps rather than returning `undefined`. `slideCountProblem` already
 * refuses those, making this defence rather than policy.
 *
 * Below 5 the doc has no table, so its most-compressed column (5) is thinned
 * further: the opening and the close always survive, and the middle fills in
 * order. A 3-slide deck is still recognisably the blueprint.
 */
export function sequenceFor(id: BlueprintId, count: number): SlideSpec[] {
  const blueprint = BLUEPRINTS[id]
  if (count >= 10) return blueprint.columns[10]
  if (count >= 5) return blueprint.columns[count as SlideCountColumn]

  const five = blueprint.columns[5]
  if (count <= 1) return [five[0]]

  const middle = five.slice(1, five.length - 1)
  return [five[0], ...middle.slice(0, count - 2), five[five.length - 1]]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ai/slideBlueprints.test.ts`
Expected: PASS (all cases). Then `npx tsc -b` — expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ai/slideBlueprints.ts src/ai/slideBlueprints.test.ts
git commit -m "Slide blueprints: module, sequenceFor, Informing & Training

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The Persuading and Storytelling blueprints

**Files:**
- Modify: `src/ai/slideBlueprints.ts` (add two blueprints to `BLUEPRINTS`)
- Test: `src/ai/slideBlueprints.test.ts` (add two table fixtures)

**Interfaces:**
- Consumes: `BLUEPRINTS`, `sequenceFor`, `SlideSpec`, `Blueprint` from Task 1.
- Produces: `BLUEPRINTS.persuade` and `BLUEPRINTS.story`, both `Blueprint`. After this task `BLUEPRINTS` is complete and the `as Record<...>` cast from Task 1 is removed.

- [ ] **Step 1: Write the failing test**

Append to `src/ai/slideBlueprints.test.ts`:

```ts
const PERSUADE_COLUMNS: Record<number, string[]> = {
  5: ['Hook', 'Problem + why now', 'Solution + how it works', 'Proof + why us', 'Offer + handling + CTA'],
  6: ['Hook', 'Problem + why now', 'Solution + how it works', 'Proof + why us', 'Offer + handling', 'Call to action'],
  7: ['Hook', 'Problem + why now', 'Solution + how it works', 'Proof + why us', 'Offer', 'Handling', 'Call to action'],
  8: ['Hook', 'Problem + why now', 'Solution', 'How it works', 'Proof + why us', 'Offer', 'Handling', 'Call to action'],
  9: ['Hook', 'Problem + why now', 'Solution', 'How it works', 'Proof', 'Why us', 'Offer', 'Handling', 'Call to action'],
  10: ['Hook', 'Problem', 'Why now', 'Solution', 'How it works', 'Proof', 'Why us', 'Offer', 'Handling', 'Call to action'],
}

const STORY_COLUMNS: Record<number, string[]> = {
  5: ['Hook', 'What is', 'Journey + insight', 'What could be + meaning', 'Closing'],
  6: ['Hook', 'What is + complication', 'Journey', 'Insight', 'What could be + meaning', 'Closing'],
  7: ['Hook', 'What is', 'Complication', 'Journey', 'Insight', 'What could be + meaning', 'Closing'],
  8: ['Hook', 'What is', 'Complication', 'Journey', 'Insight', 'What could be + meaning', 'Proof', 'Closing'],
  9: ['Hook', 'What is', 'Complication', 'Journey', 'Insight', 'What could be', 'Meaning', 'Proof', 'Closing'],
  10: ['Hook', 'What is', 'Complication', 'Journey', 'Insight', 'What could be', 'Meaning', 'Proof', 'Call to action', 'Closing line'],
}

describe('persuade blueprint', () => {
  it('has a ten-slide master sequence', () => {
    expect(BLUEPRINTS.persuade.master).toHaveLength(10)
  })

  it('matches the doc table for every count from 5 to 10', () => {
    for (const [count, labels] of Object.entries(PERSUADE_COLUMNS)) {
      expect(sequenceFor('persuade', Number(count)).map((s) => s.label)).toEqual(labels)
    }
  })
})

describe('story blueprint', () => {
  it('has a ten-slide master sequence', () => {
    expect(BLUEPRINTS.story.master).toHaveLength(10)
  })

  it('matches the doc table for every count from 5 to 10', () => {
    for (const [count, labels] of Object.entries(STORY_COLUMNS)) {
      expect(sequenceFor('story', Number(count)).map((s) => s.label)).toEqual(labels)
    }
  })
})

describe('every blueprint', () => {
  it('returns exactly the requested number of slides for every count 1-10', () => {
    for (const id of ['inform', 'persuade', 'story'] as const) {
      for (let count = 1; count <= 10; count++) {
        expect(sequenceFor(id, count)).toHaveLength(count)
      }
    }
  })

  it('opens every sequence with the blueprint opening and ends on its close', () => {
    for (const id of ['inform', 'persuade', 'story'] as const) {
      const five = sequenceFor(id, 5)
      for (let count = 2; count <= 4; count++) {
        const seq = sequenceFor(id, count)
        expect(seq[0]).toEqual(five[0])
        expect(seq[seq.length - 1]).toEqual(five[five.length - 1])
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ai/slideBlueprints.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'master')` for `BLUEPRINTS.persuade`.

- [ ] **Step 3: Write minimal implementation**

In `src/ai/slideBlueprints.ts`, add before `BLUEPRINTS` (the `PERSUADE`/`STORY` spec tables and their blueprints), then replace `BLUEPRINTS`:

```ts
const PERSUADE: Record<string, SlideSpec> = {
  hook: {
    role: 'hook',
    label: 'Hook',
    instruction: 'The offer name and a one-line value proposition. Earn attention.',
  },
  problem: {
    role: 'problem',
    label: 'Problem',
    instruction: 'The pain or opportunity this audience actually faces.',
  },
  'why-now': {
    role: 'why-now',
    label: 'Why now',
    instruction: 'The cost of doing nothing; why this cannot wait.',
  },
  'problem-why-now': {
    role: 'problem-why-now',
    label: 'Problem + why now',
    instruction: 'The pain this audience faces, and the cost of leaving it alone.',
  },
  solution: {
    role: 'solution',
    label: 'Solution',
    instruction: 'The product, service or idea, presented as the answer to that problem.',
  },
  'how-it-works': {
    role: 'how-it-works',
    label: 'How it works',
    instruction: 'The mechanics, the key capabilities, or the unfair advantage.',
  },
  'solution-how-it-works': {
    role: 'solution-how-it-works',
    label: 'Solution + how it works',
    instruction: 'The answer, and the mechanics that make it work.',
  },
  proof: {
    role: 'proof',
    label: 'Proof',
    instruction: 'Results, testimonials, case studies or credibility markers.',
  },
  'why-us': {
    role: 'why-us',
    label: 'Why us',
    instruction: 'Differentiation from the alternatives the audience is weighing.',
  },
  'proof-why-us': {
    role: 'proof-why-us',
    label: 'Proof + why us',
    instruction: 'The evidence it works, and why from us rather than an alternative.',
  },
  offer: {
    role: 'offer',
    label: 'Offer',
    instruction: 'What they get, stated explicitly — scope, packages, terms.',
  },
  handling: {
    role: 'handling',
    label: 'Handling',
    instruction: 'Guarantees, FAQs, and the objection you know is coming.',
  },
  'offer-handling': {
    role: 'offer-handling',
    label: 'Offer + handling',
    instruction: 'What they get, and the answer to the obvious hesitation.',
  },
  'offer-handling-cta': {
    role: 'offer-handling-cta',
    label: 'Offer + handling + CTA',
    instruction: 'What they get, the objection answered, and the specific ask — one closing slide.',
  },
  cta: {
    role: 'cta',
    label: 'Call to action',
    instruction: 'One specific ask and the next step. Not a summary.',
  },
}

function persuadeColumn(...roles: string[]): SlideSpec[] {
  return roles.map((role) => PERSUADE[role])
}

const PERSUADE_BLUEPRINT: Blueprint = {
  id: 'persuade',
  name: 'Persuading & Selling',
  useFor: 'sales pitches, investor and fundraising decks, client proposals, marketing pitches',
  logic:
    'AIDA (Attention, Interest, Desire, Action) fused with the problem/solution pitch structure Kawasaki popularised for investors: earn attention, agitate a real problem, present the offer as relief, back it with proof, then ask for one specific action. Weight the deck toward proof and how the offer works — that is what moves a decision — and spend the least room on the hook and the close.',
  master: persuadeColumn(
    'hook',
    'problem',
    'why-now',
    'solution',
    'how-it-works',
    'proof',
    'why-us',
    'offer',
    'handling',
    'cta',
  ),
  columns: {
    5: persuadeColumn('hook', 'problem-why-now', 'solution-how-it-works', 'proof-why-us', 'offer-handling-cta'),
    6: persuadeColumn('hook', 'problem-why-now', 'solution-how-it-works', 'proof-why-us', 'offer-handling', 'cta'),
    7: persuadeColumn('hook', 'problem-why-now', 'solution-how-it-works', 'proof-why-us', 'offer', 'handling', 'cta'),
    8: persuadeColumn('hook', 'problem-why-now', 'solution', 'how-it-works', 'proof-why-us', 'offer', 'handling', 'cta'),
    9: persuadeColumn('hook', 'problem-why-now', 'solution', 'how-it-works', 'proof', 'why-us', 'offer', 'handling', 'cta'),
    10: persuadeColumn('hook', 'problem', 'why-now', 'solution', 'how-it-works', 'proof', 'why-us', 'offer', 'handling', 'cta'),
  },
}

const STORY: Record<string, SlideSpec> = {
  hook: {
    role: 'hook',
    label: 'Hook',
    instruction:
      'A surprising fact, provocative question or story opener. The first 60 seconds must create curiosity or emotion.',
  },
  'what-is': {
    role: 'what-is',
    label: 'What is',
    instruction: 'The world as it currently stands; a relatable situation or character.',
  },
  complication: {
    role: 'complication',
    label: 'Complication',
    instruction: 'What disrupts that world; the tension that makes the status quo unstable.',
  },
  'what-is-complication': {
    role: 'what-is-complication',
    label: 'What is + complication',
    instruction: 'The world as it stands, and the tension that unsettles it.',
  },
  journey: {
    role: 'journey',
    label: 'Journey',
    instruction: 'The struggle: what was tried, what did not work, how the stakes rose.',
  },
  insight: {
    role: 'insight',
    label: 'Insight',
    instruction: 'The turn, stated as one clear sentence — the idea worth spreading.',
  },
  'journey-insight': {
    role: 'journey-insight',
    label: 'Journey + insight',
    instruction: 'What was tried and failed, and the realisation it led to.',
  },
  'what-could-be': {
    role: 'what-could-be',
    label: 'What could be',
    instruction: 'The contrast slide: the better future the insight makes possible.',
  },
  meaning: {
    role: 'meaning',
    label: 'Meaning',
    instruction: 'Why this matters to this specific audience; the universal takeaway.',
  },
  'what-could-be-meaning': {
    role: 'what-could-be-meaning',
    label: 'What could be + meaning',
    instruction: 'The better future, and why it matters to the people in the room.',
  },
  proof: {
    role: 'proof',
    label: 'Proof',
    instruction: 'A second story or example reinforcing the insight.',
  },
  cta: {
    role: 'cta',
    label: 'Call to action',
    instruction: 'The concrete thing you want them to do.',
  },
  closing: {
    role: 'closing',
    label: 'Closing',
    instruction: 'A short, quotable line that echoes the hook and lands the emotional note.',
  },
  'closing-line': {
    role: 'closing-line',
    label: 'Closing line',
    instruction: 'A short, quotable line that echoes the hook and lands the emotional note.',
  },
}

function storyColumn(...roles: string[]): SlideSpec[] {
  return roles.map((role) => STORY[role])
}

const STORY_BLUEPRINT: Blueprint = {
  id: 'story',
  name: 'Storytelling & Engaging',
  useFor:
    'conference talks and keynotes, brand and company-story decks, portfolio presentations, motivational talks, case-study narratives',
  logic:
    'Duarte\'s analysis of great speeches found they repeatedly contrast "what is" against "what could be" rather than moving in a straight line, over a three-act shape: setup, confrontation, resolution. Oscillate between present and future several times instead of building in one sweep.',
  master: storyColumn(
    'hook',
    'what-is',
    'complication',
    'journey',
    'insight',
    'what-could-be',
    'meaning',
    'proof',
    'cta',
    'closing-line',
  ),
  columns: {
    5: storyColumn('hook', 'what-is', 'journey-insight', 'what-could-be-meaning', 'closing'),
    6: storyColumn('hook', 'what-is-complication', 'journey', 'insight', 'what-could-be-meaning', 'closing'),
    7: storyColumn('hook', 'what-is', 'complication', 'journey', 'insight', 'what-could-be-meaning', 'closing'),
    8: storyColumn('hook', 'what-is', 'complication', 'journey', 'insight', 'what-could-be-meaning', 'proof', 'closing'),
    9: storyColumn('hook', 'what-is', 'complication', 'journey', 'insight', 'what-could-be', 'meaning', 'proof', 'closing'),
    10: storyColumn('hook', 'what-is', 'complication', 'journey', 'insight', 'what-could-be', 'meaning', 'proof', 'cta', 'closing-line'),
  },
}

export const BLUEPRINTS: Record<BlueprintId, Blueprint> = {
  inform: INFORM_BLUEPRINT,
  persuade: PERSUADE_BLUEPRINT,
  story: STORY_BLUEPRINT,
}
```

Delete the Task 1 placeholder `BLUEPRINTS` (the one with the `as Record<BlueprintId, Blueprint>` cast and the "persuade and story arrive in Task 2" comment).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ai/slideBlueprints.test.ts` — expected: PASS.
Run: `npx tsc -b` — expected: no errors (the cast is gone and the record is complete).

- [ ] **Step 5: Commit**

```bash
git add src/ai/slideBlueprints.ts src/ai/slideBlueprints.test.ts
git commit -m "Slide blueprints: Persuading & Selling, Storytelling & Engaging

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Sequence checking — `sequenceMismatch`

**Files:**
- Modify: `src/ai/slideBlueprints.ts`
- Test: `src/ai/slideBlueprints.test.ts`

**Interfaces:**
- Consumes: `SlideSpec`, `sequenceFor`, `BlueprintId` from Tasks 1-2.
- Produces: `function sequenceMismatch(expected: SlideSpec[], roles: string[]): string | null` — a human-readable sentence naming the first divergence, or `null` when the roles match the sequence exactly.

- [ ] **Step 1: Write the failing test**

Append to `src/ai/slideBlueprints.test.ts`:

```ts
describe('sequenceMismatch', () => {
  it('returns null when the roles match the sequence', () => {
    const expected = sequenceFor('persuade', 6)
    const roles = expected.map((s) => s.role)
    expect(sequenceMismatch(expected, roles)).toBeNull()
  })

  it('reports a wrong count', () => {
    const expected = sequenceFor('persuade', 6)
    const message = sequenceMismatch(expected, ['hook', 'problem-why-now'])
    expect(message).toContain('6')
    expect(message).toContain('2')
  })

  it('reports the first role that diverges, with its position', () => {
    const expected = sequenceFor('persuade', 5)
    const roles = expected.map((s) => s.role)
    roles[2] = 'proof'
    const message = sequenceMismatch(expected, roles)
    expect(message).toContain('slide 3')
    expect(message).toContain('proof')
    expect(message).toContain('solution-how-it-works')
  })

  it('reports an unknown role rather than throwing', () => {
    const expected = sequenceFor('inform', 5)
    const roles = expected.map((s) => s.role)
    roles[0] = 'introduction'
    expect(sequenceMismatch(expected, roles)).toContain('introduction')
  })
})
```

Add `sequenceMismatch` to the existing import at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ai/slideBlueprints.test.ts`
Expected: FAIL — `sequenceMismatch is not a function` / import error.

- [ ] **Step 3: Write minimal implementation**

Append to `src/ai/slideBlueprints.ts`:

```ts
/**
 * Compares what the model returned against the sequence it was given.
 *
 * Returns a sentence for a log, never an exception, and callers must treat it
 * as a warning: nothing in this app can regenerate a deck, so a near-miss on
 * the sequence must not cost the user the content. Only the response *shape*
 * is allowed to fail a generation (zod, in `provider.ts`).
 */
export function sequenceMismatch(expected: SlideSpec[], roles: string[]): string | null {
  if (roles.length !== expected.length) {
    return `expected ${expected.length} slides, got ${roles.length}`
  }
  for (let i = 0; i < expected.length; i++) {
    if (roles[i] !== expected[i].role) {
      return `slide ${i + 1} should be "${expected[i].role}" but was "${roles[i]}"`
    }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ai/slideBlueprints.test.ts` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/slideBlueprints.ts src/ai/slideBlueprints.test.ts
git commit -m "Slide blueprints: sequenceMismatch, a warning not a rejection

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The field playbook and the prompt sections

**Files:**
- Modify: `src/ai/slideBlueprints.ts` (add `FIELD_PLAYBOOK`)
- Modify: `src/ai/prompts.ts` (system rules, `buildBlueprintSection`, wire into `buildDeckUserPrompt`)
- Test: `src/ai/slideBlueprints.test.ts` (playbook integrity)
- Test: `src/ai/blueprintPrompt.test.ts` (new — what the prompt actually carries)

**Interfaces:**
- Consumes: `BLUEPRINTS`, `sequenceFor`, `BlueprintId` from Tasks 1-2.
- Produces:
  - `interface PlaybookEntry { field: string; type: string; blueprint: BlueprintId; note: string }`
  - `const FIELD_PLAYBOOK: PlaybookEntry[]`
  - `function buildBlueprintSection(slideCount: number | 'auto'): string` (exported from `prompts.ts`)

- [ ] **Step 1: Write the failing test**

Create `src/ai/blueprintPrompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildBlueprintSection, DECK_SYSTEM_PROMPT } from './prompts'
import { BLUEPRINTS, FIELD_PLAYBOOK, sequenceFor } from './slideBlueprints'

/**
 * The prompt is a string, so these are the only checks worth making: that the
 * model is actually handed the sequence it must follow, and that `'auto'` — the
 * one path where the count is not known in advance — carries every column
 * rather than leaving the model to invent its own merges.
 */
describe('buildBlueprintSection at an exact count', () => {
  const section = buildBlueprintSection(6)

  it('names all three blueprints', () => {
    for (const blueprint of Object.values(BLUEPRINTS)) {
      expect(section).toContain(blueprint.name)
    }
  })

  it('carries every row of every blueprint at that count, with its role id', () => {
    for (const id of ['inform', 'persuade', 'story'] as const) {
      for (const spec of sequenceFor(id, 6)) {
        expect(section).toContain(spec.role)
        expect(section).toContain(spec.label)
      }
    }
  })

  it('does not offer counts other than the one requested', () => {
    // A 9-slide-only row must not appear in a 6-slide prompt.
    expect(section).not.toContain('Recap + next steps\n')
    expect(buildBlueprintSection(6)).not.toContain('choose a slide count')
  })

  it('includes the field playbook so the choice is guided', () => {
    expect(section).toContain(FIELD_PLAYBOOK[0].type)
  })
})

describe('buildBlueprintSection at auto', () => {
  const section = buildBlueprintSection('auto')

  it('asks the model to choose the count as well as the blueprint', () => {
    expect(section).toContain('choose a slide count')
  })

  it('carries every column from 5 to 10 for every blueprint', () => {
    for (const id of ['inform', 'persuade', 'story'] as const) {
      for (let count = 5; count <= 10; count++) {
        for (const spec of sequenceFor(id, count)) {
          expect(section).toContain(spec.role)
        }
      }
    }
  })
})

describe('system prompt content rules', () => {
  it('asks for full-sentence assertion headings', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/assertion|full sentence/i)
  })

  it('keeps numbers opt-in rather than demanding a data point per slide', () => {
    // The blueprint doc's assertion-evidence rule says "one visual or short
    // data point"; taken literally that reintroduces invented statistics,
    // which the existing rules exist to prevent.
    expect(DECK_SYSTEM_PROMPT).toMatch(/example, mechanism|not invent|only when/i)
  })

  it('caps items per slide', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/7|seven/)
  })

  it('tells the model to echo the role on every card', () => {
    expect(DECK_SYSTEM_PROMPT).toContain('role')
  })
})
```

Append to `src/ai/slideBlueprints.test.ts`:

```ts
describe('FIELD_PLAYBOOK', () => {
  it('only points at blueprints that exist', () => {
    for (const entry of FIELD_PLAYBOOK) {
      expect(BLUEPRINTS[entry.blueprint]).toBeDefined()
    }
  })

  it('covers all three fields from the doc', () => {
    const fields = new Set(FIELD_PLAYBOOK.map((e) => e.field))
    expect(fields).toContain('Education')
    expect(fields).toContain('Business')
    expect(fields).toContain('Other fields')
  })

  it('recommends each blueprint at least once', () => {
    const recommended = new Set(FIELD_PLAYBOOK.map((e) => e.blueprint))
    expect(recommended).toEqual(new Set(['inform', 'persuade', 'story']))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ai/blueprintPrompt.test.ts src/ai/slideBlueprints.test.ts`
Expected: FAIL — `buildBlueprintSection` and `FIELD_PLAYBOOK` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/ai/slideBlueprints.ts`:

```ts
export interface PlaybookEntry {
  field: string
  type: string
  blueprint: BlueprintId
  note: string
}

/**
 * The doc's field playbook, condensed for the prompt. It exists so the model's
 * choice is guided by something better than the topic's vibe: "thesis defense"
 * and "investor pitch" are both persuasive-sounding and land in different
 * blueprints.
 */
export const FIELD_PLAYBOOK: PlaybookEntry[] = [
  { field: 'Education', type: 'Lecture or lesson', blueprint: 'inform', note: 'Objectives are stated learning outcomes; each core idea is one chunk.' },
  { field: 'Education', type: 'Thesis or capstone defense', blueprint: 'inform', note: 'The gap is the research gap; the core ideas are methodology, results, discussion.' },
  { field: 'Education', type: 'Student pitch or competition entry', blueprint: 'persuade', note: 'Judges evaluate like investors — lead with the problem, not the product.' },
  { field: 'Education', type: 'Storytelling assignment or show-and-tell', blueprint: 'story', note: 'Skip data-heavy proof; spend the room on the journey and the insight.' },
  { field: 'Business', type: 'Client proposal or sales pitch', blueprint: 'persuade', note: 'The offer states scope explicitly — ambiguity stalls decisions.' },
  { field: 'Business', type: 'Investor or fundraising pitch', blueprint: 'persuade', note: 'Keep how-it-works and proof concrete, light on emotional framing.' },
  { field: 'Business', type: 'Status update or project report', blueprint: 'inform', note: 'Open situation-complication-question; lead with the recommendation, not the process.' },
  { field: 'Business', type: 'Onboarding or internal training', blueprint: 'inform', note: 'Keep all three core ideas; make the application a task or exercise.' },
  { field: 'Business', type: 'Brand story, about-us or keynote', blueprint: 'story', note: 'Company history is the "what is"; the turning point is a founding moment or pivot.' },
  { field: 'Other fields', type: 'Conference talk or keynote', blueprint: 'story', note: 'Hook in the first 60 seconds; one idea stated in one sentence.' },
  { field: 'Other fields', type: 'Portfolio or creative work', blueprint: 'story', note: 'Each project is a "what is to what could be" arc, closing on results.' },
  { field: 'Other fields', type: 'Nonprofit or fundraising ask', blueprint: 'persuade', note: 'Open on a beneficiary story, then proof, offer and call to action.' },
  { field: 'Other fields', type: 'Scientific or technical conference talk', blueprint: 'inform', note: 'Assertion-evidence was built for this: sentence headings, data as the evidence.' },
  { field: 'Other fields', type: 'Community or policy briefing', blueprint: 'inform', note: 'Structure through the recap, then close on a concrete action.' },
]
```

In `src/ai/prompts.ts`, add the import and the builder:

```ts
import { BLUEPRINTS, FIELD_PLAYBOOK, sequenceFor, type BlueprintId } from './slideBlueprints'

const AUTO_COUNTS = [5, 6, 7, 8, 9, 10] as const

function renderSequence(id: BlueprintId, count: number): string {
  return sequenceFor(id, count)
    .map((spec, i) => `  ${i + 1}. [${spec.role}] ${spec.label} — ${spec.instruction}`)
    .join('\n')
}

/**
 * The blueprint half of the user prompt.
 *
 * The model chooses the blueprint, so it cannot be handed one sequence — it is
 * handed all three and told to pick. With an exact count that is one column
 * each (~600 tokens). With 'auto' the count is unknown too, so every column
 * goes (~1200 tokens): the merges in those columns are the doc's own content,
 * and a model inventing its own would make the exactness pointless.
 */
export function buildBlueprintSection(slideCount: number | 'auto'): string {
  const playbook = FIELD_PLAYBOOK.map(
    (e) => `  - ${e.field} · ${e.type} → ${BLUEPRINTS[e.blueprint].name}. ${e.note}`,
  ).join('\n')

  const blueprints = (Object.keys(BLUEPRINTS) as BlueprintId[])
    .map((id) => {
      const b = BLUEPRINTS[id]
      const sequences =
        slideCount === 'auto'
          ? AUTO_COUNTS.map((count) => `  At ${count} slides:\n${renderSequence(id, count)}`).join('\n')
          : renderSequence(id, slideCount)
      return `${b.name} (id: ${b.id})\n  Use for: ${b.useFor}\n  Why this order: ${b.logic}\n${sequences}`
    })
    .join('\n\n')

  const instruction =
    slideCount === 'auto'
      ? 'Pick the ONE blueprint that fits this deck\'s goal, then choose a slide count between 5 and 10 that suits the topic\'s depth, and follow that blueprint\'s sequence for that count exactly.'
      : 'Pick the ONE blueprint that fits this deck\'s goal, then follow its sequence below exactly.'

  return `STRUCTURE — choose a blueprint and follow it

${instruction}
Produce exactly one card per row, in the order given, and set each card's "role" to that row's bracketed id. Do not add, drop, reorder or merge rows.

Field playbook (match the deck to a row, then use that row's blueprint):
${playbook}

${blueprints}`
}
```

Then in `buildDeckUserPrompt`, insert the section after the `Slide count:` line:

```ts
  return `Create a presentation about: ${topic.trim()}

Slide count: ${
    brief.slideCount === 'auto'
      ? "choose between 5 and 10 cards (never more than 10), whichever best fits the topic's depth and the requested detail level. Don't pad with filler or cram; end on a natural close."
      : `exactly ${brief.slideCount} cards. Not approximately — exactly this many.`
  }
Audience: ${audience}
Detail level: ${brief.detailLevel} — ${DETAIL_LEVEL_INSTRUCTIONS[brief.detailLevel]}
Tone: ${brief.tone} — ${TONE_INSTRUCTIONS[brief.tone]}

${buildBlueprintSection(brief.slideCount)}
${guidance ? `\nUSER'S EXPLICIT INTENT (hard constraint — follow this over the general content rules wherever they conflict): ${guidance}\n` : ''}
Write every card specifically for this audience at this detail level and tone.`
```

In `DECK_SYSTEM_PROMPT`, update the JSON shape to include the two new fields and add the content rules. The JSON shape block gains `"blueprint"` at the top level and `"role"` per card; then append to CONTENT QUALITY RULES:

```
- Every card's heading is a FULL-SENTENCE ASSERTION, not a topic phrase: "Retention drops sharply after 15 minutes", not "Retention". The heading states the point; the rest of the card supports that one point.
- ONE idea per card. Support it with an example, a mechanism, or a short explanation — a figure ONLY when the material genuinely supports one. Do not invent numbers to look like evidence.
- At most 7 items on any card (5 is better). Past that, comprehension drops and the card should be split or trimmed.
- Set "blueprint" to the id of the structure you chose, and every card's "role" to the bracketed role id of the row it fills.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ai/blueprintPrompt.test.ts src/ai/slideBlueprints.test.ts` — expected: PASS.
Run: `npx tsc -b` — expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ai/slideBlueprints.ts src/ai/slideBlueprints.test.ts src/ai/prompts.ts src/ai/blueprintPrompt.test.ts
git commit -m "Slide blueprints: field playbook and prompt sections

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Response schema — `blueprint` and per-card `role`

**Files:**
- Modify: `src/ai/provider.ts:7-18`
- Test: `src/ai/deckSchema.test.ts` (new)

**Interfaces:**
- Consumes: `BlueprintId` from Task 1.
- Produces: `generatedDeckSchema` now parses `{ title, blueprint, cards: [{ blocks, visualStyle, role }] }`; `GeneratedDeck` gains both fields.

- [ ] **Step 1: Write the failing test**

Create `src/ai/deckSchema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generatedDeckSchema } from './provider'

function deck(overrides: Record<string, unknown> = {}) {
  return {
    title: 'A deck',
    blueprint: 'inform',
    cards: [
      {
        blocks: [{ type: 'heading', text: 'Retention drops after fifteen minutes' }],
        visualStyle: 'structured',
        role: 'title-why-matters',
      },
    ],
    ...overrides,
  }
}

describe('generatedDeckSchema', () => {
  it('accepts a deck carrying a blueprint and per-card roles', () => {
    const result = generatedDeckSchema.safeParse(deck())
    expect(result.success).toBe(true)
  })

  it('rejects an unknown blueprint id', () => {
    // Shape failures DO fail the generation: the single self-correcting retry
    // hands these zod messages back to the model.
    expect(generatedDeckSchema.safeParse(deck({ blueprint: 'informative' })).success).toBe(false)
  })

  it('rejects a missing blueprint', () => {
    const d = deck()
    delete (d as Record<string, unknown>).blueprint
    expect(generatedDeckSchema.safeParse(d).success).toBe(false)
  })

  it('rejects a card with no role', () => {
    expect(
      generatedDeckSchema.safeParse(
        deck({
          cards: [{ blocks: [{ type: 'heading', text: 'Hi' }], visualStyle: 'structured' }],
        }),
      ).success,
    ).toBe(false)
  })

  it('accepts a role the chosen blueprint does not use', () => {
    // Sequence is NOT validated here — a mismatch is warned about at ingest so
    // an otherwise good deck is never thrown away.
    expect(generatedDeckSchema.safeParse(deck({ cards: [{ ...deck().cards[0], role: 'hook' }] })).success).toBe(true)
  })

  it('still requires the first block to be a heading', () => {
    expect(
      generatedDeckSchema.safeParse(
        deck({
          cards: [
            { blocks: [{ type: 'paragraph', text: 'no heading' }], visualStyle: 'structured', role: 'hook' },
          ],
        }),
      ).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ai/deckSchema.test.ts`
Expected: FAIL — the deck with a missing `blueprint` parses successfully, since the schema does not know the field yet.

- [ ] **Step 3: Write minimal implementation**

In `src/ai/provider.ts`, replace the two schemas:

```ts
const blueprintIdSchema = z.enum(['inform', 'persuade', 'story'])

const generatedCardSchema = z
  .object({
    blocks: z.array(contentBlockSchema).min(1),
    visualStyle: visualStyleSchema,
    /**
     * The blueprint row this card fills. Free-form on purpose: the shape is
     * required but the *value* is not checked against the chosen blueprint,
     * because a sequence mismatch must warn rather than discard a deck nothing
     * can regenerate (see `sequenceMismatch`).
     */
    role: z.string().min(1),
  })
  .refine((card) => card.blocks[0]?.type === 'heading', {
    message: 'blocks[0] must be a heading block (every card must start with its title)',
  })

export const generatedDeckSchema = z.object({
  title: z.string().min(1),
  /** Which of the three structures the model chose. */
  blueprint: blueprintIdSchema,
  cards: z.array(generatedCardSchema).min(1),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ai/deckSchema.test.ts` — expected: PASS.
Run: `npx tsc -b` — expected: FAIL, in `presentationStore.ts`, because `createDeckFromGeneration` does not accept the new fields. Task 6 fixes that; leave it failing and do not widen the store here.

- [ ] **Step 5: Commit**

```bash
git add src/ai/provider.ts src/ai/deckSchema.test.ts
git commit -m "Slide blueprints: blueprint and role on the response schema

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Ingest — roles pick layouts, then are discarded

**Files:**
- Create: `src/engine/roleLayout.ts`
- Test: `src/engine/roleLayout.test.ts`
- Modify: `src/store/presentationStore.ts:53-55` (the `createDeckFromGeneration` signature) and `:564-580` (its body)

**Interfaces:**
- Consumes: `SlideRole` (Task 1), `sequenceFor` + `sequenceMismatch` (Tasks 1-3), `ContentBlock`/`LayoutType` from `@/engine/contentBlocks` and `@/engine/layoutEngine`.
- Produces: `function roleLayoutHint(role: string | undefined, blocks: ContentBlock[]): LayoutType | null`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/roleLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { roleLayoutHint } from './roleLayout'

const heading: ContentBlock = { type: 'heading', text: 'One clear sentence' }
const paragraph: ContentBlock = { type: 'paragraph', text: 'Supporting line.' }
const bullets: ContentBlock = { type: 'bulletList', items: ['a', 'b', 'c'] }
const stat: ContentBlock = { type: 'stat', value: '42%', label: 'of teams' }

describe('roleLayoutHint', () => {
  it('gives an opening role the hero treatment', () => {
    expect(roleLayoutHint('hook', [heading, paragraph])).toBe('hero')
    expect(roleLayoutHint('title-roadmap', [heading])).toBe('hero')
    expect(roleLayoutHint('title-why-matters', [heading, paragraph])).toBe('hero')
  })

  it('gives the story blueprint\'s dramatic slides the hero treatment too', () => {
    // chooseLayout awards `hero` only to card #1, so without this an insight or
    // a closing line renders as a generic standard slide.
    expect(roleLayoutHint('insight', [heading, paragraph])).toBe('hero')
    expect(roleLayoutHint('closing-line', [heading])).toBe('hero')
    expect(roleLayoutHint('closing', [heading])).toBe('hero')
  })

  it('refuses hero when the card carries more than a heading and a line', () => {
    // The hero layouts are built for one heading plus at most one paragraph.
    expect(roleLayoutHint('hook', [heading, paragraph, bullets])).toBeNull()
    expect(roleLayoutHint('insight', [heading, stat])).toBeNull()
  })

  it('numbers a recap that actually holds a list', () => {
    expect(roleLayoutHint('recap', [heading, bullets])).toBe('numberedList')
    expect(roleLayoutHint('recap-next-steps', [heading, bullets])).toBe('numberedList')
  })

  it('leaves a recap with no list to the classifier', () => {
    expect(roleLayoutHint('recap', [heading, paragraph])).toBeNull()
  })

  it('leaves every other role to the classifier', () => {
    for (const role of ['proof', 'offer', 'core-idea-2', 'journey', 'application']) {
      expect(roleLayoutHint(role, [heading, paragraph])).toBeNull()
    }
  })

  it('handles a missing or unknown role', () => {
    expect(roleLayoutHint(undefined, [heading])).toBeNull()
    expect(roleLayoutHint('introduction', [heading])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/roleLayout.test.ts`
Expected: FAIL — `Failed to resolve import "./roleLayout"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/roleLayout.ts`:

```ts
import type { ContentBlock, LayoutType } from './contentBlocks'

/**
 * A blueprint role, turned into an explicit layout where the role makes the
 * choice unambiguous.
 *
 * This is the one thing roles buy the *rendering* side. `chooseLayout` awards
 * `hero` only when `context.isFirstCard`, so the story blueprint's insight and
 * closing line — its two most deliberately dramatic slides — come out as
 * generic standard slides. The role is the only thing that knows they differ.
 *
 * Every hint is guarded by the card's own blocks: a role never forces a layout
 * the content cannot fill. Anything unhinted returns `null` and keeps
 * `layout: 'auto'`, i.e. the classifier decides exactly as before.
 */
const HERO_ROLES = new Set([
  'hook',
  'title-roadmap',
  'title-why-matters',
  'insight',
  'closing',
  'closing-line',
])

const RECAP_ROLES = new Set(['recap', 'recap-next-steps'])

export function roleLayoutHint(role: string | undefined, blocks: ContentBlock[]): LayoutType | null {
  if (!role) return null

  if (HERO_ROLES.has(role)) {
    // What every hero layout is built for: one heading, optionally one line.
    const headings = blocks.filter((b) => b.type === 'heading').length
    return headings === 1 && blocks.length <= 2 ? 'hero' : null
  }

  if (RECAP_ROLES.has(role)) {
    return blocks.some((b) => b.type === 'bulletList') ? 'numberedList' : null
  }

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/roleLayout.test.ts` — expected: PASS.

- [ ] **Step 5: Wire it into ingest**

In `src/store/presentationStore.ts`, widen the signature (around line 53):

```ts
  createDeckFromGeneration: (deck: {
    title: string
    /** Which structure the model chose; used to check the sequence, then dropped. */
    blueprint?: BlueprintId
    cards: { blocks: ContentBlock[]; visualStyle: VisualStyle; role?: string }[]
  }) => Promise<string>
```

Add the imports:

```ts
import { roleLayoutHint } from '@/engine/roleLayout'
import { sequenceFor, sequenceMismatch, type BlueprintId } from '@/ai/slideBlueprints'
```

Replace the card mapping in `createDeckFromGeneration` (around line 564):

```ts
  async createDeckFromGeneration(deck) {
    const id = newId()

    /*
      The sequence is checked but never enforced. A deck whose roles drifted
      from the blueprint is still the only copy of content nothing in this app
      can regenerate, so a mismatch is logged and the deck lands. Only the
      response *shape* is allowed to fail a generation (zod, in provider.ts).

      Checked against the sequence for the count the model actually returned:
      the requested count is not passed down here, and a wrong count already
      shows up in the message as a length difference.
    */
    if (deck.blueprint) {
      const problem = sequenceMismatch(
        sequenceFor(deck.blueprint, deck.cards.length),
        deck.cards.map((c) => c.role ?? ''),
      )
      if (problem) {
        console.warn(`[generation] deck does not follow the ${deck.blueprint} blueprint: ${problem}`)
      }
    }

    const cards: Card[] = deck.cards.map((c, i) => {
      // The one moment a deck's text is written, and so the only place the
      // model's `*asterisks*` can be turned into real bold without the stored
      // string and the drawn string disagreeing about character offsets.
      const { blocks, inline } = applyEmphasis(c.blocks)
      return {
        id: newId(),
        orderIndex: i,
        blocks,
        // The role's last act before it is discarded: a layout the classifier
        // could not have reached, and only where the blocks support it.
        layout: roleLayoutHint(c.role, blocks) ?? 'auto',
        visualStyle: c.visualStyle,
        inline,
      }
    })
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx tsc -b` — expected: no errors (this closes the Task 5 break).
Run: `npm run test` — expected: all pass.
Run: `npm run lint` — expected: 10 warnings, unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/engine/roleLayout.ts src/engine/roleLayout.test.ts src/store/presentationStore.ts
git commit -m "Slide blueprints: roles pick layouts at ingest, then are discarded

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation

**Files:**
- Modify: `CLAUDE.md` (the generation data-flow section, and the test-coverage paragraph)

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Update the data-flow section**

In the numbered list under **Data flow: creation → generation → storage**, item 2 (the provider call) gains a paragraph:

```markdown
   **Every deck follows one of three blueprints** (`ai/slideBlueprints.ts`, from `docs/superpowers/specs/2026-09-18-slide-blueprint-design.md`): Informing & Training, Persuading & Selling, Storytelling & Engaging, each with a 10-slide master sequence and the design doc's 5–10 scaling tables held verbatim. **The model picks the blueprint**, guided by a field playbook, so the prompt carries all three candidate sequences rather than one — at an exact count that is one column each (~600 tokens), and for `'auto'` it is every column (~1200), because the merges in those columns are the doc's content and a model inventing its own would make the exactness a fiction. Below 5 slides `sequenceFor` compresses the 5-slide column, keeping the opening and the close and filling the middle in order. The response carries `blueprint` and a per-card `role`; **shape is validated strictly, sequence only warns** (`sequenceMismatch`), because nothing here can be regenerated and a near-miss must not cost the user a deck. At ingest `roleLayoutHint` turns a role into an explicit layout where the blocks support it — which is what finally lets a story deck's `insight` and `closing-line` render as heroes, since `chooseLayout` awards `hero` only to the first card — and the role is then **discarded** (no column, no migration).
```

- [ ] **Step 2: Update the test-coverage paragraph**

Add to the list of unit-tested modules:

```markdown
`ai/slideBlueprints.test.ts` (the three blueprints: every 5–10 column pinned against the design doc's tables cell by cell, that every count 1–10 yields exactly that many slides, that compression keeps the opening and the close, and that `sequenceMismatch` reports the first divergence rather than throwing), `ai/blueprintPrompt.test.ts` (that the prompt actually carries the sequence the model must follow, and that `'auto'` carries every column), `ai/deckSchema.test.ts` (that `blueprint` and `role` are required, that an unknown blueprint id fails, and that a role the chosen blueprint does not use still parses — the sequence is warned about, not rejected), and `engine/roleLayout.test.ts` (that a role only overrides the classifier when the card's blocks support it),
```

- [ ] **Step 3: Verify and commit**

Run: `npm run test && npx tsc -b && npm run lint` — expected: all pass, 10 warnings.

```bash
git add CLAUDE.md
git commit -m "Docs: slide blueprints in the generation flow

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Manual verification (after Task 7)

Automated tests cover the sequences, the schema and the layout mapping, but not
that a real model follows a blueprint. This needs a real generation:

1. `npm run dev`, sign in, `/new`.
2. **Persuading:** topic "a subscription box for rare coffee", audience Students,
   8 slides. Expect Hook · Problem + why now · Solution · How it works ·
   Proof + why us · Offer · Handling · Call to action.
3. **Informing:** topic "how photosynthesis works", audience Students, 5 slides.
   Expect Title + why it matters · Gap + objectives · Core content ·
   Application · Recap + next steps.
4. **Below the table:** same topic at 3 slides. Expect exactly three cards,
   opening and closing intact.
5. Check the browser console for `[generation] deck does not follow the …
   blueprint` — its presence is the signal that the prompt needs tightening,
   not that the code is broken.
