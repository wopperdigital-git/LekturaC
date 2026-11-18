import type { CSSProperties } from 'react'
import type { ContentBlock } from '@/engine/contentBlocks'
import { slotsOf } from '@/engine/composition'

/**
 * The body indices the frame hands its child (everything but the claim and lead, ascending,
 * minus the drawn aside), for callers that must know them before the frame renders.
 */
export function frameBody(blocks: ContentBlock[], asideIndex: number | null = null): number[] {
  const slots = slotsOf(blocks)
  const rest = slots.aside === null ? slots.body : [...slots.body, slots.aside].sort((a, b) => a - b)
  return asideIndex === null ? rest : rest.filter((index) => index !== asideIndex)
}

/**
 * `--zone-width: 100cqi` is the width of the nearest container, for the arrangements that cap a
 * size by it (numerals): an unregistered custom property is substituted as tokens and resolved
 * where it is used, so `100cqi` there is the panel's width. Off a panel it is unset.
 */
export const ZONE_WIDTH = { '--zone-width': '100cqi' } as CSSProperties
