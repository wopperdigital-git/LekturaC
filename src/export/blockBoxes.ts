import type { Card, ContentBlock } from '@/engine/contentBlocks'
import { NO_ADJUST, type BlockAdjust } from '@/engine/blockAdjust'
import type { ThemeTokens } from '@/lib/theme-tokens'

/*
  Where each element of a card sits, for the export's benefit only.

  On screen this question is answered by the browser: one of twelve
  hand-designed layout components arranges the card, and the selection layer
  measures the result. `src/export/` has no DOM and may not import React, so it
  cannot measure anything — and an element's stored nudge is a *delta* from a
  position it therefore does not know.

  So this recomputes a baseline: a plain stacked arrangement of the same blocks,
  in the same normalized space the nudges are stored in. The nudges then apply
  on top of it exactly as they do on screen.

  The honest limitation, stated plainly: this is not a reproduction of the
  twelve layouts. An untouched card never comes near this code — it exports
  through one of the five arrangements in `slideRenderers.ts`, unchanged. A card
  with nudges does, and its baseline is this stack rather than the hero or
  timeline treatment it has on screen. What survives exactly is the thing the
  user actually did: the direction, distance and size of every nudge, relative
  to the card.

  Units match `engine/blockAdjust.ts`: the card is 1 wide, and every measurement
  including height is a fraction of that width. Keeping the two in the same
  space is what lets an adjustment be added straight onto a box here with no
  conversion to get wrong.
*/

export interface Box {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

const MARGIN = 0.05
const ROW_GAP = 0.017
const COLUMN_GAP = 0.017
const CONTENT_W = 1 - MARGIN * 2

type TypeScale = ThemeTokens['typography']['scale']

/**
 * The type scale the constants below were read off (the original presets').
 * Every height and line length here follows the theme's scale relative to this
 * one, so a theme with larger type gets proportionally taller boxes and shorter
 * lines — without it `fitText` shrinks nudged cards' text to boxes sized for the
 * old, smaller type. Passing this scale (or none) reproduces the constants.
 */
export const CALIBRATION_SCALE: TypeScale = [2.75, 1.875, 1.375, 1]

/** How much larger each of the theme's steps is than the calibration's. */
interface Steps {
  h1: number
  h2: number
  h3: number
  body: number
}

function stepsOf(scale: TypeScale): Steps {
  const [h1, h2, h3, body] = scale
  return {
    h1: h1 / CALIBRATION_SCALE[0],
    h2: h2 / CALIBRATION_SCALE[1],
    h3: h3 / CALIBRATION_SCALE[2],
    body: body / CALIBRATION_SCALE[3],
  }
}

/*
  Text height is estimated from character count rather than measured — it only
  has to be roughly right, and an estimate keeps this pure. The constants are
  proportions of the card's width, read off a typical rendered card at the
  calibration scale; `naturalHeight` scales them by the theme's own steps.
*/
const BODY_LINE_H = 0.028
const CHARS_PER_LINE = 62
const QUOTE_LINE_H = 0.031
const QUOTE_CHARS_PER_LINE = 52

/** At most this many stats or comparison groups share one row before wrapping. */
const MAX_COLUMNS = 4

function lines(text: string, charsPerLine: number): number {
  return Math.max(1, Math.ceil(text.length / charsPerLine))
}

function naturalHeight(block: ContentBlock, step: Steps): number {
  switch (block.type) {
    case 'heading':
      return 0.078 * step.h2
    case 'paragraph':
      // A larger body is taller and fits fewer characters on a line.
      return lines(block.text, CHARS_PER_LINE / step.body) * BODY_LINE_H * step.body
    case 'bulletList':
      return block.items.length * 0.033 * step.body
    case 'stat':
      // The figure follows h1, its label the body.
      return 0.07 * step.h1 + 0.029 * step.body
    case 'image':
      return 0.198
    case 'quote':
      return (
        lines(block.text, QUOTE_CHARS_PER_LINE / step.h3) * QUOTE_LINE_H * step.h3 +
        (block.attribution ? 0.023 * step.body : 0)
      )
    case 'timelineStep':
      return 0.062 * step.body
    case 'comparisonGroup':
      return (0.047 + block.items.length * 0.027) * step.body
  }
}

interface Row {
  entries: { index: number; block: ContentBlock }[]
  height: number
}

/*
  One block per row, except that runs of stats and runs of comparison groups
  share a row. Those two are the block types that only mean something *beside*
  their siblings: four stats stacked read as four unrelated numbers, and a
  comparison whose sides are stacked is no longer a comparison.
*/
function buildRows(blocks: ContentBlock[], step: Steps): Row[] {
  const rows: Row[] = []
  let i = 0

  while (i < blocks.length) {
    const type = blocks[i].type
    const groups = type === 'stat' || type === 'comparisonGroup'
    const entries: Row['entries'] = []

    do {
      entries.push({ index: i, block: blocks[i] })
      i++
    } while (groups && i < blocks.length && blocks[i].type === type && entries.length < MAX_COLUMNS)

    rows.push({ entries, height: Math.max(...entries.map((e) => naturalHeight(e.block, step))) })
  }

  return rows
}

export interface CardBoxes {
  /** Every block's box, keyed by index, with its nudge already applied. */
  boxes: Record<string, Box>
  /** The card's height, in the same width-fractions — its aspect ratio. */
  height: number
}

/**
 * Every block's box on one card, with each element's stored nudge applied.
 *
 * The baseline stack is computed first and the nudges are added on top, in that
 * order, for the same reason the on-screen renderer works that way: the nudge
 * is a delta, so it has to be applied to a position rather than replace one.
 *
 * `scale` is the theme's type scale: text heights and line lengths follow it
 * (see `CALIBRATION_SCALE`).
 */
export function cardBoxes(
  card: Pick<Card, 'blocks' | 'adjusts'>,
  scale: TypeScale = CALIBRATION_SCALE,
): CardBoxes {
  const rows = buildRows(card.blocks, stepsOf(scale))
  const boxes: Record<string, Box> = {}
  let y = MARGIN

  for (const row of rows) {
    const columns = row.entries.length
    const w = (CONTENT_W - COLUMN_GAP * (columns - 1)) / columns

    row.entries.forEach((entry, column) => {
      const adjust: BlockAdjust = card.adjusts?.[String(entry.index)] ?? NO_ADJUST
      boxes[String(entry.index)] = {
        x: MARGIN + column * (w + COLUMN_GAP) + adjust.dx,
        y: y + adjust.dy,
        w: adjust.w ?? w,
        h: adjust.h ?? row.height,
        rotation: adjust.rotation,
      }
    })

    y += row.height + ROW_GAP
  }

  /*
    The card's height is the stack's, extended to cover anything a nudge pushed
    past the bottom. Without that an element dragged downwards would fall off
    the exported slide, which is the one outcome worse than an approximate
    baseline.
  */
  let bottom = y - ROW_GAP + MARGIN
  for (const box of Object.values(boxes)) bottom = Math.max(bottom, box.y + box.h + MARGIN)

  return { boxes, height: bottom }
}
