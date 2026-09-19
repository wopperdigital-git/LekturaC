import type { GeneratedCard } from '../schemas'

/**
 * Word count for validator thresholds: split on whitespace, empty runs
 * ignored (so `''` and runs of only whitespace both count as 0).
 */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length
}

/**
 * The card's title. `blocks[0]` is required to be a heading by
 * `generatedCardSchema`'s refinement, so this only falls back to `''` for a
 * card that somehow doesn't hold that invariant — never throws.
 */
export function headingOf(card: GeneratedCard): string {
  const first = card.blocks[0]
  return first?.type === 'heading' ? first.text : ''
}

/**
 * Every text field on the card except the heading (see `headingOf`), in
 * block order: a paragraph's text, each bullet item, a stat as
 * `${value} ${label}`, a quote's text (with its attribution appended when
 * present), a timeline step as `${label} ${text}`, a comparison group's own
 * heading plus its items, and an image's alt text when it has one.
 *
 * Used by the density, duplicate-content, overclaim and narration-overlap
 * rules, which all care about what's visible on the slide — never the
 * heading, which those rules weigh separately.
 */
export function visibleLines(card: GeneratedCard): string[] {
  const lines: string[] = []
  card.blocks.forEach((block, index) => {
    if (index === 0) return // the heading — excluded by definition
    switch (block.type) {
      case 'heading':
        lines.push(block.text)
        break
      case 'paragraph':
        lines.push(block.text)
        break
      case 'bulletList':
        lines.push(...block.items)
        break
      case 'stat':
        lines.push(`${block.value} ${block.label}`)
        break
      case 'image':
        if (block.alt) lines.push(block.alt)
        break
      case 'quote':
        lines.push(block.attribution ? `${block.text} ${block.attribution}` : block.text)
        break
      case 'timelineStep':
        lines.push(`${block.label} ${block.text}`)
        break
      case 'comparisonGroup':
        lines.push(block.heading, ...block.items)
        break
    }
  })
  return lines
}

/**
 * Lowercase, strip punctuation, collapse whitespace. Used everywhere two
 * strings need to be compared as "the same words" rather than the same
 * bytes — duplicate headings, duplicate bullets, filler-heading matching.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}
