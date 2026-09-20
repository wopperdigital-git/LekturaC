/*
  What is selected on the canvas, and what the toolbar's formatting therefore
  applies to.

  Two rules, and they only work as a pair:

    - A press on a card that is not selected yet selects the *card*, however
      exactly it landed on one of that card's elements. A second press, now that
      the card is selected, takes the element.
    - The toolbar reads its scope straight off that selection: an element is
      selected, so format the element; only a card is, so format the whole card;
      nothing is, so format the deck.

  The first rule exists to make the second one usable. Selection used to take
  the card and the element in a single press, on the grounds that requiring the
  card first is a step no editor asks for — but a card is almost entirely
  covered by its own elements, so "a card selected with nothing inside it" was
  a state reachable only by hitting the few pixels of padding around the
  content. In practice every press produced an element scope, and changing the
  font of a whole slide could not be expressed at all: it landed on the one
  block that had been pressed, usually the heading.

  The cost, accepted: everything needing an element selected — the drag and
  resize handles as much as the formatting — now costs a press to select the
  card first. That is the drill-in gesture PowerPoint and Keynote use for the
  same reason, and it is what buys back a scope that the toolbar has always
  offered but the canvas could not reach.

  Pure and free of React so the rules can be tested directly: they are
  interaction logic, and reading them off a rendered component is how they
  drifted apart in the first place.
*/

/**
 * What the canvas currently has selected. A card can be selected without an
 * element; an element never without its card, and an item never without the
 * element (the list) it belongs to.
 *
 * An item is the narrowest thing that can be picked — one bullet of a list, one
 * entry of a comparison group — and it is held beside `blockIndex` rather than
 * replacing it, so the list stays the selected element and the item is a
 * refinement of it. Typography still resolves to the element: font, size and
 * alignment are whole-element properties, and an item has none of its own.
 */
export type Selection = {
  cardId: string | null
  blockIndex: number | null
  itemIndex: number | null
}

/** A press that landed on one of a card's elements. */
export type ElementPress = {
  cardId: string
  blockIndex: number
}

/** A press that landed on one item of a list inside one of a card's elements. */
export type ItemPress = ElementPress & {
  itemIndex: number
}

/**
 * What the toolbar's font, size and alignment write to.
 *
 * Carries the `blockIndex` rather than a ready-made storage key, because the
 * key's shape belongs to the editor's `inline` record and lives with the code
 * that reads it — see `blockStyleKey`. Keeping that out of here is what lets
 * this module stay free of anything React-shaped.
 */
export type TypographyScope =
  | { kind: 'element'; cardId: string; blockIndex: number }
  | { kind: 'card'; cardId: string }
  | { kind: 'deck' }

/**
 * The selection after a press on one of a card's elements.
 *
 * Takes the element only when its card was already selected. See the note at
 * the top of this file for why the first press stops at the card.
 */
export function selectionAfterElementPress(current: Selection, press: ElementPress): Selection {
  if (current.cardId !== press.cardId) return { cardId: press.cardId, blockIndex: null, itemIndex: null }
  return { cardId: press.cardId, blockIndex: press.blockIndex, itemIndex: null }
}

/**
 * The selection after a press on one item of a list.
 *
 * The same drill-in as `selectionAfterElementPress` — a press on a card that is
 * not selected yet stops at the card — and then it goes one step further than an
 * element press does: it takes the item, and the list along with it.
 */
export function selectionAfterItemPress(current: Selection, press: ItemPress): Selection {
  if (current.cardId !== press.cardId) return { cardId: press.cardId, blockIndex: null, itemIndex: null }
  return { cardId: press.cardId, blockIndex: press.blockIndex, itemIndex: press.itemIndex }
}

/**
 * One step back out: an item falls back to its list, a list to its card. A card
 * stays selected — leaving the card is a press on the canvas, not a keystroke.
 */
export function selectionAfterEscape(current: Selection): Selection {
  if (current.itemIndex !== null) return { ...current, itemIndex: null }
  if (current.blockIndex !== null) return { ...current, blockIndex: null }
  return current
}

/**
 * The selection after a press on a card's own surface — around its elements
 * rather than on one — or on the canvas behind the cards, which is `null`.
 *
 * Always clears the element: reaching the card means the press missed
 * everything in it, and that is the way back out to formatting the whole slide.
 */
export function selectionAfterCardPress(cardId: string | null): Selection {
  return { cardId, blockIndex: null, itemIndex: null }
}

/** Narrowest thing selected wins: the element, else the card, else the deck. */
export function typographyScope(selection: Selection): TypographyScope {
  const { cardId, blockIndex } = selection
  if (cardId === null) return { kind: 'deck' }
  if (blockIndex === null) return { kind: 'card', cardId }
  return { kind: 'element', cardId, blockIndex }
}
