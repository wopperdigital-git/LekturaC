import type { GeneratedBlock, GeneratedCard, GeneratedDeck } from './schemas'

/*
  The safety net under the structured blocks the model may write (kickers,
  points, callouts). The prompt asks for a small, disciplined use of them; this
  makes sure a deck that slips is still well formed before it is validated and
  stored: one callout a slide, points only in runs, short kickers, none on the
  title slide. Nothing here is a validator rule and nothing sends a slide to
  repair, and no provider is called: a block that breaks a rule becomes the
  plain block it nearly was, with every word kept.

  Pure. The input is never mutated, a card that needs nothing keeps its object
  identity, and the card count never changes. Idempotent: a cleaned deck is
  already clean. An optional field that parsed to `undefined` (a `.catch`) is
  treated as absent throughout.
*/

export const KICKER_MAX_WORDS = 4
export const KICKER_MAX_CHARS = 32

type Block = GeneratedBlock

function kickerTooLong(kicker: string): boolean {
  const trimmed = kicker.trim()
  const words = trimmed.split(/\s+/).filter(Boolean).length
  return words > KICKER_MAX_WORDS || trimmed.length > KICKER_MAX_CHARS
}

/** The heading without its `kicker` key at all (never `kicker: undefined`). */
function withoutKicker(block: Extract<Block, { type: 'heading' }>): Block {
  const { kicker: _kicker, ...rest } = block
  return rest
}

function hasKicker(block: Extract<Block, { type: 'heading' }>): boolean {
  return block.kicker !== undefined
}

/** `label: text`, or the text alone when there is no usable label. */
function labelled(label: string | undefined, text: string): string {
  const trimmed = label?.trim()
  return trimmed ? `${trimmed}: ${text}` : text
}

/**
 * A lone point as a paragraph that leads with its term in bold. Ingest's
 * `applyEmphasis` turns `**term**` into a bold mark; its pair matcher needs an
 * asterisk-free run, so a label that itself holds an asterisk goes in plain.
 */
function pointAsParagraph(label: string, text: string): Block {
  const term = label.trim()
  if (!term) return { type: 'paragraph', text }
  const lead = term.includes('*') ? term : `**${term}**`
  return { type: 'paragraph', text: `${lead}: ${text}` }
}

function normalizeCard(card: GeneratedCard, index: number): GeneratedCard {
  const original = card.blocks
  let blocks: Block[] = original
  let pointConverted = false

  // 1 and 4: kickers. The title slide never carries one, and a long one is a
  // sentence pretending to be a label.
  blocks = blocks.map((block) => {
    if (block.type !== 'heading' || !hasKicker(block)) return block
    if (index === 0 || kickerTooLong(block.kicker ?? '')) return withoutKicker(block)
    return block
  })

  // 2: one callout a slide. The first stays; later ones are plain paragraphs.
  let seenCallout = false
  blocks = blocks.map((block) => {
    if (block.type !== 'callout') return block
    if (!seenCallout) {
      seenCallout = true
      return block
    }
    return { type: 'paragraph', text: labelled(block.label, block.text) }
  })

  // 3: a point is only a point inside a run of two or more.
  blocks = blocks.map((block, i, all) => {
    if (block.type !== 'point') return block
    if (all[i - 1]?.type === 'point' || all[i + 1]?.type === 'point') return block
    pointConverted = true
    return pointAsParagraph(block.label, block.text)
  })

  let plan = card.plan
  if (pointConverted && plan.visualType === 'definitions' && !blocks.some((block) => block.type === 'point')) {
    plan = { ...plan, visualType: 'text' }
  }

  const changed = plan !== card.plan || blocks.some((block, i) => block !== original[i])
  if (!changed) return card
  return { ...card, plan, blocks: blocks as GeneratedCard['blocks'] }
}

export function normalizeStructuredBlocks(deck: GeneratedDeck): GeneratedDeck {
  const cards = deck.cards.map(normalizeCard)
  if (cards.every((card, i) => card === deck.cards[i])) return deck
  return { ...deck, cards }
}
