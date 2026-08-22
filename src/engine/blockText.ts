import type { ContentBlock } from './contentBlocks'

/*
  Blocks hold their text in differently-named fields (`text`, `value`, `label`,
  `items[n]`, …), so an inline editor would otherwise need a branch per block
  type in the DOM layer. Instead every editable text node carries a
  `data-text-path`, and these two functions are the only place that knows what a
  path means — the renderer, the click handler, and the store all stay generic.

  Grammar: a field name (`text`, `value`, `attribution`, …) or `items.<n>`.
*/

const TEXT_FIELDS: Record<ContentBlock['type'], readonly string[]> = {
  heading: ['text'],
  paragraph: ['text'],
  bulletList: [],
  stat: ['value', 'label'],
  image: [],
  quote: ['text', 'attribution'],
  timelineStep: ['label', 'text'],
  comparisonGroup: ['heading'],
}

const LIST_BLOCKS = new Set<ContentBlock['type']>(['bulletList', 'comparisonGroup'])

function itemIndex(path: string): number | null {
  const match = /^items\.(\d+)$/.exec(path)
  return match ? Number(match[1]) : null
}

export function getTextAtPath(block: ContentBlock, path: string): string | null {
  const index = itemIndex(path)
  if (index !== null) {
    if (!LIST_BLOCKS.has(block.type)) return null
    const items = (block as { items?: string[] }).items
    return items?.[index] ?? null
  }
  if (!TEXT_FIELDS[block.type].includes(path)) return null
  const value = (block as unknown as Record<string, unknown>)[path]
  return typeof value === 'string' ? value : null
}

/**
 * Returns a new block with the text at `path` replaced, or `null` when the path
 * doesn't address text on this block or the new value is blank — every text
 * field in the zod schema is `min(1)`, so a blank write would produce a card
 * that no longer validates. Callers revert to the old text on `null`.
 */
export function setTextAtPath(block: ContentBlock, path: string, value: string): ContentBlock | null {
  const next = value.trim()
  if (!next) return null

  const index = itemIndex(path)
  if (index !== null) {
    if (!LIST_BLOCKS.has(block.type)) return null
    const items = (block as { items?: string[] }).items
    if (!items || index < 0 || index >= items.length) return null
    const nextItems = [...items]
    nextItems[index] = next
    return { ...block, items: nextItems } as ContentBlock
  }

  if (!TEXT_FIELDS[block.type].includes(path)) return null
  if (getTextAtPath(block, path) === null) return null
  return { ...block, [path]: next } as ContentBlock
}
