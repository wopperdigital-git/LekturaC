import type { ContentBlock } from './contentBlocks'
import { NEW_ITEM_TEXT } from './listItems'

/*
  Adding one new piece of content to a card by hand.

  Pure and store-free, like `listItems.ts` and `cardTemplates.ts`, so the rules
  are testable without a store or a DOM.

  The load-bearing property is the same as adding a list item: **a block is only
  ever appended.** A block's index is its address everywhere else in the app —
  its `textRef`, its `card.adjusts` key, its bare-index typography key in
  `card.inline` — so inserting one in the middle would slide every later
  element's formatting and nudges onto its neighbour. Appending shifts nothing.
  Where the new element then *appears* is the layout engine's decision, exactly
  as for every other block; the user can drag it from there.
*/

export const CONTENT_TYPES = [
  'h1',
  'h2',
  'h3',
  'body',
  'list',
  'stat',
  'quote',
  'step',
  'group',
] as const

export type ContentType = (typeof CONTENT_TYPES)[number]

/**
 * What the "Add content" menu shows for each type, in the order it shows them.
 * `image` is deliberately absent for the reason it is absent from the slide-type
 * picker: an image block needs a `url` and nothing in the app can supply one.
 */
export const CONTENT_OPTIONS: readonly { type: ContentType; label: string; description: string }[] = [
  { type: 'h1', label: 'Heading 1', description: 'Largest heading' },
  { type: 'h2', label: 'Heading 2', description: 'Section heading' },
  { type: 'h3', label: 'Heading 3', description: 'Small heading' },
  { type: 'body', label: 'Body text', description: 'A paragraph' },
  { type: 'list', label: 'Bullet list', description: 'A short list of points' },
  { type: 'stat', label: 'Stat', description: 'A number and what it measures' },
  { type: 'quote', label: 'Quote', description: 'A quotation' },
  { type: 'step', label: 'Timeline step', description: 'A labelled stage in a sequence' },
  { type: 'group', label: 'Comparison group', description: 'A titled set of points' },
]

/**
 * The most blocks a card can be grown to by hand. Like `MAX_LIST_ITEMS`, a cap
 * on what one slide can sensibly hold rather than on what the layouts can draw.
 */
export const MAX_BLOCKS = 20

/*
  Placeholder copy, in the same spirit as `cardTemplates.ts`: it says what belongs
  in the slot. Every one of these is selected on arrival (see `isPlaceholderText`)
  so the first keystroke replaces it.
*/
const NEW_HEADING_TEXT = 'New heading'
const NEW_BODY_TEXT = 'New text'
const NEW_STAT_VALUE = '00'
const NEW_STAT_LABEL = 'What this number measures'
const NEW_QUOTE_TEXT = 'New quote'
const NEW_STEP_LABEL = 'Step'
const NEW_STEP_TEXT = 'What happens at this stage'
const NEW_GROUP_HEADING = 'New group'

const PLACEHOLDERS: ReadonlySet<string> = new Set([
  NEW_ITEM_TEXT,
  NEW_HEADING_TEXT,
  NEW_BODY_TEXT,
  NEW_STAT_VALUE,
  NEW_STAT_LABEL,
  NEW_QUOTE_TEXT,
  NEW_STEP_LABEL,
  NEW_STEP_TEXT,
  NEW_GROUP_HEADING,
])

/** True while a run still holds text this module put there, so it can be selected for replacement. */
export function isPlaceholderText(text: string): boolean {
  return PLACEHOLDERS.has(text)
}

/** A fresh block of this type, carrying placeholder text. */
export function newBlock(type: ContentType): ContentBlock {
  switch (type) {
    case 'h1':
    case 'h2':
    case 'h3':
      return { type: 'heading', text: NEW_HEADING_TEXT, size: type }
    case 'body':
      return { type: 'paragraph', text: NEW_BODY_TEXT }
    case 'list':
      return { type: 'bulletList', items: [NEW_ITEM_TEXT] }
    case 'stat':
      return { type: 'stat', value: NEW_STAT_VALUE, label: NEW_STAT_LABEL }
    case 'quote':
      return { type: 'quote', text: NEW_QUOTE_TEXT }
    case 'step':
      return { type: 'timelineStep', label: NEW_STEP_LABEL, text: NEW_STEP_TEXT }
    case 'group':
      return { type: 'comparisonGroup', heading: NEW_GROUP_HEADING, items: [NEW_ITEM_TEXT] }
  }
}

/**
 * `blocks` with one new block of `type` appended, and the index it landed at.
 * `null` when the card is already full. The input is never mutated.
 */
export function withBlockAppended(
  blocks: ContentBlock[],
  type: ContentType,
): { blocks: ContentBlock[]; blockIndex: number } | null {
  if (blocks.length >= MAX_BLOCKS) return null
  return { blocks: [...blocks, newBlock(type)], blockIndex: blocks.length }
}

/**
 * The address (see `textRef`) of the first run of text a block holds — where the
 * caret goes once it has been added. The `field`/`item` parts mirror how
 * `BlockRenderer` builds each block's refs.
 */
export function firstEditableField(block: ContentBlock): { field: string; item?: number } {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote':
      return { field: 'text' }
    case 'bulletList':
      return { field: 'items', item: 0 }
    case 'stat':
      return { field: 'value' }
    case 'timelineStep':
      return { field: 'label' }
    case 'comparisonGroup':
      return { field: 'heading' }
    case 'image':
      // Never created here; named only so the switch stays exhaustive.
      return { field: 'text' }
  }
}
