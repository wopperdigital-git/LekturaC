import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Card } from '@/engine/contentBlocks'
import type { OverlayItem, Shape } from '@/engine/overlay'
import { SelectionLayer } from '@/components/editor/SelectionLayer'
import { GridOverlay } from '@/components/editor/GridOverlay'
import { OverlayLayer } from '@/components/editor/OverlayLayer'
import { DrawingSurface } from '@/components/editor/DrawingSurface'
import { ShapeSelectionLayer } from '@/components/editor/ShapeSelectionLayer'
import { DrawingContext } from '@/components/editor/drawingContext'
import { useEditorGrid } from '@/components/editor/gridContext'
import {
  BlockAdjustContext,
  BlockDataContext,
  CardBoxContext,
  SLIDE_BODY_ATTR,
} from './adjustContext'

const NO_FADING: ReadonlySet<string> = new Set()

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
  card: Pick<Card, 'adjusts' | 'inline' | 'overlay'>
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const adjusting = useContext(BlockAdjustContext)
  const grid = useEditorGrid()
  const drawing = useContext(DrawingContext)
  // Which strokes the eraser is over right now; both ink layers draw them faded.
  const [fading, setFading] = useState<ReadonlySet<string>>(NO_FADING)
  // The selected shape mid-drag: drawn in place of its stored self so it tracks the pointer.
  const [liveShape, setLiveShape] = useState<Shape | null>(null)
  const withLive = (items: readonly OverlayItem[] | undefined) =>
    liveShape && items ? items.map((item) => (item.id === liveShape.id ? liveShape : item)) : items

  // The selected shape, looked up in whichever layer holds it. Only while shapes can be selected.
  const selected = drawing?.selectable ? drawing.selectedShape : null
  const selectedItem = selected
    ? (selected.keep === 'slide' ? card.overlay : drawing?.temporaryOverlay)?.find(
        (item) => item.id === selected.id,
      )
    : undefined
  const selectedShape = selectedItem?.kind === 'shape' ? selectedItem : null

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
          {/* The editor's graph paper, in this same content-box space. Gated on
              the interaction context so no other surface can ever show it. */}
          {adjusting && grid.show && <GridOverlay contentWidth={width} />}
          {/* Ink. What is part of the slide draws on every surface (it is on the
              card); temporary ink only where the editor provides it. */}
          <OverlayLayer
            items={withLive(card.overlay)}
            width={width}
            fading={fading}
            onPressItem={drawing?.selectable ? (id) => drawing.selectShape(id, 'slide') : undefined}
          />
          {drawing && (
            <OverlayLayer
              temporary
              items={withLive(drawing.temporaryOverlay)}
              width={width}
              fading={fading}
              onPressItem={drawing.selectable ? (id) => drawing.selectShape(id, 'temporary') : undefined}
            />
          )}
          {/* Captures the drags of the pen, the eraser and the shape tool; only while one is active. */}
          {(drawing?.settings || drawing?.shapeTool) && (
            <DrawingSurface boxRef={ref} width={width} onFading={setFading} />
          )}
          {/* The box on the selected shape. */}
          {drawing && selected && selectedShape && (
            <ShapeSelectionLayer
              shape={liveShape?.id === selectedShape.id ? liveShape : selectedShape}
              width={width}
              boxRef={ref}
              onLive={setLiveShape}
              onCommit={(next) => drawing.changeShape(next, selected.keep)}
              onRemove={() => drawing.removeShape(selectedShape.id, selected.keep)}
            />
          )}
          {/* Only where something can be selected. The presenter view and the
              thumbnails render adjusted elements but draw no box around them. */}
          {adjusting && <SelectionLayer cardRef={ref} />}
        </BlockDataContext.Provider>
      </CardBoxContext.Provider>
    </div>
  )
}
