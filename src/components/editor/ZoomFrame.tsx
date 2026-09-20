import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CanvasZoomContext } from './zoomContext'

/**
 * Draws its children at `zoom` times their natural size.
 *
 * A transform, because it is the one scaling mechanism whose behaviour is the
 * same everywhere: layout stays in unscaled pixels and only the picture (and the
 * rectangles the browser reports for it) is scaled. That is what keeps a card's
 * own responsive layout — and the width its nudges are stored as a fraction of —
 * identical at every zoom. The alternatives change layout itself (`zoom`, whose
 * geometry APIs have differed between engines) or fake it by resizing the column
 * (which reflows text instead of scaling it).
 *
 * A transform takes no room, so two things it would otherwise get wrong are
 * done by hand. The scroll area has to be as tall as the *scaled* content, or
 * zooming in leaves the bottom unreachable and zooming out leaves a void. And the
 * scaled content has to be as wide as its picture, with automatic margins: those
 * collapse to zero when it is wider than the window, so it starts at the left
 * edge and can be scrolled to. Centred by a transform's own origin it would
 * overflow equally to the left, into a region nothing can scroll to.
 *
 * At 100% it renders no transform at all — a stacking context and a containing
 * block for nothing — so the default view is exactly what it was before zoom
 * existed.
 */
export function ZoomFrame({
  zoom,
  maxWidth,
  children,
}: {
  zoom: number
  /** The natural width of the column, in unscaled pixels; narrower windows shrink it. */
  maxWidth: number
  children: ReactNode
}) {
  const available = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(maxWidth)
  const [innerHeight, setInnerHeight] = useState(0)

  useLayoutEffect(() => {
    const outer = available.current
    const content = inner.current
    if (!outer || !content) return
    const measure = () => {
      setAvailableWidth(outer.clientWidth)
      setInnerHeight(content.offsetHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const zoomed = zoom !== 1
  const natural = Math.min(maxWidth, availableWidth)

  /*
    One tree whatever the zoom, and only styles differ. Rendering a different
    structure at 100% would unmount and remount every card the moment zoom
    crossed it — dropping the text being edited and the selection with it.
  */
  return (
    <CanvasZoomContext.Provider value={zoom}>
      <div ref={available} className="w-full">
        <div
          style={
            zoomed
              ? { width: natural * zoom, height: innerHeight * zoom, marginInline: 'auto' }
              : { maxWidth, marginInline: 'auto' }
          }
        >
          <div
            ref={inner}
            style={zoomed ? { width: natural, transform: `scale(${zoom})`, transformOrigin: 'top left' } : undefined}
          >
            {children}
          </div>
        </div>
      </div>
    </CanvasZoomContext.Provider>
  )
}
