import type { Card, ContentBlock } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { TextStyle } from '@/engine/textStyle'
import { textRef } from '@/engine/marks'
import { parseTextRef } from '@/engine/blockText'
import { cardBoxes, type Box } from './blockBoxes'
import type { PptxTextRun } from './textRun'
import { SIZE_SCALE_KEY, faceName, hex, markedRuns, resolveRunStyle } from './textRun'
import type { PptxGroup } from './slideGroup'
import type { FitParagraph, FitSizing, SizeRole, TextMeasurer } from './textFit'
import {
  BULLET_INDENT_IN,
  DEFAULT_LINE_SPACING,
  SIZE_LADDER,
  TEXT_MARGIN_PT,
  fitText,
  preferredSize,
  spacingPt,
} from './textFit'

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
  /** Measures text width in inches for a given `FontSpec`. Every renderer uses it to fit its own text via `textFit.ts`'s `fitText` (see the design doc's "4. Plumbing"). */
  measure: TextMeasurer,
) => void

/* LAYOUT_16x9 in inches. */
const SLIDE_W = 10
const SLIDE_H = 5.625
const MARGIN = 0.6
const CONTENT_W = SLIDE_W - MARGIN * 2

/*
  Layout from measured heights (design doc section 3): a heading's box is
  exactly as tall as its fitted text, the accent rule sits under its real
  bottom, and the content area starts a fixed gap below that — rather than
  every box assuming a fixed heading height that a long heading could overflow.
*/
const TOP = 0.45
const BOTTOM = SLIDE_H - 0.45
const HEADING_MAX_H = 1.5
const RULE_GAP = 0.08
const RULE_H = 0.045
const CONTENT_GAP = 0.22

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
  /*
    Three levels, narrowest last: deck and card (already merged into `style`),
    then the element the run belongs to, then the run itself.

    The element's own typography — what the toolbar writes while an element is
    selected — lives under the bare block index, not under any run's ref (see
    `blockStyleKey` in the editor). It used to be skipped here, so a font, size,
    alignment or colour set on one selected element showed on screen and vanished
    from the exported file. Written as `String(index)` because `src/export/` may
    not import from a component.
  */
  return resolveRunStyle(resolveRunStyle(style, elementStyleOf(card, ref)), card.inline?.[ref]?.style)
}

/** The typography set on the whole element a run belongs to, or undefined if nobody set any. */
function elementStyleOf(card: Card, ref: string | null): TextStyle | undefined {
  const block = ref ? parseTextRef(ref)?.blockIndex : undefined
  return block === undefined ? undefined : card.inline?.[String(block)]?.style
}

/**
 * `true` when `ref` carries a bold mark anywhere in its text, else `undefined`
 * (never `false`) — so setting it on a `FitParagraph` can only ever *add*
 * bold to the measurement, never strip a box-level bold already carried by
 * `sizing.bold` (e.g. a heading). Conservative on purpose: a paragraph with
 * even one bold word is measured as if it were entirely bold, which can only
 * overestimate its width and never under-fit it. `ref` is `null` for the
 * composite lines (`flattenBlocks`'s stat/timeline/quote-with-attribution
 * text) that join two separately-addressed runs with no single ref to read.
 */
function markBold(card: Card, ref: string | null): true | undefined {
  if (!ref) return undefined
  return marksFor(card, ref)?.some((mark) => mark.type === 'bold') ? true : undefined
}

/**
 * The largest size multiple any size mark on `ref` sets, or `undefined` if none
 * enlarges it. Only enlargement matters to the fit — a run set *smaller* than the
 * box's size cannot make its paragraph taller — and, like `markBold`, it is
 * deliberately conservative: a paragraph with one enlarged word is measured as if
 * every word were that size.
 */
function markScale(card: Card, ref: string | null): number | undefined {
  if (!ref) return undefined
  let largest = 1
  for (const mark of marksFor(card, ref) ?? []) {
    if (mark.type === 'fontScale' && typeof mark.value === 'number') largest = Math.max(largest, mark.value)
  }
  return largest > 1 ? largest : undefined
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

/**
 * The heading, plus a thin accent rule under it. Shared by every renderer that
 * has one. Fitted rather than fixed-height (design doc section 3): the box is
 * exactly as tall as the heading needs, up to `HEADING_MAX_H`, so a long
 * heading shrinks and wraps instead of overflowing onto whatever follows it.
 *
 * Returns the y, in inches, where content below the heading may start —
 * `TOP + h + RULE_GAP + RULE_H + CONTENT_GAP` — so callers place their own
 * content against the heading's real bottom rather than an assumed one.
 */
function addHeading(
  slide: PptxSlide,
  card: Card,
  theme: ThemeTokens,
  style: TextStyle,
  measure: TextMeasurer,
): number {
  const ref = textRef(0, 'text')
  const runStyle = styleFor(card, ref, style)
  const sizing: FitSizing = {
    preferredPt: preferredSize('heading', theme.typography.scale[H2], runStyle.fontScale),
    minPt: SIZE_LADDER.heading.min,
    face: headingFace(theme, runStyle),
    bold: runStyle.bold ?? true,
    italic: runStyle.italic,
  }
  const { sizePt, heightIn } = fitText(
    [{ text: headingText(card), bold: markBold(card, ref), scale: markScale(card, ref) }],
    { widthIn: CONTENT_W, maxHeightIn: HEADING_MAX_H },
    sizing,
    measure,
  )

  slide.addText(markedRuns(headingText(card), marksFor(card, ref)), {
    x: MARGIN,
    y: TOP,
    w: CONTENT_W,
    h: heightIn,
    fontFace: headingFace(theme, runStyle),
    fontSize: sizePt,
    color: hex(runStyle.color ?? theme.colors.foreground),
    bold: runStyle.bold ?? true,
    italic: runStyle.italic,
    underline: runStyle.underline,
    align: runStyle.align ?? 'left',
    valign: 'top',
    margin: TEXT_MARGIN_PT,
    lineSpacing: spacingPt(sizePt, sizing.lineSpacing ?? DEFAULT_LINE_SPACING),
    // The text now fits by construction; this remains a harmless backstop.
    fit: 'shrink',
  })

  const ruleY = TOP + heightIn + RULE_GAP
  slide.addShape('rect', {
    x: MARGIN,
    y: ruleY,
    w: 1.2,
    h: RULE_H,
    fill: { color: hex(theme.colors.accent) },
  })

  return ruleY + RULE_H + CONTENT_GAP
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
const TITLE_MAX_H = 2.4
const TITLE_SUBTITLE_GAP = 0.25
const TITLE_SUBTITLE_INSET = 1.6

const renderTitle: SlideRenderer = (slide, card, theme, style, measure) => {
  const paragraphs = allOfType(card, 'paragraph')
  const headingRef = textRef(0, 'text')
  const headingStyle = styleFor(card, headingRef, style)

  const titleSizing: FitSizing = {
    preferredPt: preferredSize('title', theme.typography.scale[H1], headingStyle.fontScale),
    minPt: SIZE_LADDER.title.min,
    face: headingFace(theme, headingStyle),
    bold: headingStyle.bold ?? true,
    italic: headingStyle.italic,
  }
  const { sizePt: titleSize, heightIn: titleH } = fitText(
    [{ text: headingText(card), bold: markBold(card, headingRef), scale: markScale(card, headingRef) }],
    { widthIn: CONTENT_W, maxHeightIn: TITLE_MAX_H },
    titleSizing,
    measure,
  )

  // Box-level options (face, size, colour, alignment) follow the first
  // paragraph's resolved style, same as the single-paragraph case did
  // before; only bold/italic marks vary per run within the box.
  const boxStyle =
    paragraphs.length > 0 ? styleFor(card, textRef(paragraphs[0].index, 'text'), style) : style
  let subH = 0
  let subSize = 0
  if (paragraphs.length > 0) {
    const subSizing: FitSizing = {
      preferredPt: preferredSize('subheading', theme.typography.scale[H3], boxStyle.fontScale),
      minPt: SIZE_LADDER.subheading.min,
      face: bodyFace(theme, boxStyle),
      italic: boxStyle.italic,
    }
    const subParagraphs: FitParagraph[] = paragraphs.map(({ block, index }) => ({
      text: block.text,
      bold: markBold(card, textRef(index, 'text')), scale: markScale(card, textRef(index, 'text')),
    }))
    const fitted = fitText(
      subParagraphs,
      {
        widthIn: CONTENT_W - TITLE_SUBTITLE_INSET,
        maxHeightIn: BOTTOM - TOP - titleH - TITLE_SUBTITLE_GAP,
      },
      subSizing,
      measure,
    )
    subH = fitted.heightIn
    subSize = fitted.sizePt
  }

  const groupH = paragraphs.length > 0 ? titleH + TITLE_SUBTITLE_GAP + subH : titleH
  // Clamped to at least TOP: a group taller than the slide (an oversized
  // subtitle at the FLOOR_PT size) must not be centred up past the same
  // top margin every other arrangement respects, which would push the title
  // itself off the top of the slide.
  const groupY = Math.max(TOP, (SLIDE_H - groupH) / 2)

  slide.addText(markedRuns(headingText(card), marksFor(card, headingRef)), {
    x: MARGIN,
    y: groupY,
    w: CONTENT_W,
    h: titleH,
    fontFace: headingFace(theme, headingStyle),
    fontSize: titleSize,
    color: hex(headingStyle.color ?? theme.colors.foreground),
    bold: headingStyle.bold ?? true,
    italic: headingStyle.italic,
    underline: headingStyle.underline,
    align: headingStyle.align ?? 'center',
    valign: 'top',
    margin: TEXT_MARGIN_PT,
    lineSpacing: spacingPt(titleSize, titleSizing.lineSpacing ?? DEFAULT_LINE_SPACING),
    // The text now fits by construction; this remains a harmless backstop.
    fit: 'shrink',
  })

  if (paragraphs.length > 0) {
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
      x: MARGIN + TITLE_SUBTITLE_INSET / 2,
      y: groupY + titleH + TITLE_SUBTITLE_GAP,
      w: CONTENT_W - TITLE_SUBTITLE_INSET,
      h: subH,
      fontFace: bodyFace(theme, boxStyle),
      fontSize: subSize,
      color: hex(boxStyle.color ?? theme.colors.muted),
      italic: boxStyle.italic,
      underline: boxStyle.underline,
      align: boxStyle.align ?? 'center',
      valign: 'top',
      margin: TEXT_MARGIN_PT,
      // subSizing (above) never sets `lineSpacing`, so the fit always used
      // DEFAULT_LINE_SPACING for this box.
      lineSpacing: spacingPt(subSize, DEFAULT_LINE_SPACING),
      // The text now fits by construction; this remains a harmless backstop.
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
  /*
    A merged box has one alignment, one face and one size, so an element's own
    values for those cannot be honoured inside it. Colour, underline, italic and
    bold *can* differ run by run, so the element's own go on its runs — without
    this a colour picked for one paragraph of a body slide would show on screen
    and vanish from the file.
  */
  const element = elementStyleOf(card, line.ref)
  const own: Record<string, unknown> = {}
  if (element?.color) own.color = hex(element.color)
  if (element?.underline) own.underline = true
  if (element?.italic) own.italic = true
  if (element?.bold) own.bold = true
  return runs.map((run, i) => {
    const options = { ...own, ...run.options }
    if (i === 0) {
      options.bullet = line.bullet
      options.indentLevel = line.indent
    }
    if (i === runs.length - 1 && !isLast) options.breakLine = true
    return { text: run.text, options }
  })
}

/**
 * A flattened line's fitting indent, matching the indent pptxgenjs actually
 * draws it with (`runsForLine`'s `bullet`/`indentLevel`): a non-bulleted line
 * has none, an ordinary bullet is inset `BULLET_INDENT_IN` (pptxgenjs's own
 * `indentLevel: 0` margin), and a comparison item nested at `indentLevel` 1 is
 * inset twice that.
 */
function lineIndent(line: BulletLine): number | undefined {
  if (!line.bullet) return undefined
  return line.indent >= 1 ? 2 * BULLET_INDENT_IN : BULLET_INDENT_IN
}

const renderBody: SlideRenderer = (slide, card, theme, style, measure) => {
  const contentTop = addHeading(slide, card, theme, style, measure)

  const lines = flattenBlocks(card)
  if (lines.length === 0) return

  const runs = lines.flatMap((line, i) => runsForLine(line, card, i === lines.length - 1))
  const paragraphs: FitParagraph[] = lines.map((line) => ({
    text: line.text,
    indentIn: lineIndent(line),
    bold: markBold(card, line.ref), scale: markScale(card, line.ref),
  }))

  const areaH = BOTTOM - contentTop
  const sizing: FitSizing = {
    preferredPt: preferredSize('body', theme.typography.scale[BODY], style.fontScale),
    minPt: SIZE_LADDER.body.min,
    face: bodyFace(theme, style),
    bold: style.bold,
    italic: style.italic,
    lineSpacing: theme.typography.lineHeight,
  }
  const { sizePt } = fitText(paragraphs, { widthIn: CONTENT_W, maxHeightIn: areaH }, sizing, measure)

  slide.addText(runs, {
    x: MARGIN,
    y: contentTop,
    w: CONTENT_W,
    h: areaH,
    fontFace: bodyFace(theme, style),
    fontSize: sizePt,
    color: hex(style.color ?? theme.colors.foreground),
    align: style.align ?? 'left',
    valign: 'middle',
    lineSpacing: spacingPt(sizePt, sizing.lineSpacing ?? DEFAULT_LINE_SPACING),
    margin: TEXT_MARGIN_PT,
    // The text now fits by construction; this remains a harmless backstop.
    fit: 'shrink',
  })
}

/* ----------------------------------------------------------------- stat --- */

const MAX_STAT_COLUMNS = 4

/**
 * Inner horizontal padding on each side of a stat cell, in inches. Without it,
 * centred values in a 4-up grid sit flush against their neighbours' text —
 * the cell's own width leaves no gutter. Both the fitting width and the drawn
 * box width are narrowed by twice this, and the box is shifted in to match, so
 * the fit and the draw agree on the same padded cell.
 */
const CELL_PAD_IN = 0.08

/**
 * `statHero` and `statGrid`: the numbers are the point, so they get the size.
 *
 * A single stat lands centred and very large; several lay out in rows of at
 * most four, wrapping beyond that rather than shrinking indefinitely.
 */
const renderStat: SlideRenderer = (slide, card, theme, style, measure) => {
  const contentTop = addHeading(slide, card, theme, style, measure)

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
  const area = BOTTOM - contentTop

  // Paragraphs, when present, are fitted first and take a bottom slice off the
  // stat area — sized to what they actually need (up to `PARAGRAPH_MAX_H`)
  // rather than a fixed guess — and the grid gets the rest.
  const PARAGRAPH_MAX_H = 1.2
  const PARAGRAPH_GAP = 0.15

  let paragraphH = 0
  let paragraphSize = 0
  let paragraphStyle: TextStyle = style
  if (paragraphs.length > 0) {
    // Box-level options follow the first paragraph's resolved style, same
    // pattern as `renderTitle`'s multi-paragraph subtitle box.
    paragraphStyle = styleFor(card, textRef(paragraphs[0].index, 'text'), style)
    const subParagraphs: FitParagraph[] = paragraphs.map(({ block, index }) => ({
      text: block.text,
      bold: markBold(card, textRef(index, 'text')), scale: markScale(card, textRef(index, 'text')),
    }))
    const sizing: FitSizing = {
      preferredPt: preferredSize('body', theme.typography.scale[BODY], paragraphStyle.fontScale),
      minPt: SIZE_LADDER.body.min,
      face: bodyFace(theme, paragraphStyle),
      italic: paragraphStyle.italic,
    }
    const fitted = fitText(
      subParagraphs,
      { widthIn: CONTENT_W, maxHeightIn: PARAGRAPH_MAX_H },
      sizing,
      measure,
    )
    paragraphH = fitted.heightIn
    paragraphSize = fitted.sizePt
  }

  const areaH = paragraphs.length > 0 ? area - paragraphH - PARAGRAPH_GAP : area
  const cellH = areaH / rows
  const single = stats.length === 1
  const valueRole: SizeRole = single ? 'statSingle' : 'statGrid'
  const valueRem = theme.typography.scale[single ? H1 : H2]

  // Fitted independently per stat so a long value or label in one cell never
  // sets the size for cells that had room to spare; the smallest of each wins
  // so every value (and every label) still reads as one grid.
  const valueFits = stats.map((stat) => {
    const valueRef = textRef(stat.index, 'value')
    const valueStyle = styleFor(card, valueRef, style)
    const sizing: FitSizing = {
      preferredPt: preferredSize(valueRole, valueRem, valueStyle.fontScale),
      minPt: SIZE_LADDER[valueRole].min,
      face: headingFace(theme, valueStyle),
      bold: valueStyle.bold ?? true,
      italic: valueStyle.italic,
    }
    return fitText(
      [{ text: stat.value, bold: markBold(card, valueRef), scale: markScale(card, valueRef) }],
      { widthIn: cellW - 2 * CELL_PAD_IN, maxHeightIn: cellH * 0.62 },
      sizing,
      measure,
    )
  })
  const labelFits = stats.map((stat) => {
    const labelRef = textRef(stat.index, 'label')
    const labelStyle = styleFor(card, labelRef, style)
    const sizing: FitSizing = {
      preferredPt: preferredSize('body', theme.typography.scale[BODY], labelStyle.fontScale),
      minPt: SIZE_LADDER.body.min,
      face: bodyFace(theme, labelStyle),
      italic: labelStyle.italic,
    }
    return fitText(
      [{ text: stat.label, bold: markBold(card, labelRef), scale: markScale(card, labelRef) }],
      { widthIn: cellW - 2 * CELL_PAD_IN, maxHeightIn: cellH * 0.34 },
      sizing,
      measure,
    )
  })
  const valueSize = Math.min(...valueFits.map((f) => f.sizePt))
  const labelSize = Math.min(...labelFits.map((f) => f.sizePt))

  stats.forEach((stat, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    const x = MARGIN + col * cellW + CELL_PAD_IN
    const y = contentTop + row * cellH
    const w = cellW - 2 * CELL_PAD_IN

    const valueRef = textRef(stat.index, 'value')
    const valueStyle = styleFor(card, valueRef, style)
    slide.addText(markedRuns(stat.value, marksFor(card, valueRef)), {
      x,
      y,
      w,
      h: cellH * 0.62,
      fontFace: headingFace(theme, valueStyle),
      fontSize: valueSize,
      color: hex(valueStyle.color ?? theme.colors.accent),
      bold: valueStyle.bold ?? true,
      italic: valueStyle.italic,
      underline: valueStyle.underline,
      align: 'center',
      valign: 'bottom',
      margin: TEXT_MARGIN_PT,
      lineSpacing: spacingPt(valueSize, DEFAULT_LINE_SPACING),
      fit: 'shrink',
    })

    const labelRef = textRef(stat.index, 'label')
    const labelStyle = styleFor(card, labelRef, style)
    slide.addText(markedRuns(stat.label, marksFor(card, labelRef)), {
      x,
      y: y + cellH * 0.64,
      w,
      h: cellH * 0.34,
      fontFace: bodyFace(theme, labelStyle),
      fontSize: labelSize,
      color: hex(labelStyle.color ?? theme.colors.muted),
      italic: labelStyle.italic,
      underline: labelStyle.underline,
      align: 'center',
      valign: 'top',
      margin: TEXT_MARGIN_PT,
      lineSpacing: spacingPt(labelSize, DEFAULT_LINE_SPACING),
      fit: 'shrink',
    })
  })

  if (paragraphs.length > 0) {
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
      y: BOTTOM - paragraphH,
      w: CONTENT_W,
      h: paragraphH,
      fontFace: bodyFace(theme, paragraphStyle),
      fontSize: paragraphSize,
      color: hex(paragraphStyle.color ?? theme.colors.muted),
      italic: paragraphStyle.italic,
      underline: paragraphStyle.underline,
      align: paragraphStyle.align ?? 'center',
      valign: 'top',
      margin: TEXT_MARGIN_PT,
      lineSpacing: spacingPt(paragraphSize, DEFAULT_LINE_SPACING),
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

  const contentTop = addHeading(slide, card, theme, style, measure)

  const shown = groups.slice(0, 4)
  const columns = shown.length
  // A little tighter than the two-column gap once three or four groups have
  // to share the row, so a column never has to give up more than it needs to.
  const gap = columns >= 3 ? 0.3 : 0.4
  const colW = (CONTENT_W - gap * (columns - 1)) / columns

  const HEADING_CAP_H = 0.8
  const HEADING_BODY_GAP = 0.1

  // Fitted independently per column so one long column heading doesn't set
  // the size for a short one; the smallest size wins and the tallest fitted
  // height becomes every column's heading box, so the bullets start at one y.
  const headingFits = shown.map((group) => {
    const headingRef = textRef(group.index, 'heading')
    const headingStyle = styleFor(card, headingRef, style)
    const sizing: FitSizing = {
      preferredPt: preferredSize('subheading', theme.typography.scale[H3], headingStyle.fontScale),
      minPt: SIZE_LADDER.subheading.min,
      face: headingFace(theme, headingStyle),
      bold: headingStyle.bold ?? true,
      italic: headingStyle.italic,
    }
    return fitText(
      [{ text: group.heading, bold: markBold(card, headingRef), scale: markScale(card, headingRef) }],
      { widthIn: colW, maxHeightIn: HEADING_CAP_H },
      sizing,
      measure,
    )
  })
  const headingSize = Math.min(...headingFits.map((f) => f.sizePt))
  const headingH = Math.max(...headingFits.map((f) => f.heightIn))

  const bulletsTop = contentTop + headingH + HEADING_BODY_GAP
  const bulletsAreaH = BOTTOM - bulletsTop

  // Fitted independently per column too, then unified the same way — the
  // smallest size wins so every column's bullets read at one size.
  const bulletFits = shown.map((group) => {
    const paragraphs: FitParagraph[] = group.items.map((item, j) => ({
      text: item,
      indentIn: BULLET_INDENT_IN,
      bold: markBold(card, textRef(group.index, 'items', j)), scale: markScale(card, textRef(group.index, 'items', j)),
    }))
    const sizing: FitSizing = {
      preferredPt: preferredSize('body', theme.typography.scale[BODY], style.fontScale),
      minPt: SIZE_LADDER.body.min,
      face: bodyFace(theme, style),
      bold: style.bold,
      italic: style.italic,
      lineSpacing: theme.typography.lineHeight,
    }
    return fitText(paragraphs, { widthIn: colW, maxHeightIn: bulletsAreaH }, sizing, measure)
  })
  const bulletSize = Math.min(...bulletFits.map((f) => f.sizePt))

  shown.forEach((group, i) => {
    const x = MARGIN + i * (colW + gap)

    const headingRef = textRef(group.index, 'heading')
    const headingStyle = styleFor(card, headingRef, style)
    slide.addText(markedRuns(group.heading, marksFor(card, headingRef)), {
      x,
      y: contentTop,
      w: colW,
      h: headingH,
      fontFace: headingFace(theme, headingStyle),
      fontSize: headingSize,
      color: hex(headingStyle.color ?? theme.colors.accent),
      bold: headingStyle.bold ?? true,
      italic: headingStyle.italic,
      underline: headingStyle.underline,
      align: 'left',
      valign: 'middle',
      margin: TEXT_MARGIN_PT,
      lineSpacing: spacingPt(headingSize, DEFAULT_LINE_SPACING),
      fit: 'shrink',
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
      y: bulletsTop,
      w: colW,
      h: bulletsAreaH,
      fontFace: bodyFace(theme, style),
      fontSize: bulletSize,
      color: hex(style.color ?? theme.colors.foreground),
      underline: style.underline,
      align: 'left',
      valign: 'top',
      lineSpacing: spacingPt(bulletSize, theme.typography.lineHeight),
      margin: TEXT_MARGIN_PT,
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
  const contentTop = addHeading(slide, card, theme, style, measure)

  // The quote and its attribution are fitted independently, then centred as
  // one pair inside the area below the heading — clearing `addHeading`'s real
  // bottom rather than a fixed guess at where its box ends.
  const area = BOTTOM - contentTop
  const quoteW = CONTENT_W - 1.0
  const attribution = quote.block.attribution
  const ATTRIBUTION_MAX_H = 0.6

  const textRefKey = textRef(quote.index, 'text')
  const quoteStyle = styleFor(card, textRefKey, style)
  const quoteSizing: FitSizing = {
    preferredPt: preferredSize('subheading', theme.typography.scale[H3], quoteStyle.fontScale),
    minPt: SIZE_LADDER.subheading.min,
    face: headingFace(theme, quoteStyle),
    italic: quoteStyle.italic ?? true,
  }
  const quoteFit = fitText(
    [{ text: `“${quote.block.text}”`, bold: markBold(card, textRefKey), scale: markScale(card, textRefKey) }],
    { widthIn: quoteW, maxHeightIn: area - (attribution ? ATTRIBUTION_MAX_H : 0) },
    quoteSizing,
    measure,
  )

  let attrFit: { sizePt: number; heightIn: number } | null = null
  let attrStyle: TextStyle | undefined
  if (attribution) {
    const attrRef = textRef(quote.index, 'attribution')
    attrStyle = styleFor(card, attrRef, style)
    const attrSizing: FitSizing = {
      preferredPt: preferredSize('body', theme.typography.scale[BODY], attrStyle.fontScale),
      minPt: SIZE_LADDER.body.min,
      face: bodyFace(theme, attrStyle),
      italic: attrStyle.italic,
    }
    attrFit = fitText(
      [{ text: `— ${attribution}`, bold: markBold(card, attrRef), scale: markScale(card, attrRef) }],
      { widthIn: quoteW, maxHeightIn: ATTRIBUTION_MAX_H },
      attrSizing,
      measure,
    )
  }

  const pairH = quoteFit.heightIn + (attrFit ? attrFit.heightIn : 0)
  const groupY = contentTop + (area - pairH) / 2

  slide.addText(markedRuns(`“${quote.block.text}”`, marksFor(card, textRefKey)), {
    x: MARGIN + 0.5,
    y: groupY,
    w: quoteW,
    h: quoteFit.heightIn,
    fontFace: headingFace(theme, quoteStyle),
    fontSize: quoteFit.sizePt,
    color: hex(quoteStyle.color ?? theme.colors.foreground),
    italic: quoteStyle.italic ?? true,
    underline: quoteStyle.underline,
    align: quoteStyle.align ?? 'center',
    valign: 'middle',
    margin: TEXT_MARGIN_PT,
    lineSpacing: spacingPt(quoteFit.sizePt, DEFAULT_LINE_SPACING),
    fit: 'shrink',
  })

  if (attribution && attrFit && attrStyle) {
    const attrRef = textRef(quote.index, 'attribution')
    slide.addText(markedRuns(`— ${attribution}`, marksFor(card, attrRef)), {
      x: MARGIN + 0.5,
      y: groupY + quoteFit.heightIn,
      w: quoteW,
      h: attrFit.heightIn,
      fontFace: bodyFace(theme, attrStyle),
      fontSize: attrFit.sizePt,
      color: hex(attrStyle.color ?? theme.colors.muted),
      underline: attrStyle.underline,
      align: attrStyle.align ?? 'center',
      valign: 'top',
      margin: TEXT_MARGIN_PT,
      lineSpacing: spacingPt(attrFit.sizePt, DEFAULT_LINE_SPACING),
      fit: 'shrink',
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

export function fitCard(height: number): Fit {
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
export function fittedPointSize(rem: number, fontScale: number | undefined, fit: Fit): number {
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
  measure: TextMeasurer,
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
      margin: TEXT_MARGIN_PT,
      ...options,
    })
  }

  const runStyle = (ref: string) => styleFor(card, ref, style)

  /**
   * The point size a run of paragraphs actually gets inside `area`.
   *
   * `preferredPt` stays `fittedPointSize` — the box-proportional size, so text
   * keeps its proportion to the box the user drew — but that is now a starting
   * point rather than the final answer: `fitText` steps it down until the
   * paragraphs actually fit `area`, which a box resized smaller than its
   * content needs. `minPt` falls back to 12 (the body floor) only when even
   * `preferredPt` is already below it, so the floor never rises above what was
   * asked for.
   */
  const fitSize = (
    paragraphs: FitParagraph[],
    area: PlacedBox,
    preferredPt: number,
    face: string,
    bold?: boolean,
    italic?: boolean,
    lineSpacing?: number,
  ): { sizePt: number; spacing: number } => {
    const spacing = lineSpacing ?? DEFAULT_LINE_SPACING
    const sizing: FitSizing = {
      preferredPt,
      minPt: Math.min(preferredPt, SIZE_LADDER.body.min),
      face,
      bold,
      italic,
      lineSpacing: spacing,
    }
    const { sizePt } = fitText(paragraphs, { widthIn: area.w, maxHeightIn: area.h }, sizing, measure)
    return { sizePt, spacing }
  }

  switch (block.type) {
    case 'heading': {
      const ref = textRef(index, 'text')
      const own = runStyle(ref)
      const face = headingFace(theme, own)
      const bold = own.bold ?? true
      const preferredPt = fittedPointSize(theme.typography.scale[H2], own.fontScale, fit)
      const { sizePt, spacing } = fitSize(
        [{ text: block.text, bold: markBold(card, ref), scale: markScale(card, ref) }],
        box,
        preferredPt,
        face,
        bold,
        own.italic,
      )
      text(markedRuns(block.text, marksFor(card, ref)), {
        fontFace: face,
        fontSize: sizePt,
        color: hex(own.color ?? theme.colors.foreground),
        bold,
        italic: own.italic,
        underline: own.underline,
        align: own.align ?? 'left',
        lineSpacing: spacingPt(sizePt, spacing),
      })
      return
    }

    case 'paragraph': {
      const ref = textRef(index, 'text')
      const own = runStyle(ref)
      const face = bodyFace(theme, own)
      const preferredPt = fittedPointSize(theme.typography.scale[BODY], own.fontScale, fit)
      const { sizePt, spacing } = fitSize(
        [{ text: block.text, bold: markBold(card, ref), scale: markScale(card, ref) }],
        box,
        preferredPt,
        face,
        own.bold,
        own.italic,
        theme.typography.lineHeight,
      )
      text(markedRuns(block.text, marksFor(card, ref)), {
        fontFace: face,
        fontSize: sizePt,
        color: hex(own.color ?? theme.colors.foreground),
        bold: own.bold,
        italic: own.italic,
        underline: own.underline,
        align: own.align ?? 'left',
        lineSpacing: spacingPt(sizePt, spacing),
      })
      return
    }

    case 'bulletList': {
      const face = bodyFace(theme, style)
      const preferredPt = fittedPointSize(theme.typography.scale[BODY], style.fontScale, fit)
      const paragraphs: FitParagraph[] = block.items.map((item, j) => ({
        text: item,
        indentIn: BULLET_INDENT_IN,
        bold: markBold(card, textRef(index, 'items', j)), scale: markScale(card, textRef(index, 'items', j)),
      }))
      const { sizePt, spacing } = fitSize(
        paragraphs,
        box,
        preferredPt,
        face,
        undefined,
        undefined,
        theme.typography.lineHeight,
      )
      text(listRuns(card, index, 'items', block.items), {
        fontFace: face,
        fontSize: sizePt,
        color: hex(style.color ?? theme.colors.foreground),
        underline: style.underline,
        align: style.align ?? 'left',
        lineSpacing: spacingPt(sizePt, spacing),
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
      const valueArea = upperSlice(box, VALUE_SHARE)
      const labelArea = lowerSlice(box, VALUE_SHARE)

      const valueRef = textRef(index, 'value')
      const valueStyle = runStyle(valueRef)
      const valueFace = headingFace(theme, valueStyle)
      const valueBold = valueStyle.bold ?? true
      const valuePreferred = fittedPointSize(theme.typography.scale[H1], valueStyle.fontScale, fit)
      const { sizePt: valueSize, spacing: valueSpacing } = fitSize(
        [{ text: block.value, bold: markBold(card, valueRef), scale: markScale(card, valueRef) }],
        valueArea,
        valuePreferred,
        valueFace,
        valueBold,
        valueStyle.italic,
      )
      text(
        markedRuns(block.value, marksFor(card, valueRef)),
        {
          fontFace: valueFace,
          fontSize: valueSize,
          color: hex(valueStyle.color ?? theme.colors.accent),
          bold: valueBold,
          italic: valueStyle.italic,
          underline: valueStyle.underline,
          align: valueStyle.align ?? 'left',
          valign: 'bottom',
          lineSpacing: spacingPt(valueSize, valueSpacing),
        },
        valueArea,
      )

      const labelRef = textRef(index, 'label')
      const labelStyle = runStyle(labelRef)
      const labelFace = bodyFace(theme, labelStyle)
      const labelPreferred = fittedPointSize(theme.typography.scale[BODY], labelStyle.fontScale, fit)
      const { sizePt: labelSize, spacing: labelSpacing } = fitSize(
        [{ text: block.label, bold: markBold(card, labelRef), scale: markScale(card, labelRef) }],
        labelArea,
        labelPreferred,
        labelFace,
        undefined,
        labelStyle.italic,
      )
      text(
        markedRuns(block.label, marksFor(card, labelRef)),
        {
          fontFace: labelFace,
          fontSize: labelSize,
          color: hex(labelStyle.color ?? theme.colors.muted),
          italic: labelStyle.italic,
          underline: labelStyle.underline,
          align: labelStyle.align ?? 'left',
          lineSpacing: spacingPt(labelSize, labelSpacing),
        },
        labelArea,
      )
      return
    }

    case 'quote': {
      const attribution = block.attribution
      const QUOTE_SHARE = attribution ? 0.75 : 1
      const quoteArea = upperSlice(box, QUOTE_SHARE)
      const ref = textRef(index, 'text')
      const own = runStyle(ref)
      const face = bodyFace(theme, own)
      const italic = own.italic ?? true
      const preferredPt = fittedPointSize(theme.typography.scale[H3], own.fontScale, fit)
      const quoteText = `“${block.text}”`
      const { sizePt, spacing } = fitSize(
        [{ text: quoteText, bold: markBold(card, ref), scale: markScale(card, ref) }],
        quoteArea,
        preferredPt,
        face,
        undefined,
        italic,
        theme.typography.lineHeight,
      )
      text(
        markedRuns(quoteText, marksFor(card, ref)),
        {
          fontFace: face,
          fontSize: sizePt,
          color: hex(own.color ?? theme.colors.foreground),
          underline: own.underline,
          italic,
          align: own.align ?? 'left',
          lineSpacing: spacingPt(sizePt, spacing),
        },
        quoteArea,
      )

      if (attribution) {
        const attrArea = lowerSlice(box, QUOTE_SHARE)
        const attrRef = textRef(index, 'attribution')
        const attrStyle = runStyle(attrRef)
        const attrFace = bodyFace(theme, attrStyle)
        const attrPreferred = fittedPointSize(theme.typography.scale[BODY], attrStyle.fontScale, fit)
        const attrText = `— ${attribution}`
        const { sizePt: attrSize, spacing: attrSpacing } = fitSize(
          [{ text: attrText, bold: markBold(card, attrRef), scale: markScale(card, attrRef) }],
          attrArea,
          attrPreferred,
          attrFace,
        )
        text(
          markedRuns(attrText, marksFor(card, attrRef)),
          {
            fontFace: attrFace,
            fontSize: attrSize,
            color: hex(attrStyle.color ?? theme.colors.muted),
            underline: attrStyle.underline,
            align: attrStyle.align ?? 'left',
            lineSpacing: spacingPt(attrSize, attrSpacing),
          },
          attrArea,
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
      const labelArea = upperSlice(box, LABEL_SHARE)
      const bodyArea = lowerSlice(box, LABEL_SHARE)

      const labelRef = textRef(index, 'label')
      const labelStyle = runStyle(labelRef)
      const labelFace = headingFace(theme, labelStyle)
      const labelBold = labelStyle.bold ?? true
      const labelPreferred = fittedPointSize(theme.typography.scale[BODY], labelStyle.fontScale, fit)
      const { sizePt: labelSize, spacing: labelSpacing } = fitSize(
        [{ text: block.label, bold: markBold(card, labelRef), scale: markScale(card, labelRef) }],
        labelArea,
        labelPreferred,
        labelFace,
        labelBold,
      )
      text(
        markedRuns(block.label, marksFor(card, labelRef)),
        {
          fontFace: labelFace,
          fontSize: labelSize,
          color: hex(labelStyle.color ?? theme.colors.accent),
          underline: labelStyle.underline,
          bold: labelBold,
          align: labelStyle.align ?? 'left',
          lineSpacing: spacingPt(labelSize, labelSpacing),
        },
        labelArea,
      )

      const bodyRef = textRef(index, 'text')
      const bodyStyle = runStyle(bodyRef)
      const bodyFaceName = bodyFace(theme, bodyStyle)
      const bodyPreferred = fittedPointSize(theme.typography.scale[BODY], bodyStyle.fontScale, fit)
      const { sizePt: bodySize, spacing: bodySpacing } = fitSize(
        [{ text: block.text, bold: markBold(card, bodyRef), scale: markScale(card, bodyRef) }],
        bodyArea,
        bodyPreferred,
        bodyFaceName,
      )
      text(
        markedRuns(block.text, marksFor(card, bodyRef)),
        {
          fontFace: bodyFaceName,
          fontSize: bodySize,
          color: hex(bodyStyle.color ?? theme.colors.foreground),
          underline: bodyStyle.underline,
          align: bodyStyle.align ?? 'left',
          lineSpacing: spacingPt(bodySize, bodySpacing),
        },
        bodyArea,
      )
      return
    }

    case 'comparisonGroup': {
      const HEADING_SHARE = 0.24
      const headingArea = upperSlice(box, HEADING_SHARE)
      const itemsArea = lowerSlice(box, HEADING_SHARE)

      const headingRef = textRef(index, 'heading')
      const headingStyle = runStyle(headingRef)
      const headingFaceName = headingFace(theme, headingStyle)
      const headingBold = headingStyle.bold ?? true
      const headingPreferred = fittedPointSize(theme.typography.scale[H3], headingStyle.fontScale, fit)
      const { sizePt: headingSize, spacing: headingSpacing } = fitSize(
        [{ text: block.heading, bold: markBold(card, headingRef), scale: markScale(card, headingRef) }],
        headingArea,
        headingPreferred,
        headingFaceName,
        headingBold,
      )
      text(
        markedRuns(block.heading, marksFor(card, headingRef)),
        {
          fontFace: headingFaceName,
          fontSize: headingSize,
          color: hex(headingStyle.color ?? theme.colors.accent),
          underline: headingStyle.underline,
          bold: headingBold,
          align: headingStyle.align ?? 'left',
          lineSpacing: spacingPt(headingSize, headingSpacing),
        },
        headingArea,
      )

      const face = bodyFace(theme, style)
      const preferredPt = fittedPointSize(theme.typography.scale[BODY], style.fontScale, fit)
      const paragraphs: FitParagraph[] = block.items.map((item, j) => ({
        text: item,
        indentIn: BULLET_INDENT_IN,
        bold: markBold(card, textRef(index, 'items', j)), scale: markScale(card, textRef(index, 'items', j)),
      }))
      const { sizePt, spacing } = fitSize(paragraphs, itemsArea, preferredPt, face)
      text(
        listRuns(card, index, 'items', block.items),
        {
          fontFace: face,
          fontSize: sizePt,
          color: hex(style.color ?? theme.colors.foreground),
          underline: style.underline,
          align: style.align ?? 'left',
          lineSpacing: spacingPt(sizePt, spacing),
        },
        itemsArea,
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
      const face = bodyFace(theme, style)
      const preferredPt = fittedPointSize(theme.typography.scale[BODY], style.fontScale, fit)
      const { sizePt, spacing } = fitSize([{ text: block.alt }], box, preferredPt, face, undefined, true)
      text(block.alt, {
        fontFace: face,
        fontSize: sizePt,
        color: hex(style.color ?? theme.colors.muted),
        underline: style.underline,
        italic: true,
        align: 'center',
        valign: 'middle',
        lineSpacing: spacingPt(sizePt, spacing),
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

/**
 * Turns each run's size multiple into points, when the box is written.
 *
 * `markedRuns` cannot do it: a size mark is a multiple of the box's own size, and
 * only `addText` sees a box's runs and its `fontSize` together. Wrapping the slide
 * here, once, covers every renderer — none of them has to remember.
 */
function withRunSizes(slide: PptxSlide): PptxSlide {
  return {
    addShape: (shape, options) => slide.addShape(shape, options),
    addText(text, options) {
      if (typeof text === 'string' || typeof options.fontSize !== 'number') return slide.addText(text, options)
      const boxPt = options.fontSize
      const runs = text.map((run) => {
        const scale = run.options[SIZE_SCALE_KEY]
        if (typeof scale !== 'number') return run
        const { [SIZE_SCALE_KEY]: _scale, ...rest } = run.options
        void _scale
        return { text: run.text, options: { ...rest, fontSize: Math.round(boxPt * scale * 10) / 10 } }
      })
      return slide.addText(runs, options)
    },
  }
}

const sized =
  (render: SlideRenderer): SlideRenderer =>
  (slide, ...rest) =>
    render(withRunSizes(slide), ...rest)

export const RENDERERS: Record<PptxGroup, SlideRenderer> = {
  title: sized(renderTitle),
  body: sized(renderBody),
  stat: sized(renderStat),
  twoCol: sized(renderTwoCol),
  quote: sized(renderQuote),
  adjusted: sized(renderAdjusted),
}
