import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { SLIDE_WIDTH_PX } from '@/lib/slideSize'
import { frameScale } from '@/video/timeline'

/**
 * Lays its slide out at `SLIDE_WIDTH_PX` and draws it scaled so the whole slide
 * fits inside its parent, width and height both (the parent must give it a
 * size). The sibling of `ScaledSlide`, which fits the width only and takes up
 * the slide's height.
 *
 * For the projector window and the presenter console, where the slide gets a
 * fixed box and must never be cut off or scrolled.
 */
export function FittedSlide({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [contentHeight, setContentHeight] = useState(0)

  useLayoutEffect(() => {
    const frame = outer.current
    const content = inner.current
    if (!frame || !content) return
    // offsetHeight is the untransformed height, so the scale cannot feed back into it.
    const measure = () => {
      setBox({ width: frame.clientWidth, height: frame.clientHeight })
      setContentHeight(content.offsetHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const scale = frameScale(SLIDE_WIDTH_PX, contentHeight, box.width, box.height)

  return (
    <div ref={outer} className="flex h-full w-full items-center justify-center">
      <div className="shrink-0" style={{ width: SLIDE_WIDTH_PX * scale, height: contentHeight * scale }}>
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
