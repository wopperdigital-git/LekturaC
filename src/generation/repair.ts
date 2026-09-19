import { generatedCardSchema, type GeneratedDeck, type RepairResponse } from './schemas'

/**
 * Writes a repair call's replacement cards into `deck`, but only for slides
 * that were actually targeted — see the design spec's "[4] Targeted repair".
 * This is the same invariant `mergeNarration` (`engine/narration.ts`) holds
 * for hand-written scripts: a model reply is not itself permission to write
 * anywhere it likes, only to the slides the caller asked it to fix.
 *
 * A repair is dropped, rather than applied, when:
 * - its slide number doesn't map to one of `targets` (0-based `slide - 1`),
 * - that index falls outside the deck's own cards (a model-invented slide
 *   number), or
 * - the replacement doesn't parse as a `GeneratedCard` (a malformed reply
 *   must not corrupt a deck nothing here can regenerate).
 *
 * The deck's length never changes — only existing indices are ever replaced —
 * and the input `deck` is never mutated: a new deck object is returned, with
 * a shallow-copied `cards` array so untouched cards keep their original
 * object identity.
 */
export function applyRepairs(
  deck: GeneratedDeck,
  response: RepairResponse,
  targets: number[],
): { deck: GeneratedDeck; repaired: number[] } {
  const targetSet = new Set(targets)
  const cards = [...deck.cards]
  const repaired = new Set<number>()

  for (const repair of response.repairs) {
    const index = repair.slide - 1
    if (!targetSet.has(index)) continue
    if (index < 0 || index >= cards.length) continue
    const parsed = generatedCardSchema.safeParse(repair.card)
    if (!parsed.success) continue
    // A replacement that omits "role" while the original card had one keeps
    // the original's role rather than losing it: `role` is what
    // `roleLayoutHint` uses to give a story deck's insight/closing-line cards
    // their hero treatment (see CLAUDE.md's Generation pipeline section), and
    // the repair prompt asks the model to fix a slide's problems, not to
    // decide from scratch whether it still fills a blueprint row.
    const original = cards[index]
    const card = parsed.data.role === undefined && original.role !== undefined
      ? { ...parsed.data, role: original.role }
      : parsed.data
    cards[index] = card
    repaired.add(index)
  }

  return {
    deck: { ...deck, cards },
    repaired: [...repaired].sort((a, b) => a - b),
  }
}
