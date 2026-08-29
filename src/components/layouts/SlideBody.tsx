import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Card } from '@/engine/contentBlocks'
import { SelectionLayer } from '@/components/editor/SelectionLayer'
import {
  BlockAdjustContext,
  BlockDataContext,
  CardBoxContext,
  SLIDE_BODY_ATTR,
} from './adjustContext'

/**
 * The positioning context and coordinate space for one card's elements.
 *
 * Every surface that draws a slide goes through this — the editor canvas, the
 * presenter view, the outline thumbnails — and that is the point. An element's
 * nudge is stored as a fraction of the card's width, so *something* has to know
 * that width before the fraction can become pixels again; if only the editor
 * provided it, a moved element would sit where it was put on the canvas and
 * snap back to its layout position everywhere else.
 *
 * The width is measured rather than assumed because a card is responsive: wide
 * on a desktop, narrower on a laptop, 800px in a thumbnail, wider again in the
 * presenter. A fraction reproduces the same arrangement at all of them.
 *
 * The wrapper is a plain full-width block, so inserting it changes no layout,
 * and `relative` makes it the origin the selection box measures and positions
 * against. It sits *inside* the card's padding, so the coordinate space is the
 * content box — which is what "align this element left" should mean.
 */
export function SlideBody({
  card,
  children,
}: {
  /**
   * The card being drawn. Its `adjusts` and `inline` are what make an element's
   * nudge and its own typography show up — on *every* surface, not just the
   * editor, which is why this is a prop here rather than something the canvas
   * provides on its own.
   */
  card: Pick<Card, 'adjusts' | 'inline'>
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const adjusting = useContext(BlockAdjustContext)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const update = () => setWidth(node.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="relative" {...{ [SLIDE_BODY_ATTR]: true }}>
      <CardBoxContext.Provider value={{ width }}>
        <BlockDataContext.Provider value={{ adjusts: card.adjusts, inline: card.inline }}>
          {children}
          {/* Only where something can be selected. The presenter view and the
              thumbnails render adjusted elements but draw no box around them. */}
          {adjusting && <SelectionLayer cardRef={ref} />}
        </BlockDataContext.Provider>
      </CardBoxContext.Provider>
    </div>
  )
}
