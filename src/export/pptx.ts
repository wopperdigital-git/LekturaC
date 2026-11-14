import type { Card } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { TextStyle } from '@/engine/textStyle'
import { mergeTextStyle } from '@/engine/textStyle'
import { resolveLayout } from '@/engine/layoutEngine'
import { slideGroup } from './slideGroup'
import { prefetchDeckImages } from './imageData'
import { RENDERERS, type PptxSlide } from './slideRenderers'
import { backdropPng } from './backdrop/rasterize'
import { hex } from './textRun'
import { createCanvasMeasurer } from './measureText'

/*
  The one entry point. Takes a deck as data and hands the browser a .pptx.

  `pptxgenjs` is loaded through a dynamic import and nowhere else in the app:
  it is roughly a megabyte, and somebody who never exports should not carry it
  in the main bundle. The caller's spinner covers the chunk fetch.
*/

export interface ExportableDeck {
  title: string
  theme: ThemeTokens
  textStyle: TextStyle
  cards: Card[]
}

/** A filesystem-safe name for the download, falling back when the deck is untitled. */
export function pptxFileName(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'presentation'}.pptx`
}

export async function exportDeckToPptx(deck: ExportableDeck): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs')

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.title = deck.title

  /*
    One backdrop for the whole deck, not one per slide: it depends only on the
    theme and every slide is the same 16:9, so a 30-card deck carries a single
    image instead of thirty copies of it.

    Decoration must never fail the export — if the raster step cannot run, the
    slides fall back to the theme's flat background colour and the text, which
    is the part that matters, still arrives.
  */
  let background: { data: string } | { color: string }
  try {
    background = { data: await backdropPng(deck.theme) }
  } catch {
    background = { color: hex(deck.theme.colors.background) }
  }

  /*
    The backdrop is declared once on a slide master, not assigned to
    `slide.background` per slide. pptxgenjs embeds a fresh media part for
    every distinct `background` assignment it sees — setting the same data
    string on each slide still writes N copies of the image into the file, not
    a shared reference. A 30-card deck would carry thirty ~1.5MB PNGs instead
    of one. Every slide is created from this one master instead, so the image
    part is written once and every slide just points at it.

    The exception is a tinted or deep slide (a quote, a stat hero, a title): its
    renderer assigns `slide.background = { color }`, a flat colour and not image
    data, so it adds no media part and the one-image rule above still holds. A plain
    slide assigns nothing and keeps the master.
  */
  const MASTER = 'LEKTURA_BACKDROP'
  pptx.defineSlideMaster({ title: MASTER, background })

  const ordered = [...deck.cards].sort((a, b) => a.orderIndex - b.orderIndex)

  // Built once, not once per slide/re-measured word: the canvas, the loaded
  // fonts, and the per-(font,text) cache are all shared across every slide in
  // the deck.
  //
  // The photos the export can place are fetched in the same wait, once, before any
  // slide is drawn, so the renderers stay pure (they are handed the map and never touch
  // the network). A picture that cannot be fetched is simply absent and its slide draws
  // the alt text it always did; this step cannot fail the export.
  const [measure, images] = await Promise.all([createCanvasMeasurer(), prefetchDeckImages(ordered)])

  ordered.forEach((card, index) => {
    const slide = pptx.addSlide({ masterName: MASTER })
    const style = mergeTextStyle(deck.textStyle, card.textStyle)
    const layout = resolveLayout(card.layout, card.blocks, { isFirstCard: index === 0 })
    RENDERERS[slideGroup(card, index === 0)](slide as unknown as PptxSlide, card, deck.theme, style, measure, {
      images,
      layout,
    })
  })

  await pptx.writeFile({ fileName: pptxFileName(deck.title) })
}
