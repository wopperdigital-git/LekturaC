import type { Card, ContentBlock } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { TextStyle } from '@/engine/textStyle'
import { textRef } from '@/engine/marks'
import { cardBoxes, type Box } from './blockBoxes'
import type { PptxTextRun } from './textRun'
import { faceName, hex, markedRuns, pointSize, resolveRunStyle } from './textRun'
import type { PptxGroup } from './slideGroup'
import type { TextMeasurer } from './textFit'

/*
  The five slide arrangements, as native PowerPoint text boxes and shapes.

  `PptxSlide` is a structural interface rather than pptxgenjs's own `Slide`
  type: the renderers then depend on the shape they use and not on the library,
  which keeps the writer swappable and honours the module rule that pptxgenjs
  stays inside `pptx.ts`.
*/
export interface PptxSlide {
  addText(text: string | PptxTextRun[], options: Record<string, unknown>): void
  addShape(shape: string, options: Record<string, unknown>): void
}

export type SlideRenderer = (
  slide: PptxSlide,
  card: Card,
  theme: ThemeTokens,
  /** Already `mergeTextStyle(deckStyle, card.textStyle)` — the run's own inline style is applied per run. */
  style: TextStyle,
  /** Measures text width in inches for a given `FontSpec`. Plumbed through every renderer; not yet used to fit anything (see `textFit.ts` and the design doc's "4. Plumbing"). */
  measure: TextMeasurer,
) => void

/* LAYOUT_16x9 in inches. */
const SLIDE_W = 10
const SLIDE_H = 5.625
const MARGIN = 0.6
const CONTENT_W = SLIDE_W - MARGIN * 2

/** Index into `theme.typography.scale`. */
const H1 = 0
const H2 = 1
const H3 = 2
const BODY = 3

function headingFace(theme: ThemeTokens, style: TextStyle): string {
  return faceName(style.fontFamily ?? theme.typography.headingFont)
}

function bodyFace(theme: ThemeTokens, style: TextStyle): string {
  return faceName(style.fontFamily ?? theme.typography.bodyFont)
}

/** The card's heading text. The generation schema guarantees block 0 is a heading. */
function headingText(card: Card): string {
  const first = card.blocks[0]
  return first?.type === 'heading' ? first.text : ''
}

/** Marks stored for one run of text, or undefined if nobody formatted it. */
function marksFor(card: Card, ref: string) {
  return card.inline?.[ref]?.marks
}

/** The merged style for one run, with its own inline overrides on top. */
function styleFor(card: Card, ref: string, style: TextStyle): TextStyle {
  return resolveRunStyle(style, card.inline?.[ref]?.style)
}

function firstOfType<T extends ContentBlock['type']>(
  card: Card,
  type: T,
): { block: Extract<ContentBlock, { type: T }>; index: number } | null {
  for (let i = 0; i < card.blocks.length; i++) {
    const block = card.blocks[i]
    if (block.type === type) return { block: block as Extract<ContentBlock, { type: T }>, index: i }
  }
  return null
}

/** Every block of one type, each with the index its `textRef` needs. */
function allOfType<T extends ContentBlock['type']>(
  card: Card,
  type: T,
): { block: Extract<ContentBlock, { type: T }>; index: number }[] {
  const out: { block: Extract<ContentBlock, { type: T }>; index: number }[] = []
  card.blocks.forEach((block, i) => {
    if (block.type === type) out.push({ block: block as Extract<ContentBlock, { type: T }>, index: i })
  })
  return out
}

/** The heading, plus a thin accent rule under it. Shared by every renderer that has one. */
function addHeading(slide: PptxSlide, card: Card, theme: ThemeTokens, style: TextStyle) {
  const ref = textRef(0, 'text')
  const runStyle = styleFor(card, ref, style)
  slide.addText(markedRuns(headingText(card), marksFor(card, ref)), {
    x: MARGIN,
    y: MARGIN,
    w: CONTENT_W,
    h: 0.9,
    fontFace: headingFace(theme, runStyle),
    fontSize: pointSize(theme.typography.scale[H2], runStyle.fontScale),
    color: hex(theme.colors.foreground),
    bold: runStyle.bold ?? true,
    italic: runStyle.italic,
    align: runStyle.align ?? 'left',
    valign: 'middle',
    // A long heading can wrap to three or more lines at this font size; without
    // this it overflows the fixed box height onto whatever sits beneath it.
    fit: 'shrink',
  })
  slide.addShape('rect', {
    x: MARGIN,
    y: MARGIN + 0.95,
    w: 1.2,
    h: 0.045,
    fill: { color: hex(theme.colors.accent) },
  })
}

/* ---------------------------------------------------------------- title --- */

/**
 * `hero` and `textFocus`: the heading is the slide.
 *
 * A card with no paragraph renders the heading alone rather than leaving a gap
 * where a subtitle would be, so the block sits centred either way.
 *
 * `textFocus` itself is chosen by the classifier precisely when a card holds
 * two or more paragraphs (`layoutEngine.ts`), so every paragraph is rendered
 * — as separate lines in one subtitle box — rather than only the first.
 */
const renderTitle: SlideRenderer = (slide, card, theme, style, _measure) => {
  const paragraphs = allOfType(card, 'paragraph')
  const headingRef = textRef(0, 'text')
  const headingStyle = styleFor(card, headingRef, style)

  slide.addText(markedRuns(headingText(card), marksFor(card, headingRef)), {
    x: MARGIN,
    y: paragraphs.length > 0 ? 1.6 : 2.0,
    w: CONTENT_W,
    h: 1.6,
    fontFace: headingFace(theme, headingStyle),
    fontSize: pointSize(theme.typography.scale[H1], headingStyle.fontScale),
    color: hex(theme.colors.foreground),
    bold: headingStyle.bold ?? true,
    italic: headingStyle.italic,
    align: headingStyle.align ?? 'center',
    valign: 'middle',
    // Same overflow risk as `addHeading`'s box, at an even larger font size.
    fit: 'shrink',
  })

  if (paragraphs.length > 0) {
    // Box-level options (face, size, colour, alignment) follow the first
    // paragraph's resolved style, same as the single-paragraph case did
    // before; only bold/italic marks vary per run within the box.
    const boxStyle = styleFor(card, textRef(paragraphs[0].index, 'text'), style)
    const runs = paragraphs.flatMap(({ block, index }, i) => {
      const ref = textRef(index, 'text')
      const marked = markedRuns(block.text, marksFor(card, ref))
      return marked.map((run, k) => {
        const options = { ...run.options }
        if (k === marked.length - 1 && i < paragraphs.length - 1) options.breakLine = true
        return { text: run.text, options }
      })
    })

    slide.addText(runs, {
      x: MARGIN + 0.8,
      y: 3.3,
      w: CONTENT_W - 1.6,
      h: 1.0,
      fontFace: bodyFace(theme, boxStyle),
      fontSize: pointSize(theme.typography.scale[H3], boxStyle.fontScale),
      color: hex(theme.colors.muted),
      italic: boxStyle.italic,
      align: boxStyle.align ?? 'center',
      valign: 'top',
      // Several paragraphs in a box sized for one must not run off the slide.
      fit: 'shrink',
    })
  }
}

/* ----------------------------------------------------------------- body --- */

interface BulletLine {
  text: string
  bullet: boolean
  indent: number
  /**
   * The run this line came from, when it came from exactly one.
   *
   * `null` for composite lines — a stat's `value — label`, a timeline step's
   * `label — text` — because they join two separately-addressed runs and there
   * is no single ref whose marks apply. Accepted limitation: bold inside those
   * two block types is dropped in the export.
   */
  ref: string | null
}

/**
 * Every block after the heading, as one flat list of lines.
 *
 * The six layouts that group into `body` differ on screen mainly in how they
 * arrange the same content, and PowerPoint gets the content: a bullet list is
 * the arrangement that survives translation without inventing structure the
 * card does not have.
 */
function flattenBlocks(card: Card): BulletLine[] {
  const lines: BulletLine[] = []

  card.blocks.forEach((block, i) => {
    if (i === 0 && block.type === 'heading') return // rendered by addHeading

    switch (block.type) {
      case 'heading':
      case 'paragraph':
        lines.push({ text: block.text, bullet: false, indent: 0, ref: textRef(i, 'text') })
        break
      case 'bulletList':
        block.items.forEach((item, j) => {
          lines.push({ text: item, bullet: true, indent: 0, ref: textRef(i, 'items', j) })
        })
        break
      case 'stat':
        lines.push({ text: `${block.value} — ${block.label}`, bullet: true, indent: 0, ref: null })
        break
      case 'quote':
        lines.push({
          text: block.attribution ? `“${block.text}” — ${block.attribution}` : `“${block.text}”`,
          bullet: false,
          indent: 0,
          ref: block.attribution ? null : textRef(i, 'text'),
        })
        break
      case 'timelineStep':
        lines.push({ text: `${block.label} — ${block.text}`, bullet: true, indent: 0, ref: null })
        break
      case 'comparisonGroup':
        lines.push({ text: block.heading, bullet: false, indent: 0, ref: textRef(i, 'heading') })
        block.items.forEach((item, j) => {
          lines.push({ text: item, bullet: true, indent: 1, ref: textRef(i, 'items', j) })
        })
        break
      case 'image':
        // An image has nothing to draw here, so its alt text stands in for it.
        // With no alt there is nothing worth saying — a bullet reading "image"
        // is worse than no bullet.
        if (block.alt) lines.push({ text: block.alt, bullet: true, indent: 0, ref: null })
        break
    }
  })

  return lines
}

/**
 * One flattened line as pptxgenjs runs.
 *
 * A line can split into several runs when it carries marks, so the
 * line-level options have to land on specific runs: `bullet`/`indentLevel` on
 * the first (they describe the paragraph, and repeating them would emit one
 * bullet per run) and `breakLine` on the last (it ends the paragraph).
 */
function runsForLine(line: BulletLine, card: Card, isLast: boolean): PptxTextRun[] {
  const runs = markedRuns(line.text, line.ref ? marksFor(card, line.ref) : undefined)
  return runs.map((run, i) => {
    const options = { ...run.options }
    if (i === 0) {
      options.bullet = line.bullet
      options.indentLevel = line.indent
    }
    if (i === runs.length - 1 && !isLast) options.breakLine = true
    return { text: run.text, options }
  })
}

const renderBody: SlideRenderer = (slide, card, theme, style, _measure) => {
  addHeading(slide, card, theme, style)

  const lines = flattenBlocks(card)
  if (lines.length === 0) return

  const runs = lines.flatMap((line, i) => runsForLine(line, card, i === lines.length - 1))

  slide.addText(runs, {
    x: MARGIN,
    y: MARGIN + 1.2,
    w: CONTENT_W,
    h: SLIDE_H - MARGIN * 2 - 1.2,
    fontFace: bodyFace(theme, style),
    fontSize: pointSize(theme.typography.scale[BODY], style.fontScale),
    color: hex(theme.colors.foreground),
    align: style.align ?? 'left',
    valign: 'top',
    lineSpacingMultiple: theme.typography.lineHeight,
    // Long cards must not spill off the slide; shrinking is less bad than
    // truncating content the user can no longer see.
    fit: 'shrink',
  })
}

/* ----------------------------------------------------------------- stat --- */

const MAX_STAT_COLUMNS = 4

/**
 * `statHero` and `statGrid`: the numbers are the point, so they get the size.
 *
 * A single stat lands centred and very large; several lay out in rows of at
 * most four, wrapping beyond that rather than shrinking indefinitely.
 */
const renderStat: SlideRenderer = (slide, card, theme, style, _measure) => {
  addHeading(slide, card, theme, style)

  const stats: { value: string; label: string; index: number }[] = []
  card.blocks.forEach((block, i) => {
    if (block.type === 'stat') stats.push({ value: block.value, label: block.label, index: i })
  })
  if (stats.length === 0) return

  // `layoutEngine.ts` routes any card with exactly one stat to `statHero`
  // regardless of what else it holds, and `StatHeroLayout` renders that card's
  // paragraphs on screen — so they have to survive here too, not just the stats.
  const paragraphs = allOfType(card, 'paragraph')

  const columns = Math.min(stats.length, MAX_STAT_COLUMNS)
  const rows = Math.ceil(stats.length / columns)
  const cellW = CONTENT_W / columns
  const areaY = MARGIN + 1.35
  const totalH = SLIDE_H - areaY - MARGIN
  // Paragraphs, when present, take a fixed slice off the bottom of the stat
  // area rather than shrinking indefinitely as more stat rows are added.
  const PARAGRAPH_H = 0.9
  const PARAGRAPH_GAP = 0.15
  const areaH = paragraphs.length > 0 ? totalH - PARAGRAPH_H - PARAGRAPH_GAP : totalH
  const cellH = areaH / rows
  const single = stats.length === 1

  stats.forEach((stat, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    const x = MARGIN + col * cellW
    const y = areaY + row * cellH

    const valueRef = textRef(stat.index, 'value')
    const valueStyle = styleFor(card, valueRef, style)
    slide.addText(markedRuns(stat.value, marksFor(card, valueRef)), {
      x,
      y,
      w: cellW,
      h: cellH * 0.62,
      fontFace: headingFace(theme, valueStyle),
      fontSize: pointSize(theme.typography.scale[single ? H1 : H2], valueStyle.fontScale),
      color: hex(theme.colors.accent),
      bold: valueStyle.bold ?? true,
      align: 'center',
      valign: 'bottom',
    })

    const labelRef = textRef(stat.index, 'label')
    const labelStyle = styleFor(card, labelRef, style)
    slide.addText(markedRuns(stat.label, marksFor(card, labelRef)), {
      x,
      y: y + cellH * 0.64,
      w: cellW,
      h: cellH * 0.3,
      fontFace: bodyFace(theme, labelStyle),
      fontSize: pointSize(theme.typography.scale[BODY], labelStyle.fontScale),
      color: hex(theme.colors.muted),
      align: 'center',
      valign: 'top',
    })
  })

  if (paragraphs.length > 0) {
    // Box-level options follow the first paragraph's resolved style, same
    // pattern as `renderTitle`'s multi-paragraph subtitle box.
    const boxStyle = styleFor(card, textRef(paragraphs[0].index, 'text'), style)
    const runs = paragraphs.flatMap(({ block, index }, i) => {
      const ref = textRef(index, 'text')
      const marked = markedRuns(block.text, marksFor(card, ref))
      return marked.map((run, k) => {
        const options = { ...run.options }
        if (k === marked.length - 1 && i < paragraphs.length - 1) options.breakLine = true
        return { text: run.text, options }
      })
    })

    slide.addText(runs, {
      x: MARGIN,
      y: areaY + areaH + PARAGRAPH_GAP,
      w: CONTENT_W,
      h: PARAGRAPH_H,
      fontFace: bodyFace(theme, boxStyle),
      fontSize: pointSize(theme.typography.scale[BODY], boxStyle.fontScale),
      color: hex(theme.colors.muted),
      italic: boxStyle.italic,
      align: boxStyle.align ?? 'center',
      valign: 'top',
      fit: 'shrink',
    })
  }
}

/* --------------------------------------------------------------- twoCol --- */

/**
 * `comparison`: the groups side by side, one column per group.
 *
 * The classifier (`layoutEngine.ts`'s `chooseLayout`) admits 2 to 4
 * comparison groups into this arrangement, so the column count follows the
 * card rather than being fixed at two. A card with no groups, or with more than
 * 4 groups, is not reachable through `layout: 'auto'`, but a legacy row could
 * carry an explicit `layout: 'comparison'` with either — both fall back to
 * `renderBody` instead of silently dropping the extra groups or rendering
 * nothing, since `flattenBlocks` already renders every `comparisonGroup` as a
 * heading plus indented bullets.
 */
const renderTwoCol: SlideRenderer = (slide, card, theme, style, measure) => {
  const groups: { heading: string; items: string[]; index: number }[] = []
  card.blocks.forEach((block, i) => {
    if (block.type === 'comparisonGroup') {
      groups.push({ heading: block.heading, items: block.items, index: i })
    }
  })
  // No groups, or more than four: neither is reachable through `layout: 'auto'`
  // (the classifier admits exactly 2 to 4), but a legacy row carrying an
  // explicit `layout: 'comparison'` could be either. Both fall back to
  // `renderBody`, which draws the heading *and* whatever else the card holds,
  // so a malformed comparison card degrades into a readable standard slide
  // rather than a lone heading over an empty backdrop — or, as before, nothing
  // at all.
  if (groups.length === 0 || groups.length > 4) {
    renderBody(slide, card, theme, style, measure)
    return
  }

  addHeading(slide, card, theme, style)

  const shown = groups.slice(0, 4)
  const columns = shown.length
  // A little tighter than the two-column gap once three or four groups have
  // to share the row, so a column never has to give up more than it needs to.
  const gap = columns >= 3 ? 0.3 : 0.4
  const colW = (CONTENT_W - gap * (columns - 1)) / columns
  const top = MARGIN + 1.35

  shown.forEach((group, i) => {
    const x = MARGIN + i * (colW + gap)

    const headingRef = textRef(group.index, 'heading')
    const headingStyle = styleFor(card, headingRef, style)
    slide.addText(markedRuns(group.heading, marksFor(card, headingRef)), {
      x,
      y: top,
      w: colW,
      h: 0.55,
      fontFace: headingFace(theme, headingStyle),
      fontSize: pointSize(theme.typography.scale[H3], headingStyle.fontScale),
      color: hex(theme.colors.accent),
      bold: headingStyle.bold ?? true,
      align: 'left',
      valign: 'middle',
    })

    const runs = group.items.flatMap((item, j) => {
      const ref = textRef(group.index, 'items', j)
      const marked = markedRuns(item, marksFor(card, ref))
      return marked.map((run, k) => {
        const options = { ...run.options }
        if (k === 0) options.bullet = true
        if (k === marked.length - 1 && j < group.items.length - 1) options.breakLine = true
        return { text: run.text, options }
      })
    })

    slide.addText(runs, {
      x,
      y: top + 0.6,
      w: colW,
      h: SLIDE_H - top - 0.6 - MARGIN,
      fontFace: bodyFace(theme, style),
      fontSize: pointSize(theme.typography.scale[BODY], style.fontScale),
      color: hex(theme.colors.foreground),
      align: 'left',
      valign: 'top',
      lineSpacingMultiple: theme.typography.lineHeight,
      fit: 'shrink',
    })
  })
}

/* ---------------------------------------------------------------- quote --- */

/** `quote`: the words fill the slide, attribution beneath, or nothing if it has none. */
const renderQuote: SlideRenderer = (slide, card, theme, style, measure) => {
  const quote = firstOfType(card, 'quote')
  if (!quote) {
    renderBody(slide, card, theme, style, measure)
    return
  }

  // `renderBody` above already draws its own heading for the no-quote
  // fallback; drawing it again here too would duplicate it, so this call
  // sits only on the path where a quote block actually exists.
  addHeading(slide, card, theme, style)

  // Shifted down from the top of the slide to clear `addHeading`'s box (to
  // y≈1.5) and its accent rule (to y≈1.6), with a small gap.
  const textRefKey = textRef(quote.index, 'text')
  const quoteStyle = styleFor(card, textRefKey, style)
  slide.addText(markedRuns(`“${quote.block.text}”`, marksFor(card, textRefKey)), {
    x: MARGIN + 0.5,
    y: 1.75,
    w: CONTENT_W - 1.0,
    h: 2.2,
    fontFace: headingFace(theme, quoteStyle),
    fontSize: pointSize(theme.typography.scale[H3], quoteStyle.fontScale),
    color: hex(theme.colors.foreground),
    italic: quoteStyle.italic ?? true,
    align: quoteStyle.align ?? 'center',
    valign: 'middle',
    fit: 'shrink',
  })

  if (quote.block.attribution) {
    const attrRef = textRef(quote.index, 'attribution')
    const attrStyle = styleFor(card, attrRef, style)
    slide.addText(markedRuns(`— ${quote.block.attribution}`, marksFor(card, attrRef)), {
      x: MARGIN + 0.5,
      y: 4.05,
      w: CONTENT_W - 1.0,
      h: 0.6,
      fontFace: bodyFace(theme, attrStyle),
      fontSize: pointSize(theme.typography.scale[BODY], attrStyle.fontScale),
      color: hex(theme.colors.muted),
      align: attrStyle.align ?? 'center',
      valign: 'top',
    })
  }
}

/* ------------------------------------------------------------- adjusted --- */

/*
  Cards where the user has moved or resized an element.

  Every other renderer in this file decides where things go. This one is told —
  by `blockBoxes.ts`, which recomputes a baseline stack and applies each stored
  nudge on top of it. See that module for what survives the translation exactly
  (the nudges) and what does not (the twelve hand-designed arrangements).

  The card's own aspect ratio is whatever its content came to, so it is fitted
  into the 16:9 slide and centred rather than stretched. Stretching would
  distort every nudge the user made, which is the one thing this path exists to
  preserve.
*/

/** Maps a card's normalized space onto the slide: `x * scale + offset` in inches. */
interface Fit {
  scale: number
  offsetX: number
  offsetY: number
}

function fitCard(height: number): Fit {
  // `MARGIN * 2` — one per side, the same usable area every other arrangement
  // in this file works inside. Subtracting a single margin gave adjusted slides
  // half the gutter of their neighbours, so a deck with one nudged card had
  // that card's content visibly wider than the rest.
  const usableW = SLIDE_W - MARGIN * 2
  const usableH = SLIDE_H - MARGIN * 2
  const scale = Math.min(usableW, height > 0 ? usableH / height : usableW)
  return {
    scale,
    offsetX: (SLIDE_W - scale) / 2,
    offsetY: (SLIDE_H - scale * height) / 2,
  }
}

/**
 * A run's size in points on an adjusted card.
 *
 * Pointedly *not* `pointSize`, whose `PT_PER_REM` lands a body line at a
 * comfortable 18pt regardless of the box it sits in. That is right for the five
 * arranged layouts, which size their own boxes to whatever the text needs, and
 * wrong here: the user sized these boxes by eye against the text inside them,
 * so text arriving larger than they drew it overflows boxes that fitted on
 * screen. Deriving the size from the same card-relative scale the boxes use
 * keeps text and box in proportion however the card is fitted to the slide.
 */
function fittedPointSize(rem: number, fontScale: number | undefined, fit: Fit): number {
  // A 1rem line is about this fraction of a typical card's width; the same
  // proportion `blockBoxes.ts` estimates its line heights from.
  const REM_PER_CARD_WIDTH = 0.0167
  return Math.max(6, Math.round(rem * (fontScale ?? 1) * REM_PER_CARD_WIDTH * fit.scale * 72 * 10) / 10)
}

/** One normalized box as the position options pptxgenjs wants, in inches. */
function placed(box: Box, fit: Fit): { x: number; y: number; w: number; h: number; rotate?: number } {
  return {
    x: box.x * fit.scale + fit.offsetX,
    y: box.y * fit.scale + fit.offsetY,
    w: box.w * fit.scale,
    h: box.h * fit.scale,
    // pptxgenjs takes 0-359; the editor stores (-180, 180].
    ...(box.rotation ? { rotate: (((box.rotation % 360) + 360) % 360) } : {}),
  }
}

type PlacedBox = ReturnType<typeof placed>

/** The lower slice of a box, as a fraction of its height. Used to stack two runs in one frame. */
function lowerSlice(box: PlacedBox, share: number): PlacedBox {
  return { ...box, y: box.y + box.h * share, h: box.h * (1 - share) }
}

/** The upper slice of a box. */
function upperSlice(box: PlacedBox, share: number): PlacedBox {
  return { ...box, h: box.h * share }
}

/**
 * One adjusted card's block as native PowerPoint text.
 *
 * Mirrors `BlockRenderer` case for case — same colours, same relative sizes,
 * same ordering of a stat's value above its label — because the box the user
 * sized was sized around *that* rendering. A block type styled differently here
 * would land in a box the wrong shape for it.
 */
function renderAdjustedBlock(
  slide: PptxSlide,
  card: Card,
  index: number,
  box: PlacedBox,
  fit: Fit,
  theme: ThemeTokens,
  style: TextStyle,
  _measure: TextMeasurer,
) {
  const block = card.blocks[index]

  /** A text box filling the block's frame, unless a caller carves it up. */
  const text = (value: PptxTextRun[] | string, options: Record<string, unknown>, area: PlacedBox = box) => {
    slide.addText(value, {
      ...area,
      valign: 'top',
      // Every box here is sized by the user rather than by its content, so
      // overflowing it is the expected failure. Shrinking beats spilling onto
      // whatever they positioned underneath.
      fit: 'shrink',
      ...options,
    })
  }

  const runStyle = (ref: string) => styleFor(card, ref, style)

  switch (block.type) {
    case 'heading': {
      const ref = textRef(index, 'text')
      const own = runStyle(ref)
      text(markedRuns(block.text, marksFor(card, ref)), {
        fontFace: headingFace(theme, own),
        fontSize: fittedPointSize(theme.typography.scale[H2], own.fontScale, fit),
        color: hex(theme.colors.foreground),
        bold: own.bold ?? true,
        italic: own.italic,
        align: own.align ?? 'left',
      })
      return
    }

    case 'paragraph': {
      const ref = textRef(index, 'text')
      const own = runStyle(ref)
      text(markedRuns(block.text, marksFor(card, ref)), {
        fontFace: bodyFace(theme, own),
        fontSize: fittedPointSize(theme.typography.scale[BODY], own.fontScale, fit),
        color: hex(theme.colors.foreground),
        bold: own.bold,
        italic: own.italic,
        align: own.align ?? 'left',
        lineSpacingMultiple: theme.typography.lineHeight,
      })
      return
    }

    case 'bulletList': {
      text(listRuns(card, index, 'items', block.items), {
        fontFace: bodyFace(theme, style),
        fontSize: fittedPointSize(theme.typography.scale[BODY], style.fontScale, fit),
        color: hex(theme.colors.foreground),
        align: style.align ?? 'left',
        lineSpacingMultiple: theme.typography.lineHeight,
      })
      return
    }

    /*
      Two boxes, splitting the frame the way `StatBlockView` splits its own: the
      value takes the top and the label sits under it. One box with a line break
      would lose the size and colour difference that makes a stat read as a stat.
    */
    case 'stat': {
      const VALUE_SHARE = 0.68
      const valueRef = textRef(index, 'value')
      const valueStyle = runStyle(valueRef)
      text(
        markedRuns(block.value, marksFor(card, valueRef)),
        {
          fontFace: headingFace(theme, valueStyle),
          fontSize: fittedPointSize(theme.typography.scale[H1], valueStyle.fontScale, fit),
          color: hex(theme.colors.accent),
          bold: valueStyle.bold ?? true,
          italic: valueStyle.italic,
          align: valueStyle.align ?? 'left',
          valign: 'bottom',
        },
        upperSlice(box, VALUE_SHARE),
      )

      const labelRef = textRef(index, 'label')
      const labelStyle = runStyle(labelRef)
      text(
        markedRuns(block.label, marksFor(card, labelRef)),
        {
          fontFace: bodyFace(theme, labelStyle),
          fontSize: fittedPointSize(theme.typography.scale[BODY], labelStyle.fontScale, fit),
          color: hex(theme.colors.muted),
          italic: labelStyle.italic,
          align: labelStyle.align ?? 'left',
        },
        lowerSlice(box, VALUE_SHARE),
      )
      return
    }

    case 'quote': {
      const attribution = block.attribution
      const QUOTE_SHARE = attribution ? 0.75 : 1
      const ref = textRef(index, 'text')
      const own = runStyle(ref)
      text(
        markedRuns(`“${block.text}”`, marksFor(card, ref)),
        {
          fontFace: bodyFace(theme, own),
          fontSize: fittedPointSize(theme.typography.scale[H3], own.fontScale, fit),
          color: hex(theme.colors.foreground),
          italic: own.italic ?? true,
          align: own.align ?? 'left',
          lineSpacingMultiple: theme.typography.lineHeight,
        },
        upperSlice(box, QUOTE_SHARE),
      )

      if (attribution) {
        const attrRef = textRef(index, 'attribution')
        const attrStyle = runStyle(attrRef)
        text(
          markedRuns(`— ${attribution}`, marksFor(card, attrRef)),
          {
            fontFace: bodyFace(theme, attrStyle),
            fontSize: fittedPointSize(theme.typography.scale[BODY], attrStyle.fontScale, fit),
            color: hex(theme.colors.muted),
            align: attrStyle.align ?? 'left',
          },
          lowerSlice(box, QUOTE_SHARE),
        )
      }
      return
    }

    /*
      The label and its text keep their own boxes rather than being joined into
      `label — text` the way `flattenBlocks` does for the arranged layouts.
      Joining there is a concession to a single bullet line; here there is room
      for both, and keeping them apart is what preserves each one's marks.
    */
    case 'timelineStep': {
      const LABEL_SHARE = 0.4
      const labelRef = textRef(index, 'label')
      const labelStyle = runStyle(labelRef)
      text(
        markedRuns(block.label, marksFor(card, labelRef)),
        {
          fontFace: headingFace(theme, labelStyle),
          fontSize: fittedPointSize(theme.typography.scale[BODY], labelStyle.fontScale, fit),
          color: hex(theme.colors.accent),
          bold: labelStyle.bold ?? true,
          align: labelStyle.align ?? 'left',
        },
        upperSlice(box, LABEL_SHARE),
      )

      const bodyRef = textRef(index, 'text')
      const bodyStyle = runStyle(bodyRef)
      text(
        markedRuns(block.text, marksFor(card, bodyRef)),
        {
          fontFace: bodyFace(theme, bodyStyle),
          fontSize: fittedPointSize(theme.typography.scale[BODY], bodyStyle.fontScale, fit),
          color: hex(theme.colors.foreground),
          align: bodyStyle.align ?? 'left',
        },
        lowerSlice(box, LABEL_SHARE),
      )
      return
    }

    case 'comparisonGroup': {
      const HEADING_SHARE = 0.24
      const headingRef = textRef(index, 'heading')
      const headingStyle = runStyle(headingRef)
      text(
        markedRuns(block.heading, marksFor(card, headingRef)),
        {
          fontFace: headingFace(theme, headingStyle),
          fontSize: fittedPointSize(theme.typography.scale[H3], headingStyle.fontScale, fit),
          color: hex(theme.colors.accent),
          bold: headingStyle.bold ?? true,
          align: headingStyle.align ?? 'left',
        },
        upperSlice(box, HEADING_SHARE),
      )

      text(
        listRuns(card, index, 'items', block.items),
        {
          fontFace: bodyFace(theme, style),
          fontSize: fittedPointSize(theme.typography.scale[BODY], style.fontScale, fit),
          color: hex(theme.colors.foreground),
          align: style.align ?? 'left',
        },
        lowerSlice(box, HEADING_SHARE),
      )
      return
    }

    /*
      Images are not embedded, here or anywhere else in the export: the block
      holds a URL, and fetching it would make the export depend on the network
      and on the host's CORS policy. The alt text stands in, inside the frame
      the user drew, so the slide keeps the space rather than silently closing
      the gap. A block with no alt leaves an empty box, which is still the
      truthful shape of the slide.
    */
    case 'image': {
      if (!block.alt) return
      text(block.alt, {
        fontFace: bodyFace(theme, style),
        fontSize: fittedPointSize(theme.typography.scale[BODY], style.fontScale, fit),
        color: hex(theme.colors.muted),
        italic: true,
        align: 'center',
        valign: 'middle',
      })
      return
    }
  }
}

/** A bulleted list of one block's string array, each item keeping its own marks. */
function listRuns(card: Card, index: number, field: string, items: string[]): PptxTextRun[] {
  return items.flatMap((item, i) => {
    const marked = markedRuns(item, marksFor(card, textRef(index, field, i)))
    return marked.map((run, k) => {
      const options = { ...run.options }
      // The bullet describes the paragraph, so it goes on the first run only;
      // repeating it would emit one bullet per formatted fragment.
      if (k === 0) options.bullet = true
      if (k === marked.length - 1 && i < items.length - 1) options.breakLine = true
      return { text: run.text, options }
    })
  })
}

/** A card carrying element nudges: every block in the box the user left it in. */
const renderAdjusted: SlideRenderer = (slide, card, theme, style, measure) => {
  const { boxes, height } = cardBoxes(card)
  const fit = fitCard(height)
  card.blocks.forEach((_, index) => {
    const box = boxes[String(index)]
    if (box) renderAdjustedBlock(slide, card, index, placed(box, fit), fit, theme, style, measure)
  })
}

export const RENDERERS: Record<PptxGroup, SlideRenderer> = {
  title: renderTitle,
  body: renderBody,
  stat: renderStat,
  twoCol: renderTwoCol,
  quote: renderQuote,
  adjusted: renderAdjusted,
}
