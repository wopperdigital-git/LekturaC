import { useLayoutEffect, useState } from 'react'
import type { TextAlign } from '@/engine/textStyle'
import { renderedAlign } from './measureBlock'

/**
 * The alignment the selected element is currently rendering with.
 *
 * Exists so the toolbar can light the button that matches what is on screen,
 * rather than only the one somebody explicitly set. Those are different in the
 * common case — an element nobody has aligned has no stored value at all, which
 * used to leave all three buttons dark while the text plainly sat centred.
 *
 * Deliberately has **no dependency array**. What the answer depends on is a long
 * and easy-to-miss list — the selection, the element's own style, the card's,
 * the deck's, and the layout variety, which changes the CSS classes doing the
 * aligning — and a list that missed one would leave the toolbar lighting the
 * wrong button with nothing to catch it. Reading one computed style per render
 * is cheap, and the state only updates when the value actually changes, so this
 * settles after a single pass rather than looping.
 */
export function useRenderedAlign(
  cardNode: () => HTMLElement | null,
  blockIndex: number | null,
): TextAlign | null {
  const [align, setAlign] = useState<TextAlign | null>(null)

  // The missing dependency list is the point, not an oversight — see above. The
  // bail-out on an unchanged value is what makes it terminate after one pass.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const next = blockIndex === null ? null : renderedAlign(cardNode(), blockIndex)
    // React skips the re-render when the value is identical, which is what
    // keeps a dependency-free effect from spinning.
    setAlign((current) => (current === next ? current : next))
  })

  return align
}
