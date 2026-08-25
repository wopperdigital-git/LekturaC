import type { Card } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { TextStyle } from '@/engine/textStyle'
import { mergeTextStyle } from '@/engine/textStyle'
import { slideGroup } from './slideGroup'
import { RENDERERS, type PptxSlide } from './slideRenderers'
import { backdropPng } from './backdrop/rasterize'
import { hex } from './textRun'

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

  const ordered = [...deck.cards].sort((a, b) => a.orderIndex - b.orderIndex)

  ordered.forEach((card, index) => {
    const slide = pptx.addSlide()
    slide.background = background
    const style = mergeTextStyle(deck.textStyle, card.textStyle)
    RENDERERS[slideGroup(card, index === 0)](slide as unknown as PptxSlide, card, deck.theme, style)
  })

  await pptx.writeFile({ fileName: pptxFileName(deck.title) })
}
