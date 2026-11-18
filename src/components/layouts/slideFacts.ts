import { createContext, useContext } from 'react'
import type { Ground } from '@/engine/composition'

/**
 * What a block drawn deep inside a frame needs to know about its slide and cannot read off its own
 * block: which block index owns the slide's one accent fill (`accentOwner`, so a callout marks itself
 * `data-accent-owner` only when it is that block), and the slide's ground (so a code panel puts itself
 * on the deep ground on a plain or tint slide, and leaves it to the stylesheet on a deep one).
 *
 * `LayoutRenderer` provides it from the resolved layout, the same one the slide's own ground is read
 * from. A context rather than props, because the blocks are reached through `Leftovers`, `BodyUnits`,
 * the groups and a dozen frames, none of which should carry it. Outside a `LayoutRenderer` the slide is
 * plain and nothing owns the accent.
 */
export interface SlideFacts {
  accentOwner: number | null
  ground: Ground
}

export const SlideFactsContext = createContext<SlideFacts>({ accentOwner: null, ground: 'plain' })

export function useSlideFacts(): SlideFacts {
  return useContext(SlideFactsContext)
}
