import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SlideBody } from '@/components/layouts/SlideBody'
import { SlideSurface, SLIDE_SURFACE_CLASS } from './SlideSurface'

/**
 * A render smoke test for the one thing no pure test can see: the surface is a
 * 16:9 floor, not a fixed box. `overflow-hidden` would make it a scroll
 * container and pin it to 16:9 (clipping a tall slide), so it must stay
 * `overflow-clip`.
 */
describe('SlideSurface', () => {
  const html = renderToStaticMarkup(<SlideSurface>x</SlideSurface>)

  it('is a centred 16:9 floor that clips its corners without becoming a scroll container', () => {
    expect(html).toContain('aspect-video')
    expect(html).toContain('overflow-clip')
    expect(html).toContain('flex-col')
    expect(html).toContain('justify-center')
    expect(html).not.toContain('overflow-hidden')
  })

  it('exports the same class string it renders', () => {
    expect(html).toContain(SLIDE_SURFACE_CLASS)
  })

  it("keeps the caller's classes", () => {
    expect(renderToStaticMarkup(<SlideSurface className="p-8 rounded-slide">x</SlideSurface>)).toContain(
      'p-8 rounded-slide',
    )
  })

  it('has SlideBody fill the floor and centre the layout inside itself', () => {
    // Ink, grid and the drawing tools are children of SlideBody, so it must span
    // the whole slide, not shrink to the content and be centred by the surface.
    const body = renderToStaticMarkup(
      <SlideSurface>
        <SlideBody card={{ adjusts: undefined, inline: undefined, overlay: undefined }}>
          <p>content</p>
        </SlideBody>
      </SlideSurface>,
    )
    const bodyTag = body.match(/<div[^>]*data-slide-body[^>]*>/)?.[0] ?? ''
    expect(bodyTag).toContain('flex-1')
    expect(bodyTag).toContain('flex-col')
    expect(bodyTag).toContain('justify-center')
    expect(bodyTag).toContain('@container')
  })
})
