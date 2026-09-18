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
