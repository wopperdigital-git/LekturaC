import type { ContentBlock, ImageBlock } from './contentBlocks'
import type { Photo } from '@/images/types'
import { NEW_ITEM_TEXT } from './listItems'
import { KICKER_PLACEHOLDER } from './kicker'

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
  'image',
  'point',
  'callout',
  'code',
] as const

export type ContentType = (typeof CONTENT_TYPES)[number]

/**
 * What the toolbar's Insert menu shows for each type, in the order it shows them.
 * `image` opens the photo picker: the block is added only once a photo is picked,
 * because an image block needs a `url`.
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
  { type: 'image', label: 'Image', description: 'A photo you search for or paste a link to' },
  { type: 'point', label: 'Term row', description: 'A term and what it means, in a ruled table' },
  { type: 'callout', label: 'Callout', description: 'The one idea to remember' },
  { type: 'code', label: 'Code', description: 'A short code sample' },
]

const CONTENT_TYPE_OF: Record<Exclude<ContentBlock['type'], 'heading' | 'image'>, ContentType> = {
  point: 'point',
  callout: 'callout',
  code: 'code',
  paragraph: 'body',
  bulletList: 'list',
  stat: 'stat',
  quote: 'quote',
  timelineStep: 'step',
  comparisonGroup: 'group',
}

/**
 * What a selected element is called in the tools panel, in the Insert menu's own
 * words so the two never name one thing differently. A heading the AI wrote has
 * no `size` (the layout picks it) and is plain "Heading"; `itemIndex` names one
 * item of a list or comparison group instead of the whole element.
 */
export function elementLabel(block: ContentBlock, itemIndex: number | null = null): string {
  if (itemIndex !== null && (block.type === 'bulletList' || block.type === 'comparisonGroup')) {
    return block.type === 'bulletList' ? 'List item' : 'Group item'
  }
  if (block.type === 'image') return 'Image'
  const type = block.type === 'heading' ? block.size : CONTENT_TYPE_OF[block.type]
  if (!type) return 'Heading'
  return CONTENT_OPTIONS.find((option) => option.type === type)?.label ?? 'Element'
}

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
const NEW_POINT_LABEL = 'Term'
const NEW_POINT_TEXT = 'What it means'
const NEW_CALLOUT_LABEL = 'Key idea'
const NEW_CALLOUT_TEXT = 'The one thing to remember.'
const NEW_CODE_LABEL = 'Short example'
const NEW_CODE_TEXT = 'int x = 0;'

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
  KICKER_PLACEHOLDER,
  NEW_POINT_LABEL,
  NEW_POINT_TEXT,
  NEW_CALLOUT_LABEL,
  NEW_CALLOUT_TEXT,
  NEW_CODE_LABEL,
  NEW_CODE_TEXT,
])

/** True while a run still holds text this module put there, so it can be selected for replacement. */
export function isPlaceholderText(text: string): boolean {
  return PLACEHOLDERS.has(text)
}

/** An image block for a picked photo, with the credit the slide shows. */
export function imageBlock(photo: Photo): ImageBlock {
  return { type: 'image', url: photo.url, alt: photo.alt, credit: { ...photo.credit } }
}

/**
 * `blocks` with the image at `blockIndex` showing `photo` instead: url, alt and
 * credit are rewritten, every other field and every other block is kept (the
 * block keeps its index, so nothing keyed by it moves). `null` when that block is
 * not an image. The input is never mutated.
 */
export function withImageReplaced(blocks: ContentBlock[], blockIndex: number, photo: Photo): ContentBlock[] | null {
  const block = blocks[blockIndex]
  if (!block || block.type !== 'image') return null
  const next: ImageBlock = { ...block, url: photo.url, alt: photo.alt, credit: { ...photo.credit } }
  return blocks.map((b, i) => (i === blockIndex ? next : b))
}

/** A fresh block of this type, carrying placeholder text. */
export function newBlock(type: Exclude<ContentType, 'image'>): ContentBlock {
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
    case 'point':
      return { type: 'point', label: NEW_POINT_LABEL, text: NEW_POINT_TEXT }
    case 'callout':
      return { type: 'callout', label: NEW_CALLOUT_LABEL, text: NEW_CALLOUT_TEXT }
    case 'code':
      return { type: 'code', label: NEW_CODE_LABEL, code: NEW_CODE_TEXT }
  }
}

/**
 * `blocks` with one new block of `type` appended, and the index it landed at.
 * `null` when the card is already full. The input is never mutated.
 */
export function withBlockAppended(
  blocks: ContentBlock[],
  type: Exclude<ContentType, 'image'>,
): { blocks: ContentBlock[]; blockIndex: number } | null {
  return withBlockAdded(blocks, newBlock(type))
}

/** The same append for a block that is already built (an image, which needs its photo). */
export function withBlockAdded(
  blocks: ContentBlock[],
  block: ContentBlock,
): { blocks: ContentBlock[]; blockIndex: number } | null {
  if (blocks.length >= MAX_BLOCKS) return null
  return { blocks: [...blocks, block], blockIndex: blocks.length }
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
    case 'point':
      return { field: 'label' }
    case 'callout':
      return { field: 'text' }
    case 'code':
      return { field: 'code' }
    case 'image':
      // Never opened for typing (a photo has no text run); named only so the switch stays exhaustive.
      return { field: 'text' }
  }
}
