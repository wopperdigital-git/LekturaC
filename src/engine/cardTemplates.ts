import type { ContentBlock, LayoutType } from './contentBlocks'
import { blocksOfType } from './contentBlocks'
import type { CardKind } from './layoutEngine'

/*
  The card types a user can *create* and *switch between*.

  `layoutEngine.ts` already knows how to read a card's type off its blocks
  (`cardKind`) and which layouts that type may wear (`layoutVarieties`). What it
  has no opinion about is the other direction — given a type the user picked
  from a modal, what blocks should the card start with, and what happens to the
  content already on a card whose type is being changed. That is this module,
  and it is deliberately pure: no store, no React, so both questions can be
  tested directly.

  The direction of authority is unchanged. Picking a type chooses *what kind of
  content the card holds*; the layout engine still decides how that renders, and
  every card created here starts at `layout: 'auto'` with one documented
  exception below.
*/

/**
 * The types offered in the picker, in the order they appear.
 *
 * `gallery` is deliberately absent, and it is the one type a user cannot create
 * or convert to: an image block needs a `url`, and this app has no way to
 * supply one — images arrive only from generation. Offering it would hand the
 * user a card of broken images with no way to fix them. A gallery card that
 * came from the AI still reports itself as one and can be converted *away*.
 */
export const CREATABLE_KINDS = [
  'title',
  'text',
  'list',
  'stats',
  'timeline',
  'comparison',
  'quote',
] as const satisfies readonly CardKind[]

export type CreatableKind = (typeof CREATABLE_KINDS)[number]

export function isCreatableKind(kind: CardKind): kind is CreatableKind {
  return (CREATABLE_KINDS as readonly CardKind[]).includes(kind)
}

/** One line in the picker, under the type's name. */
export const KIND_DESCRIPTIONS: Record<CreatableKind, string> = {
  title: 'A heading and one line beneath it',
  text: 'A heading over a few paragraphs',
  list: 'A heading over a short list of points',
  stats: 'Two or more numbers with what they measure',
  timeline: 'Ordered steps or stages, each with a label',
  comparison: 'Two or more sets of points, side by side',
  quote: 'One quotation, with who said it',
}

/*
  Placeholder copy.

  Written as instructions for what belongs in each slot rather than as lorem
  filler — "What this number measures" tells the user what to type where
  "Label" does not. Every one of these is editable in place, so the text a card
  starts with is the only guidance the user gets.
*/
const STARTERS: Record<CreatableKind, ContentBlock[]> = {
  title: [
    { type: 'heading', text: 'Slide title' },
    { type: 'paragraph', text: 'One line on what this section covers' },
  ],
  text: [
    { type: 'heading', text: 'Slide title' },
    { type: 'paragraph', text: 'Make the point here.' },
    { type: 'paragraph', text: 'Then give the detail that supports it.' },
  ],
  list: [
    { type: 'heading', text: 'Slide title' },
    { type: 'bulletList', items: ['First point', 'Second point', 'Third point'] },
  ],
  stats: [
    { type: 'heading', text: 'Slide title' },
    { type: 'stat', value: '00', label: 'What this number measures' },
    { type: 'stat', value: '00', label: 'What this number measures' },
    { type: 'stat', value: '00', label: 'What this number measures' },
  ],
  timeline: [
    { type: 'heading', text: 'Slide title' },
    { type: 'timelineStep', label: 'First', text: 'What happens at this stage' },
    { type: 'timelineStep', label: 'Then', text: 'What happens at this stage' },
    { type: 'timelineStep', label: 'Finally', text: 'What happens at this stage' },
  ],
  comparison: [
    { type: 'heading', text: 'Slide title' },
    { type: 'comparisonGroup', heading: 'One side', items: ['A point', 'Another point'] },
    { type: 'comparisonGroup', heading: 'The other', items: ['A point', 'Another point'] },
  ],
  quote: [
    { type: 'heading', text: 'Slide title' },
    { type: 'quote', text: 'The quotation goes here.', attribution: 'Who said it' },
  ],
}

/** The blocks a newly added card of this type starts with. */
export function starterBlocks(kind: CreatableKind): ContentBlock[] {
  // Deep-copied: the constant above would otherwise be shared by every card
  // created in the session, and editing one card's text would edit them all.
  return STARTERS[kind].map((block) => structuredClone(block))
}

/**
 * The layout a card of this type is created with.
 *
 * `'auto'` for everything the classifier can reach from the blocks alone —
 * which is every type but one. A `title` card is the exception: `chooseLayout`
 * only awards `hero` to the *first* card in the deck, so a title slide added at
 * position 9 would silently render as a plain standard slide. Naming the layout
 * is the honest way to say "this is a title slide wherever it sits", and the
 * picker's Automatic option hands it straight back to the classifier.
 */
export function layoutForKind(kind: CreatableKind): LayoutType {
  return kind === 'title' ? 'hero' : 'auto'
}

const STEP_LABELS = ['First', 'Then', 'Next', 'After that', 'Finally']

/** The heading text a card carries, or a fallback for a card that has none. */
function headingOf(blocks: ContentBlock[]): string {
  const first = blocks[0]
  return first?.type === 'heading' && first.text ? first.text : 'Slide title'
}

/**
 * Every piece of the user's own text on the card, in reading order, without the
 * heading — the material a conversion has to find a new home for.
 *
 * Deliberately flat. A conversion between two shapes as different as a stat
 * grid and a quote cannot preserve structure, so it preserves *words*: whatever
 * the user wrote comes across in the order they wrote it, and the target's own
 * shape decides where each line lands. Losing the words silently would be the
 * one unacceptable outcome, since nothing here can be re-generated.
 */
export function contentLines(blocks: ContentBlock[]): string[] {
  const lines: string[] = []

  blocks.forEach((block, i) => {
    if (i === 0 && block.type === 'heading') return

    switch (block.type) {
      case 'heading':
      case 'paragraph':
        lines.push(block.text)
        break
      case 'bulletList':
        lines.push(...block.items)
        break
      case 'stat':
        // The number and what it measures are two runs on screen but one
        // thought; splitting them into two bullets reads as a duplicate.
        lines.push(`${block.value} ${block.label}`.trim())
        break
      case 'quote':
        lines.push(block.attribution ? `${block.text} — ${block.attribution}` : block.text)
        break
      case 'timelineStep':
        lines.push(`${block.label} — ${block.text}`)
        break
      case 'comparisonGroup':
        lines.push(block.heading, ...block.items)
        break
      case 'image':
        // An image cannot become text. Its alt is the only writing on it, and a
        // line reading "image" would be worse than nothing.
        if (block.alt) lines.push(block.alt)
        break
    }
  })

  return lines.filter((line) => line.trim().length > 0)
}

/** `lines[i]`, or the type's own placeholder once the source runs out. */
function lineOr(lines: string[], i: number, fallback: string): string {
  return lines[i] ?? fallback
}

/**
 * The card's blocks, reshaped into another type.
 *
 * The heading always survives as the heading. Everything else is poured into
 * the target's shape from `contentLines`, padded with the type's own
 * placeholders when the source card had less to say than the target has slots.
 *
 * What it cannot preserve is anything addressed *by position* — `inline` marks
 * and per-element nudges both key off a block index, and after a reshape those
 * indices point at different blocks. The store drops both, which is why this
 * returns blocks alone rather than a whole card: that decision is not this
 * module's business, but it is the reason changing a card's type is a
 * deliberate, confirmed action rather than something offered casually.
 */
export function convertBlocks(blocks: ContentBlock[], target: CreatableKind): ContentBlock[] {
  const heading: ContentBlock = { type: 'heading', text: headingOf(blocks) }
  const lines = contentLines(blocks)

  switch (target) {
    case 'title':
      return [
        heading,
        { type: 'paragraph', text: lineOr(lines, 0, 'One line on what this section covers') },
      ]

    case 'text': {
      // Every line, not just the first two: `textFocus` renders them all, and
      // keeping only some would lose text the user wrote.
      const paragraphs = lines.length > 0 ? lines : ['Make the point here.']
      return [heading, ...paragraphs.map((text): ContentBlock => ({ type: 'paragraph', text }))]
    }

    case 'list':
      return [
        heading,
        { type: 'bulletList', items: lines.length > 0 ? lines : ['First point', 'Second point'] },
      ]

    case 'stats': {
      // A card that already holds stats keeps them exactly — the numbers are
      // the content, and rebuilding them from `contentLines` would fold each
      // value into its own label.
      const existing = blocksOfType(blocks, 'stat')
      if (existing.length >= 2) return [heading, ...existing.map((s): ContentBlock => ({ ...s }))]
      // Otherwise each line becomes a *label* under a placeholder value the
      // user replaces. Numbers cannot be derived from prose, and inventing
      // plausible ones would put statistics on the slide that nobody wrote.
      const labels =
        lines.length >= 2 ? lines : ['What this number measures', 'What this number measures']
      return [heading, ...labels.map((label): ContentBlock => ({ type: 'stat', value: '00', label }))]
    }

    case 'timeline': {
      // Two steps is the classifier's minimum for the timeline layout; a single
      // step would render as something else entirely.
      const texts =
        lines.length >= 2 ? lines : ['What happens at this stage', 'What happens at this stage']
      return [
        heading,
        ...texts.map(
          (text, i): ContentBlock => ({
            type: 'timelineStep',
            label: STEP_LABELS[i] ?? `Step ${i + 1}`,
            text,
          }),
        ),
      ]
    }

    case 'comparison': {
      const existing = blocksOfType(blocks, 'comparisonGroup')
      if (existing.length >= 2) return [heading, ...existing.map((g): ContentBlock => ({ ...g }))]
      // Split what there is down the middle: two groups is the minimum the
      // comparison layout accepts, and an even split is the only division the
      // content itself suggests nothing better than.
      if (lines.length >= 2) {
        const half = Math.ceil(lines.length / 2)
        return [
          heading,
          { type: 'comparisonGroup', heading: 'One side', items: lines.slice(0, half) },
          { type: 'comparisonGroup', heading: 'The other', items: lines.slice(half) },
        ]
      }
      // The heading is carried over rather than taken from the starter: it is
      // the one thing every conversion keeps, and a card with too little to
      // split is exactly the case where losing it would be least expected.
      return [heading, ...starterBlocks('comparison').slice(1)]
    }

    case 'quote':
      return [
        heading,
        {
          type: 'quote',
          text: lineOr(lines, 0, 'The quotation goes here.'),
          attribution: 'Who said it',
        },
      ]
  }
}
