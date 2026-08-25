import type { Card, ContentBlock } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { TextStyle } from '@/engine/textStyle'
import { textRef } from '@/engine/marks'
import type { PptxTextRun } from './textRun'
import { faceName, hex, markedRuns, pointSize, resolveRunStyle } from './textRun'
import type { PptxGroup } from './slideGroup'

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
const renderTitle: SlideRenderer = (slide, card, theme, style) => {
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

const renderBody: SlideRenderer = (slide, card, theme, style) => {
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
const renderStat: SlideRenderer = (slide, card, theme, style) => {
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
const renderTwoCol: SlideRenderer = (slide, card, theme, style) => {
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
    renderBody(slide, card, theme, style)
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
const renderQuote: SlideRenderer = (slide, card, theme, style) => {
  const quote = firstOfType(card, 'quote')
  if (!quote) {
    renderBody(slide, card, theme, style)
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

export const RENDERERS: Record<PptxGroup, SlideRenderer> = {
  title: renderTitle,
  body: renderBody,
  stat: renderStat,
  twoCol: renderTwoCol,
  quote: renderQuote,
}
