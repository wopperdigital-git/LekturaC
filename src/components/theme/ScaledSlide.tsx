import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { SLIDE_WIDTH_PX, slideScale } from '@/lib/slideSize'

/**
 * Lays its slide out at `SLIDE_WIDTH_PX` and draws it scaled to the width it is
 * given (up to `maxDisplayWidth`), taking up exactly the scaled height — so the
 * text wraps as it does in the editor, whatever the screen. See `lib/slideSize.ts`.
 *
 * For the presenter, where the slide is the page; the previews and thumbnails do
 * the same scaling inside their own fixed frames.
 */
export function ScaledSlide({ maxDisplayWidth, children }: { maxDisplayWidth?: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const box = outer.current
    const content = inner.current
    if (!box || !content) return
    // offsetHeight is the untransformed height, so the scale cannot feed back into it.
    const measure = () => {
      setWidth(box.clientWidth)
      setHeight(content.offsetHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const scale = slideScale(width, maxDisplayWidth)

  return (
    <div ref={outer} className="w-full">
      <div className="mx-auto" style={{ width: SLIDE_WIDTH_PX * scale, height: height * scale }}>
        <div
          ref={inner}
          className="origin-top-left"
          style={{ width: SLIDE_WIDTH_PX, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
