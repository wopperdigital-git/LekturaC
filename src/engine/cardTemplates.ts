import type { ContentBlock, LayoutType } from './contentBlocks'
import type { CardKind } from './layoutEngine'

/*
  The card types a user can *create*.

  `layoutEngine.ts` already knows how to read a card's type off its blocks
  (`cardKind`) and which layouts that type may wear (`layoutVarieties`). What it
  has no opinion about is the other direction — given a type the user picked
  from a modal, what blocks should the card start with. That is this module, and
  it is deliberately pure: no store, no React, so it can be tested directly.

  A card's type cannot be changed once it exists: the type is the shape of its
  blocks, and reshaping them moves text to different indices, which is what every
  mark, nudge and typography key is addressed by. To add to an existing card, see
  `newContent.ts`.

  The direction of authority is unchanged. Picking a type chooses *what kind of
  content the card holds*; the layout engine still decides how that renders, and
  every card created here starts at `layout: 'auto'` with one documented
  exception below.
*/

/**
 * The types offered in the picker, in the order they appear.
 *
 * `gallery` is deliberately absent, and it is the one type a user cannot create:
 * an image block needs a `url`, and this app has no way to supply one —
 * images arrive only from generation. Offering it would hand the user a card of
 * broken images with no way to fix them.
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

/**
 * Every piece of the user's own text on the card, in reading order, without the
 * heading — the card's words as a flat list of lines.
 *
 * Deliberately flat: it reads the *words*, not the structure, which is what the
 * narration prompt needs (see `ai/narrationPrompt.ts`) — a script is written
 * from what the slide says, not from how it is laid out.
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
