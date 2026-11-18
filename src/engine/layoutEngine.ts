import { blocksOfType, type ContentBlock, type LayoutType, type VisualStyle } from './contentBlocks'

export const SHORT_ITEM_MAX_CHARS = 40

/** The most items a bullet list can hold and still be drawn as chips. */
export const MAX_CHIP_ITEMS = 6

/** The longest paragraph (characters) a heading may carry and still be a `statement` slide. */
export const STATEMENT_MAX_LEAD = 140

/**
 * Rule-based classifier: inspects what a card's content actually is and
 * picks the layout that best presents it. Mirrors Gamma's "AI picks a
 * layout per card based on content type" behavior, minus the LLM call —
 * this runs synchronously and deterministically so cards render instantly
 * and stay stable across re-renders.
 */
export interface LayoutContext {
  /** The opening card gets a shot at the cinematic title treatment instead of the plain fallback. */
  isFirstCard?: boolean
}

/**
 * A card with exactly one photo is classified on its other blocks (the `core`):
 * the photo is set aside, then placed by whichever arrangement the core earns.
 * Two or more photos are not set aside: they keep the gallery rules below.
 */
function setAsidePhoto(blocks: ContentBlock[]): ContentBlock[] | null {
  const images = blocksOfType(blocks, 'image')
  return images.length === 1 ? blocks.filter((b) => b.type !== 'image') : null
}

export function chooseLayout(blocks: ContentBlock[], context: LayoutContext = {}): LayoutType {
  const core = setAsidePhoto(blocks)
  if (core) {
    const layout = chooseLayout(core, context)
    // Plain prose beside a photo splits the slide; a bare heading (or nothing)
    // beside it is an image slide. `section` and `statement` are the same plain
    // prose read by their own rules, so the photo turns them the same way.
    if (layout === 'standard' || layout === 'textFocus' || layout === 'section' || layout === 'statement') {
      return blocksOfType(core, 'paragraph').length >= 1 ? 'standardSplit' : 'imageFocus'
    }
    // A list beside a photo, with nothing else but headings and paragraphs, is a photo list.
    if ((layout === 'iconGrid' || layout === 'numberedList') && isListWithProse(core)) return 'photoList'
    // A stat split has no place for a photo, so a card holding one stays a stat hero.
    if (layout === 'statSplit') return 'statHero'
    // Every other arrangement (hero, quote, stat, list, timeline, comparison)
    // keeps its own and draws the photo itself.
    return layout
  }

  const stats = blocksOfType(blocks, 'stat')
  const comparisonGroups = blocksOfType(blocks, 'comparisonGroup')
  const timelineSteps = blocksOfType(blocks, 'timelineStep')
  const bulletLists = blocksOfType(blocks, 'bulletList')
  const images = blocksOfType(blocks, 'image')
  const paragraphs = blocksOfType(blocks, 'paragraph')
  const headings = blocksOfType(blocks, 'heading')
  const quotes = blocksOfType(blocks, 'quote')

  if (
    context.isFirstCard &&
    headings.length === 1 &&
    blocks.length <= 2 &&
    stats.length === 0 &&
    comparisonGroups.length === 0 &&
    timelineSteps.length === 0 &&
    bulletLists.length === 0 &&
    images.length === 0
  ) {
    return 'hero'
  }

  // A heading on its own is a section divider, but only past the opening card.
  if (!context.isFirstCard && blocks.length === 1 && headings.length === 1) {
    return 'section'
  }

  // One heading and one short paragraph: a statement, a claim set large. Never the opener.
  if (
    !context.isFirstCard &&
    blocks.length === 2 &&
    blocks[0].type === 'heading' &&
    blocks[1].type === 'paragraph' &&
    blocks[1].text.length <= STATEMENT_MAX_LEAD
  ) {
    return 'statement'
  }

  // One figure beside one list, with only headings and paragraphs round them.
  if (
    stats.length === 1 &&
    bulletLists.length === 1 &&
    blocks.every((b) => b.type === 'heading' || b.type === 'paragraph' || b.type === 'stat' || b.type === 'bulletList')
  ) {
    return 'statSplit'
  }

  if (stats.length === 1 && comparisonGroups.length === 0 && timelineSteps.length === 0) {
    return 'statHero'
  }

  if (stats.length >= 2 && stats.length <= 4 && comparisonGroups.length === 0 && timelineSteps.length === 0) {
    return 'statGrid'
  }

  if (comparisonGroups.length >= 2 && comparisonGroups.length <= 4) {
    return 'comparison'
  }

  if (timelineSteps.length >= 2) {
    return 'timeline'
  }

  if (
    quotes.length === 1 &&
    bulletLists.length === 0 &&
    stats.length === 0 &&
    images.length === 0 &&
    paragraphs.length <= 1
  ) {
    return 'quote'
  }

  if (
    bulletLists.length === 1 &&
    bulletLists[0].items.length <= MAX_CHIP_ITEMS &&
    bulletLists[0].items.every((item) => item.length <= SHORT_ITEM_MAX_CHARS) &&
    images.length === 0
  ) {
    return 'iconGrid'
  }

  if (images.length >= 2 && paragraphs.length === 0) {
    return 'gallery'
  }

  if (headings.length >= 1 && paragraphs.length >= 1 && images.length === 1) {
    return 'standardSplit'
  }

  // A single bullet list that didn't qualify for the compact icon grid above
  // (too many items, or items too long to read as short chips) still deserves
  // its own clean treatment rather than falling into the generic slab.
  if (bulletLists.length === 1 && stats.length === 0 && quotes.length === 0 && images.length === 0) {
    return 'numberedList'
  }

  if (
    paragraphs.length >= 2 &&
    bulletLists.length === 0 &&
    stats.length === 0 &&
    quotes.length === 0 &&
    images.length === 0
  ) {
    return 'textFocus'
  }

  return 'standard'
}

/** Exactly one bullet list, and nothing else but headings and paragraphs. */
function isListWithProse(blocks: ContentBlock[]): boolean {
  return (
    blocksOfType(blocks, 'bulletList').length === 1 &&
    blocks.every((b) => b.type === 'bulletList' || b.type === 'heading' || b.type === 'paragraph')
  )
}

/** Resolves a card's effective layout: an explicit override wins, 'auto' defers to the classifier. */
export function resolveLayout(
  layout: LayoutType,
  blocks: ContentBlock[],
  context: LayoutContext = {},
): Exclude<LayoutType, 'auto'> {
  const resolved = layout === 'auto' ? chooseLayout(blocks, context) : layout
  return resolved as Exclude<LayoutType, 'auto'>
}

/*
  What the Level 2 layout picker offers for a card.

  The rule, and the reason this replaced an earlier cross-type version: a user
  picking a layout is choosing a *variety of their card's own type*, never a
  different type. A bullet-list card offers list treatments; it does not offer
  "standard" or "quote", because switching a list into a quote layout is not a
  restyle, it is a different kind of slide.

  A variety is a (layout component, visual treatment) pair. Most types map to a
  single component, so the two hand-designed treatments each component already
  carries — `visualStyle`, chosen by the AI at generation time — are what supply
  the variation. Types with two sensible components (a list can be an icon grid
  or a numbered list) get both, times two treatments.
*/

/** A coarse content family. Determines which layouts a card may be switched between. */
export type CardKind =
  | 'title'
  | 'stats'
  | 'comparison'
  | 'timeline'
  | 'quote'
  | 'list'
  | 'gallery'
  | 'image'
  | 'text'

const CARD_KIND_LABELS: Record<CardKind, string> = {
  title: 'Title',
  stats: 'Statistics',
  comparison: 'Comparison',
  timeline: 'Timeline',
  quote: 'Quote',
  list: 'List',
  gallery: 'Gallery',
  image: 'Image',
  text: 'Text',
}

export function cardKindLabel(kind: CardKind): string {
  return CARD_KIND_LABELS[kind]
}

/**
 * The card's content family. Checked in the same priority order the classifier
 * uses, so the label a user sees agrees with the layout they actually got.
 */
export function cardKind(blocks: ContentBlock[], context: LayoutContext = {}): CardKind {
  const core = setAsidePhoto(blocks)
  if (core) {
    const kind = cardKind(core, context)
    // A bare heading is a title card, but beside a photo it is an image card (the opener stays a title).
    return kind === 'text' || (kind === 'title' && !context.isFirstCard) ? 'image' : kind
  }

  const stats = blocksOfType(blocks, 'stat')
  const comparisonGroups = blocksOfType(blocks, 'comparisonGroup')
  const timelineSteps = blocksOfType(blocks, 'timelineStep')
  const bulletLists = blocksOfType(blocks, 'bulletList')
  const images = blocksOfType(blocks, 'image')
  const quotes = blocksOfType(blocks, 'quote')
  const headings = blocksOfType(blocks, 'heading')

  if (comparisonGroups.length >= 2) return 'comparison'
  if (timelineSteps.length >= 2) return 'timeline'
  if (stats.length >= 1) return 'stats'
  if (quotes.length >= 1) return 'quote'
  if (images.length >= 2) return 'gallery'
  if (bulletLists.length >= 1) return 'list'
  if (context.isFirstCard && headings.length >= 1 && blocks.length <= 2) return 'title'
  // A lone heading is a title card wherever it sits: the picker offers hero and section.
  if (headings.length === 1 && blocks.length === 1) return 'title'
  return 'text'
}

/*
  A named layout says what the card *is*, so it outranks the blocks.

  Reading the type off the blocks alone is right for the `'auto'` cards the AI
  produces, and wrong the moment somebody names a layout: a title slide added at
  position 9 carries `layout: 'hero'` precisely because the classifier would not
  award it (see `cardTemplates.ts`), and asking the blocks would report it as a
  text card — so the toolbar would name a type the slide plainly is not, and
  offer the wrong layouts to switch between.
*/
const KIND_BY_LAYOUT: Record<Exclude<LayoutType, 'auto'>, CardKind> = {
  hero: 'title',
  textFocus: 'text',
  standard: 'text',
  standardSplit: 'image',
  imageFocus: 'image',
  statHero: 'stats',
  statGrid: 'stats',
  comparison: 'comparison',
  timeline: 'timeline',
  quote: 'quote',
  iconGrid: 'list',
  numberedList: 'list',
  checklist: 'list',
  splitList: 'list',
  statList: 'stats',
  timelineRow: 'timeline',
  comparisonTable: 'comparison',
  gallery: 'gallery',
  section: 'title',
  statement: 'text',
  twoColumn: 'text',
  statSplit: 'stats',
  steps: 'timeline',
  photoList: 'list',
  beforeAfter: 'comparison',
}

/** The card's type: its named layout if it has one, otherwise what its blocks say. */
export function cardKindOf(
  card: { layout: LayoutType; blocks: ContentBlock[] },
  context: LayoutContext = {},
): CardKind {
  return card.layout === 'auto' ? cardKind(card.blocks, context) : KIND_BY_LAYOUT[card.layout]
}

/** One option in the picker: which component renders the card, and in which treatment. */
export interface LayoutVariety {
  layout: Exclude<LayoutType, 'auto'>
  visualStyle: VisualStyle
}

/*
  Treatment order is fixed and is what the picker numbers as "· 1" and "· 2",
  so an option keeps its number between openings.
*/
const TREATMENTS: VisualStyle[] = ['structured', 'expressive']

/**
 * The layout components that belong to a card type.
 *
 * Some entries still depend on the blocks (a stat grid needs two stats), so
 * this is filtered against the card in `layoutVarieties` rather than being a
 * plain constant lookup.
 */
export function componentsForKind(kind: CardKind, blocks: ContentBlock[]): Exclude<LayoutType, 'auto'>[] {
  switch (kind) {
    case 'title':
      return ['hero', 'section']
    case 'stats': {
      const stats = blocksOfType(blocks, 'stat').length
      if (stats >= 2) return ['statHero', 'statGrid', 'statList']
      // One figure beside a list can be split: the figure on one side, the list on the other.
      return stats === 1 && blocksOfType(blocks, 'bulletList').length === 1 ? ['statHero', 'statSplit'] : ['statHero']
    }
    case 'comparison':
      return blocksOfType(blocks, 'comparisonGroup').length === 2
        ? ['comparison', 'comparisonTable', 'beforeAfter']
        : ['comparison', 'comparisonTable']
    case 'timeline':
      return ['timeline', 'timelineRow', 'steps']
    case 'quote':
      return ['quote']
    case 'list':
      return blocksOfType(blocks, 'image').length === 1
        ? ['iconGrid', 'numberedList', 'checklist', 'splitList', 'photoList']
        : ['iconGrid', 'numberedList', 'checklist', 'splitList']
    case 'gallery':
      return ['gallery']
    case 'image':
      return ['imageFocus', 'standardSplit']
    case 'text': {
      // A split needs a picture beside the prose; without one it renders
      // an empty half.
      const own: Exclude<LayoutType, 'auto'>[] =
        blocksOfType(blocks, 'image').length >= 1 ? ['textFocus', 'standardSplit', 'standard'] : ['textFocus', 'standard']
      // A statement is a heading and one paragraph; two columns need prose to split.
      if (blocks.length === 2 && blocks[0].type === 'heading' && blocks[1].type === 'paragraph') own.push('statement')
      if (blocksOfType(blocks, 'paragraph').length >= 2) own.push('twoColumn')
      return own
    }
  }
}

export function layoutVarieties(blocks: ContentBlock[], kind: CardKind): LayoutVariety[] {
  return componentsForKind(kind, blocks).flatMap((layout) =>
    TREATMENTS.map((visualStyle) => ({ layout, visualStyle })),
  )
}
