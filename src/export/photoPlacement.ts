import type { ImageBlock } from '@/engine/contentBlocks'
import { imageSize } from './imageData'
import type { PptxSlide } from './slideRenderers'
import { hex } from './textRun'
import { WIDTH_HEADROOM, type TextMeasurer } from './textFit'

/*
  Drawing a fetched photo onto a slide: the picture in a box, a scrim over a
  full-slide one, the photographer's credit, and the white-text rule for words
  that sit on a photo. Pure over the structural `PptxSlide`, like the renderers.
*/

export interface PhotoBox {
  x: number
  y: number
  w: number
  h: number
  /** Degrees, 0-359, as pptxgenjs takes them. */
  rotate?: number
}

/** LAYOUT_16x9 in inches; the one definition, shared with `slideRenderers.ts`. */
export const SLIDE_W = 10
export const SLIDE_H = 5.625

/** The credit's type size, in points. */
export const CREDIT_PT = 8
const CREDIT_H = 0.2
const CREDIT_INSET = 0.08
/** Room for the pill's padding either side of the words. */
const CREDIT_PAD = 0.2

/**
 * The picture's data if it can be drawn properly, else `undefined` (draw the alt text).
 *
 * A `cover` crop is worked out against the picture's real aspect, so a picture whose
 * header cannot be read is never placed: it would be stretched to its box, which is
 * worse than the alt text. `prefetchDeckImages` already refuses such pictures; this
 * guards a map that was built another way.
 */
export function usablePhoto(images: ReadonlyMap<string, string>, url: string): string | undefined {
  const data = images.get(url)
  return data && imageSize(data) ? data : undefined
}

/**
 * The picture in `box`, cropped to fill it.
 *
 * pptxgenjs works a `cover` crop out against the size it is given as the
 * picture's own, so w/h carry the picture's real aspect (read from its header)
 * and `sizing` carries the box. Nothing is drawn for a picture whose header cannot
 * be read (see `usablePhoto`).
 */
export function addPhoto(slide: PptxSlide, data: string, box: PhotoBox, alt: string | undefined): void {
  const size = imageSize(data)
  if (!size) return
  slide.addImage({
    data,
    x: box.x,
    y: box.y,
    w: box.w,
    h: (box.w * size.h) / size.w,
    sizing: { type: 'cover', w: box.w, h: box.h },
    altText: alt ?? '',
    ...(box.rotate ? { rotate: box.rotate } : {}),
  })
}

/** A black veil over the whole slide, `transparency` percent see-through. */
export function addScrim(slide: PptxSlide, transparency: number): void {
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: SLIDE_H,
    fill: { color: '000000', transparency },
    line: { type: 'none' },
  })
}

/** The credit text for a block, or `null` when it has none to give (no credit, or a pasted link). */
export function creditText(block: ImageBlock): string | null {
  const credit = block.credit
  return credit && credit.source === 'pexels' ? `Photo: ${credit.name} / Pexels` : null
}

/**
 * "Photo: <name> / Pexels" at 8pt in the bottom right of `box`.
 *
 * Over a full-slide photo the scrim already sits behind it; on a photo in a box it
 * gets its own small dark pill so it stays legible on any picture, as it does on screen.
 *
 * Left out, rather than drawn wrong, when it cannot be drawn properly: a rotated
 * photo (the credit would need the same rotation about the photo's centre) or a box
 * too narrow to hold the words on one line (measured with the renderer's own measurer).
 */
export function addCredit(
  slide: PptxSlide,
  block: ImageBlock,
  box: PhotoBox,
  face: string,
  measure: TextMeasurer,
  options: { pill: boolean },
): void {
  const text = creditText(block)
  if (!text || box.rotate) return
  const words = measure(text, { face, sizePt: CREDIT_PT, bold: false, italic: false }) * WIDTH_HEADROOM
  const w = words + CREDIT_PAD
  if (w > box.w - 2 * CREDIT_INSET) return
  const x = box.x + box.w - CREDIT_INSET - w
  const y = box.y + box.h - CREDIT_INSET - CREDIT_H
  if (options.pill) {
    slide.addShape('roundRect', {
      x,
      y,
      w,
      h: CREDIT_H,
      rectRadius: CREDIT_H / 2,
      fill: { color: '000000', transparency: 45 },
      line: { type: 'none' },
    })
  }
  slide.addText(text, {
    x,
    y,
    w,
    h: CREDIT_H,
    fontFace: face,
    fontSize: CREDIT_PT,
    color: hex('#ffffff'),
    align: 'right',
    valign: 'middle',
    margin: 3,
    fit: 'shrink',
  })
}

/**
 * The slide with every piece of text forced white, run colours included.
 *
 * On screen text over a photo ignores every colour pick (deck, card, element,
 * character); the scrim is what makes white legible, so the export has to agree.
 */
export function whiteText(slide: PptxSlide): PptxSlide {
  const white = hex('#ffffff')
  return {
    addImage: (options) => slide.addImage(options),
    addShape: (shape, options) => slide.addShape(shape, options),
    addText(text, options) {
      if (typeof text === 'string') return slide.addText(text, { ...options, color: white })
      const runs = text.map((run) => ({
        text: run.text,
        options: run.options.color === undefined ? run.options : { ...run.options, color: white },
      }))
      return slide.addText(runs, { ...options, color: white })
    },
  }
}
