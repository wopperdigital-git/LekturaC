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

/** Role ids used only by the Informing blueprint. */
type InformRole = Extract<
  SlideRole,
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
>

/** Role ids used only by the Persuading blueprint. */
type PersuadeRole = Extract<
  SlideRole,
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
>

/** Role ids used only by the Storytelling blueprint. */
type StoryRole = Extract<
  SlideRole,
  | 'hook'
  | 'what-is'
  | 'complication'
  | 'what-is-complication'
  | 'journey'
  | 'insight'
  | 'journey-insight'
  | 'what-could-be'
  | 'meaning'
  | 'what-could-be-meaning'
  | 'proof'
  | 'cta'
  | 'closing'
  | 'closing-line'
>

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
const INFORM: Record<InformRole, SlideSpec> = {
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

function informColumn(...roles: InformRole[]): SlideSpec[] {
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

const PERSUADE: Record<PersuadeRole, SlideSpec> = {
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

function persuadeColumn(...roles: PersuadeRole[]): SlideSpec[] {
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

const STORY: Record<StoryRole, SlideSpec> = {
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

function storyColumn(...roles: StoryRole[]): SlideSpec[] {
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
