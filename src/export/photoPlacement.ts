import type { ImageBlock } from '@/engine/contentBlocks'
import { imageSize } from './imageData'
import type { PptxSlide } from './slideRenderers'
import { hex } from './textRun'

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

const SLIDE_W = 10
const SLIDE_H = 5.625

/** The credit's type size, in points. */
export const CREDIT_PT = 8
const CREDIT_H = 0.2
const CREDIT_INSET = 0.08
/** Average advance of a 8pt character in inches, with room to spare (credits are short Latin names). */
const CREDIT_CHAR_W = 0.062

/**
 * The picture in `box`, cropped to fill it.
 *
 * pptxgenjs works a `cover` crop out against the size it is given as the
 * picture's own, so w/h carry the picture's real aspect (read from its header)
 * and `sizing` carries the box. A picture whose header cannot be read falls
 * back to the box's own shape, which fills it without cropping.
 */
export function addPhoto(slide: PptxSlide, data: string, box: PhotoBox, alt: string | undefined): void {
  const size = imageSize(data)
  const natural = size ? { w: box.w, h: (box.w * size.h) / size.w } : { w: box.w, h: box.h }
  slide.addImage({
    data,
    x: box.x,
    y: box.y,
    w: natural.w,
    h: natural.h,
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
 */
export function addCredit(
  slide: PptxSlide,
  block: ImageBlock,
  box: PhotoBox,
  face: string,
  options: { pill: boolean },
): void {
  const text = creditText(block)
  if (!text) return
  const w = Math.min(box.w - 2 * CREDIT_INSET, text.length * CREDIT_CHAR_W + 0.2)
  if (w <= 0) return
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
