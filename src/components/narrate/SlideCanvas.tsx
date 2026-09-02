import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { fitScale } from '@/lib/fitScale'

/**
 * The slide's natural width before scaling.
 *
 * Fixed rather than fluid, and that is the point: the slide is laid out once at
 * one width and then scaled, so a card's line breaks, its heading size and its
 * element nudges are identical whatever the window is doing. Letting the width
 * follow the container instead would reflow the text on every resize and give
 * the same deck a different shape on every screen — the outline rail's
 * thumbnails and the dashboard's covers use the same trick for the same reason.
 *
 * 1000px is close to the width the canvas actually gets on a normal window, so
 * the common case scales by roughly 1 and stays crisp.
 */
const NATURAL_WIDTH = 1000

/**
 * Fits a whole slide inside the space available, without ever scrolling.
 *
 * The measurement has to avoid an obvious trap: the thing being measured is the
 * thing being transformed. `getBoundingClientRect` reports the *scaled* box, so
 * feeding it back in would settle on some arbitrary fixed point (or oscillate).
 * `offsetWidth`/`offsetHeight` report the layout box and ignore transforms
 * entirely, so they are the honest read of "how big is this card really".
 *
 * The inner box is absolutely positioned so its natural height cannot push the
 * container taller — the container's height is the constraint, not a result.
 */
export function SlideCanvas({ children }: { children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  /*
    Layout effect, not a passive one: a passive effect runs after paint, so the
    slide would be drawn at full size for one frame and then snap down — a
    visible jolt on every slide change. This is the same reason `ThemeProvider`
    applies its tokens in a layout effect.
  */
  useLayoutEffect(() => {
    const box = boxRef.current
    const content = contentRef.current
    if (!box || !content) return

    const measure = () => {
      setScale(
        fitScale(
          { width: content.offsetWidth, height: content.offsetHeight },
          { width: box.clientWidth, height: box.clientHeight },
        ),
      )
    }
    measure()

    // Both change independently: the box on a window resize or a panel opening,
    // the content when the card changes or its text rewraps.
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    observer.observe(content)
    return () => observer.disconnect()
    // Set up once: both nodes outlive every card change, and the observer is
    // what reports a new card's height — re-subscribing per render would churn
    // an observer for no extra coverage.
  }, [])

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden">
      <div
        ref={contentRef}
        style={{
          width: NATURAL_WIDTH,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
        className="absolute left-1/2 top-1/2 origin-center"
      >
        {children}
      </div>
    </div>
  )
}
