import type { Card, CalloutBlock, CodeBlock, ContentBlock, PointBlock } from '@/engine/contentBlocks'
import type { Ground } from '@/engine/composition'
import { textRef } from '@/engine/marks'
import {
  codeLightMuted,
  deepMuted,
  mixHex,
  smallAccentInk,
  type ThemeTokens,
} from '@/lib/theme-tokens'
import type { TextStyle } from '@/engine/textStyle'
import { BODY, H3, bodyFace, headingFace, markBold, markScale, marksFor, styleFor } from './blockStyle'
import type { PptxSlide } from './slideRenderers'
import {
  DEFAULT_LINE_SPACING,
  FLOOR_PT,
  INSET_X_IN,
  SIZE_LADDER,
  TEXT_MARGIN_PT,
  WIDTH_HEADROOM,
  preferredSize,
  spacingPt,
  textHeight,
  type FitParagraph,
  type FitSizing,
  type TextMeasurer,
} from './textFit'
import { hex, markedRuns, type PptxTextRun } from './textRun'

/*
  The structured blocks, drawn for the .pptx: a heading's kicker, a run of term rows
  (point), a callout and a code panel. Every arrangement in `slideRenderers.ts` and the
  nudged-card path draw them through the painters here, so a block looks the same
  wherever it lands.

  A painter measures itself at a body size `pt` and then draws at an (x, y) it is
  handed; the caller owns the placement (a stack in the body arrangement, a strip at the
  foot of the others, a box the user sized on a nudged card). Nothing here fetches or
  reads the DOM; the text measurer is passed in, like everywhere else in `src/export/`.
*/

/** The code face. The export names a face by the first family of a stack, and PowerPoint has no web fonts. */
export const CODE_FACE = 'Consolas'

/** Rule between rows and padding inside a row, in inches. */
const ROW_PAD = 0.02
/** Gap between a term and its meaning, in inches. */
const COL_GAP = 0.3
/** Padding between a panel's edge and its text boxes (each box adds its own text margin). */
const PANEL_PAD = 0.06
/** Gap between two stacked blocks, in inches. */
export const BLOCK_GAP = 0.12
/** The code's line pitch, as on screen. */
const CODE_LINE_SPACING = 1.5
/** The same rem-to-inch step the rest of the export uses (`PT_PER_REM` points a rem). */
const IN_PER_REM = 18 / 72
/** Hairline width, in points. */
const RULE_PT = 0.75

/** The sizes of the small steps, as multiples of the body (the stylesheet's `SLIDE_SIZE` and `CODE_SIZE`). */
const EYEBROW_RATIO = 0.65
const LEAD_RATIO = 1.2
const CAPTION_RATIO = 0.7
const CODE_RATIO = 0.85

export function isStructured(block: ContentBlock): block is PointBlock | CalloutBlock | CodeBlock {
  return block.type === 'point' || block.type === 'callout' || block.type === 'code'
}

/** Whether a card holds any block this module draws (not counting a kicker, which rides its heading). */
export function hasStructured(card: Card): boolean {
  return card.blocks.some(isStructured)
}

/* ------------------------------------------------------------------ inks --- */

/**
 * The colours the structured blocks are drawn with on a slide of `ground`, from the theme the
 * renderer was handed (already moved onto the ground by `groundTheme`, so `colors.accent` and the
 * rest are the slide's own). What the grounded theme cannot say is read off its raw colours: on a
 * deep slide the accent's ink and the tinted panel are the deep ground's, as the stylesheet
 * re-points them.
 */
export interface Inks {
  /** Small accent text (the kicker, a quiet callout's label): the accent pulled toward the foreground. */
  smallAccent: string
  /** The hairline between rows. */
  border: string
  /** The accent-filled callout. */
  calloutFill: string
  calloutInk: string
  /** The panel of a callout that is not the slide's accent owner. */
  quietFill: string
  /** The code panel: the deep ground on a plain or tint slide, a light panel on a deep one. */
  code: { fill: string; ink: string; muted: string }
}

export function inksFor(theme: ThemeTokens, ground: Ground): Inks {
  const c = theme.colors
  const smallAccent = smallAccentInk({ accent: c.accent, foreground: c.foreground })
  if (ground === 'deep') {
    return {
      smallAccent,
      border: mixHex(c.deepForeground, c.deep, 0.25),
      calloutFill: c.accent,
      calloutInk: c.deep,
      quietFill: mixHex(c.deepForeground, c.deep, 0.08),
      code: { fill: c.deepForeground, ink: c.deep, muted: codeLightMuted(c) },
    }
  }
  return {
    smallAccent,
    border: c.border,
    calloutFill: c.accent,
    calloutInk: c.accentForeground,
    quietFill: ground === 'tint' ? c.surface : c.tint,
    code: { fill: c.deep, ink: c.deepForeground, muted: deepMuted(c) },
  }
}

/** Everything a painter reads about the slide it draws on. */
export interface Env {
  card: Card
  theme: ThemeTokens
  /** Already `mergeTextStyle(deckStyle, card.textStyle)`. */
  style: TextStyle
  measure: TextMeasurer
  inks: Inks
  /** The body size the slide would draw at with room to spare: the ceiling of every fit, and what the code's floor is a step of. */
  bodyPt: number
}

export function makeEnv(
  card: Card,
  theme: ThemeTokens,
  style: TextStyle,
  measure: TextMeasurer,
  ground: Ground,
  bodyPt?: number,
): Env {
  return {
    card,
    theme,
    style,
    measure,
    inks: inksFor(theme, ground),
    bodyPt: bodyPt ?? preferredSize('body', theme.typography.scale[BODY], style.fontScale),
  }
}

/* ---------------------------------------------------------------- painter --- */

/** One block (or run) measured at a body size: how tall it is and how to draw it. */
export interface BlockLayout {
  heightIn: number
  /** `opts.h` stretches a panel to a box the user sized; the text keeps its measured place at the top. */
  draw(slide: PptxSlide, x: number, y: number, opts?: { h?: number; rotate?: number }): void
}

/**
 * A block ready to be laid out at any body size. `budgetIn` is the room left for it: only a code
 * panel acts on it (it cuts lines at the floor size rather than overflow); `Infinity` asks for its
 * natural height.
 */
export interface Painter {
  layout(pt: number, budgetIn: number): BlockLayout
}

/** A step of the body size, in whole points. */
const stepPt = (pt: number, ratio: number) => Math.max(6, Math.round(pt * ratio))

/** A small step (the kicker, a callout's label): never under the export's text floor, unless the body itself is. */
const smallPt = (pt: number, ratio: number) => Math.max(Math.min(FLOOR_PT, pt), stepPt(pt, ratio))

/**
 * How much larger (or smaller) a run's own size pick makes it than the body the painter was sized from.
 * The deck and card pick is already in that body (`Env.bodyPt`), so only what the element or run adds counts.
 */
const relScale = (env: Env, own: TextStyle): number => (own.fontScale ?? 1) / (env.style.fontScale ?? 1)

/** A size to a tenth of a point. */
const tenth = (pt: number) => Math.round(pt * 10) / 10

/** The term's size: the h3 step over the body, capped at the subheading band like every other subheading. */
function termPt(theme: ThemeTokens, pt: number): number {
  return Math.min(SIZE_LADDER.subheading.cap, stepPt(pt, theme.typography.scale[H3] / theme.typography.scale[BODY]))
}

/** The sizes tried from the largest down: `from`, one point less each time, and `to` last. */
function sizesFrom(from: number, to: number): number[] {
  const out: number[] = []
  for (let pt = from; pt > to; pt -= 1) out.push(pt)
  out.push(to)
  return out
}

type Box = { x: number; y: number; w: number; h: number }

/**
 * The slide with everything drawn through it turned `deg` degrees clockwise about `(cx, cy)`: each box
 * keeps its size, its centre moves round the pivot and it takes the rotation, so a panel and the text
 * boxes on it turn as one block (a nudged card's rotation). The unwhitened slide, if any, is turned too.
 */
export function rotateAbout(slide: PptxSlide, cx: number, cy: number, deg: number): PptxSlide {
  return {
    addImage: (options) => slide.addImage(options),
    addShape: (shape, options) => slide.addShape(shape, turnOptions(options, cx, cy, deg)),
    addText: (text, options) => slide.addText(text, turnOptions(options, cx, cy, deg)),
    ...(slide.unwhitened ? { unwhitened: rotateAbout(slide.unwhitened, cx, cy, deg) } : {}),
  }
}

/** One box's options turned `deg` degrees clockwise about `(cx, cy)`: same size, centre moved round the pivot, rotation set. */
export function turnOptions<T extends Record<string, unknown>>(options: T, cx: number, cy: number, deg: number): T {
  const rad = (deg * Math.PI) / 180
  const { x, y, w, h } = options as unknown as { x: number; y: number; w: number; h: number }
  const dx = x + w / 2 - cx
  const dy = y + h / 2 - cy
  const nx = cx + dx * Math.cos(rad) - dy * Math.sin(rad)
  const ny = cy + dx * Math.sin(rad) + dy * Math.cos(rad)
  return { ...options, x: nx - w / 2, y: ny - h / 2, rotate: deg }
}

/** `slide` turned about the centre of the `w` by `h` block at `(x, y)` when `rotate` asks for it. */
function turned(slide: PptxSlide, x: number, y: number, w: number, h: number, rotate: number | undefined): PptxSlide {
  return rotate ? rotateAbout(slide, x + w / 2, y + h / 2, rotate) : slide
}

function addBox(slide: PptxSlide, runs: PptxTextRun[], box: Box, options: Record<string, unknown>): void {
  slide.addText(runs, {
    ...box,
    valign: 'top',
    margin: TEXT_MARGIN_PT,
    // The text fits by construction; this remains the same harmless backstop every box carries.
    fit: 'shrink',
    ...options,
  })
}

function boxHeight(
  text: string,
  widthIn: number,
  face: string,
  pt: number,
  options: { bold?: boolean; italic?: boolean; lineSpacing?: number; scale?: number; markBold?: true },
  measure: TextMeasurer,
): number {
  const paragraph: FitParagraph = { text, bold: options.markBold, scale: options.scale }
  const sizing: FitSizing = { preferredPt: pt, minPt: pt, face, bold: options.bold, italic: options.italic, lineSpacing: options.lineSpacing }
  return textHeight([paragraph], widthIn, sizing, pt, measure)
}

/* ----------------------------------------------------------------- kicker --- */

/** The kicker's text on the heading at `index`, or `null` when it has none (a blank one counts as none). */
export function kickerOf(card: Card, index: number): string | null {
  const block = card.blocks[index]
  if (block?.type !== 'heading' || !block.kicker || block.kicker.trim() === '') return null
  return block.kicker
}

/**
 * A kicker's (or a callout label's) words as the file shows them: in capitals, as the screen sets them. Marks are character
 * offsets, so a string whose capitals change its length (a German sharp s) is kept as typed.
 */
export function kickerText(text: string): string {
  const upper = text.toUpperCase()
  return upper.length === text.length ? upper : text
}

export interface KickerLayout {
  pt: number
  heightIn: number
  /** Draws it in a box of width `w` at `(x, y)`; `align` follows its heading's. */
  draw(slide: PptxSlide, x: number, y: number, w: number, defaultAlign: 'left' | 'center', h?: number): void
}

/**
 * The small heading over a heading: small, accent-tinted and letter-spaced, directly above its title.
 * It is a run of its own (`N:kicker`), so it carries its own marks and typography. The words are
 * set in capitals here (`kickerText`), since the file has no style rule to do it.
 */
export function kickerLayout(env: Env, index: number, widthIn: number, bodyPt: number = env.bodyPt): KickerLayout | null {
  const typed = kickerOf(env.card, index)
  if (typed === null) return null
  const text = kickerText(typed)
  const ref = textRef(index, 'kicker')
  const own = styleFor(env.card, ref, env.style)
  const face = headingFace(env.theme, own)
  const pt = smallPt(tenth(bodyPt * relScale(env, own)), EYEBROW_RATIO)
  const heightIn = boxHeight(text, widthIn, face, pt, { bold: true, markBold: markBold(env.card, ref), scale: markScale(env.card, ref) }, env.measure)
  return {
    pt,
    heightIn,
    draw(slide, x, y, w, defaultAlign, h) {
      addBox(slide, markedRuns(text, marksFor(env.card, ref)), { x, y, w, h: h ?? heightIn }, {
        fontFace: face,
        fontSize: pt,
        color: hex(own.color ?? env.inks.smallAccent),
        bold: true,
        italic: own.italic,
        underline: own.underline,
        charSpacing: 1.5,
        align: own.align ?? defaultAlign,
        lineSpacing: spacingPt(pt, DEFAULT_LINE_SPACING),
      })
    },
  }
}

/* ------------------------------------------------------------- term rows --- */

/**
 * A consecutive run of points: two aligned columns, the term (accent, the heading face, bold) on the
 * left third and the meaning (the body face) on the right two thirds, a hairline above every row and,
 * when `closeBelow`, one below the last. Rows are not boxed or filled.
 */
export function pointRun(env: Env, items: { block: PointBlock; index: number }[], widthIn: number, closeBelow: boolean): Painter {
  const termW = (widthIn - COL_GAP) / 3
  const textW = widthIn - COL_GAP - termW
  return {
    layout(pt, _budget) {
      void _budget
      const rows = items.map(({ block, index }) => {
        const labelRef = textRef(index, 'label')
        const textRefKey = textRef(index, 'text')
        const term = styleFor(env.card, labelRef, env.style)
        const meaning = styleFor(env.card, textRefKey, env.style)
        const tPt = tenth(termPt(env.theme, pt) * relScale(env, term))
        const mPt = tenth(pt * relScale(env, meaning))
        const termFace = headingFace(env.theme, term)
        const textFace = bodyFace(env.theme, meaning)
        const termBold = term.bold ?? true
        const termH = boxHeight(block.label, termW, termFace, tPt, { bold: termBold, italic: term.italic, markBold: markBold(env.card, labelRef), scale: markScale(env.card, labelRef) }, env.measure)
        const textH = boxHeight(block.text, textW, textFace, mPt, { bold: meaning.bold, italic: meaning.italic, lineSpacing: env.theme.typography.lineHeight, markBold: markBold(env.card, textRefKey), scale: markScale(env.card, textRefKey) }, env.measure)
        return { block, index, term, meaning, termFace, textFace, termBold, tPt, mPt, rowH: Math.max(termH, textH) + 2 * ROW_PAD }
      })
      const heightIn = rows.reduce((sum, row) => sum + row.rowH, 0)
      return {
        heightIn,
        draw(target, x, y, opts) {
          const slide = turned(target, x, y, widthIn, opts?.h ?? heightIn, opts?.rotate)
          let top = y
          const rule = (at: number) =>
            slide.addShape('line', { x, y: at, w: widthIn, h: 0, line: { color: hex(env.inks.border), width: RULE_PT } })
          for (const row of rows) {
            rule(top)
            const inner = row.rowH - 2 * ROW_PAD
            addBox(
              slide,
              markedRuns(row.block.label, marksFor(env.card, textRef(row.index, 'label'))),
              { x, y: top + ROW_PAD, w: termW, h: inner },
              {
                fontFace: row.termFace,
                fontSize: row.tPt,
                color: hex(row.term.color ?? env.theme.colors.accent),
                bold: row.termBold,
                italic: row.term.italic,
                underline: row.term.underline,
                align: 'left',
                lineSpacing: spacingPt(row.tPt, DEFAULT_LINE_SPACING),
              },
            )
            addBox(
              slide,
              markedRuns(row.block.text, marksFor(env.card, textRef(row.index, 'text'))),
              { x: x + termW + COL_GAP, y: top + ROW_PAD, w: textW, h: inner },
              {
                fontFace: row.textFace,
                fontSize: row.mPt,
                color: hex(row.meaning.color ?? env.theme.colors.foreground),
                bold: row.meaning.bold,
                italic: row.meaning.italic,
                underline: row.meaning.underline,
                align: 'left',
                lineSpacing: spacingPt(row.mPt, env.theme.typography.lineHeight),
              },
            )
            top += row.rowH
          }
          if (closeBelow) rule(top)
        },
      }
    },
  }
}

/* --------------------------------------------------------------- callout --- */

/** The corner radius, in inches, of a theme's panels (its `radius` is in rem). */
function cornerIn(theme: ThemeTokens): number {
  return Math.min(0.3, theme.shape.radius * IN_PER_REM)
}

/**
 * The key idea: a rounded panel, its label in small letter-spaced type above the text at the lead
 * size. The slide's accent owner (the first callout) is filled with the accent and set in the accent's
 * own ink; any other callout sits on the tint with the foreground text and an accent-tinted label, so
 * a slide keeps one accent fill.
 */
export function calloutBlock(env: Env, index: number, block: CalloutBlock, owner: boolean, widthIn: number): Painter {
  const innerW = widthIn - 2 * PANEL_PAD
  return {
    layout(pt) {
      const labelRef = textRef(index, 'label')
      const textRefKey = textRef(index, 'text')
      const label = block.label ? styleFor(env.card, labelRef, env.style) : undefined
      const text = styleFor(env.card, textRefKey, env.style)
      const labelPt = smallPt(tenth(pt * relScale(env, label ?? env.style)), EYEBROW_RATIO)
      const textPt = stepPt(tenth(pt * relScale(env, text)), LEAD_RATIO)
      const labelFace = headingFace(env.theme, label ?? env.style)
      const textFace = bodyFace(env.theme, text)
      // The label is set in capitals here (`kickerText`), as the screen's small capitals do.
      const labelText = block.label ? kickerText(block.label) : ''
      const labelH = block.label
        ? boxHeight(labelText, innerW, labelFace, labelPt, { bold: true, markBold: markBold(env.card, labelRef), scale: markScale(env.card, labelRef) }, env.measure)
        : 0
      const textH = boxHeight(block.text, innerW, textFace, textPt, { bold: text.bold, italic: text.italic, lineSpacing: env.theme.typography.lineHeight, markBold: markBold(env.card, textRefKey), scale: markScale(env.card, textRefKey) }, env.measure)
      const heightIn = 2 * PANEL_PAD + labelH + textH
      // On the accent fill the colour picks are ignored (the ink is the accent's own), as on screen.
      const ink = owner ? env.inks.calloutInk : undefined
      return {
        heightIn,
        draw(target, x, y, opts) {
          // The panel keeps its own inks on a photo (the text on a photo is white, a panel's is not).
          const panelH = Math.max(heightIn, opts?.h ?? 0)
          const slide = turned(target.unwhitened ?? target, x, y, widthIn, panelH, opts?.rotate)
          slide.addShape('roundRect', {
            x,
            y,
            w: widthIn,
            h: panelH,
            rectRadius: cornerIn(env.theme),
            fill: { color: hex(owner ? env.inks.calloutFill : env.inks.quietFill) },
            line: { type: 'none' },
          })
          if (block.label && label) {
            addBox(slide, markedRuns(labelText, marksFor(env.card, labelRef)), { x: x + PANEL_PAD, y: y + PANEL_PAD, w: innerW, h: labelH }, {
              fontFace: labelFace,
              fontSize: labelPt,
              color: hex(ink ?? label.color ?? env.inks.smallAccent),
              bold: true,
              italic: label.italic,
              underline: label.underline,
              charSpacing: 1.5,
              align: label.align ?? 'left',
              lineSpacing: spacingPt(labelPt, DEFAULT_LINE_SPACING),
            })
          }
          addBox(slide, markedRuns(block.text, marksFor(env.card, textRefKey)), { x: x + PANEL_PAD, y: y + PANEL_PAD + labelH, w: innerW, h: textH }, {
            fontFace: textFace,
            fontSize: textPt,
            color: hex(ink ?? text.color ?? env.theme.colors.foreground),
            bold: text.bold,
            italic: text.italic,
            underline: text.underline,
            align: text.align ?? 'left',
            lineSpacing: spacingPt(textPt, env.theme.typography.lineHeight),
          })
        },
      }
    },
  }
}

/* ------------------------------------------------------------------ code --- */

/** `line` cut to fit `widthIn` (the same measure and headroom the fitter wraps by), ending in an ellipsis when cut. */
function clipLine(line: string, widthIn: number, pt: number, measure: TextMeasurer): string {
  const font = { face: CODE_FACE, sizePt: pt, bold: false, italic: false }
  const usable = widthIn - INSET_X_IN
  const fits = (text: string) => measure(text, font) * WIDTH_HEADROOM <= usable
  if (fits(line)) return line
  const chars = Array.from(line)
  let kept = chars.length
  while (kept > 0 && !fits(`${chars.slice(0, kept).join('')}…`)) kept -= 1
  return `${chars.slice(0, kept).join('')}…`
}

/**
 * Source text in a monospace panel: the deep ground on a plain or tint slide, a light panel on a deep
 * one (`Inks.code`), the label above and the caption below in the panel's muted ink. The code is one
 * plain run (no marks, no font pick: always `CODE_FACE`) and never wraps, as on screen: a line wider
 * than the panel is cut with an ellipsis. Its size follows the body, never below the caption step of
 * the slide's own body size; when it still does not fit the room it is given, lines are cut from the
 * end (an ellipsis line marks the cut) rather than shrunk past that, so a long listing never takes
 * the slide.
 */
export function codeBlock(env: Env, index: number, block: CodeBlock, widthIn: number): Painter {
  const innerW = widthIn - 2 * PANEL_PAD
  const minPt = stepPt(env.bodyPt, CAPTION_RATIO)
  return {
    layout(pt, budgetIn) {
      const labelRef = textRef(index, 'label')
      const captionRef = textRef(index, 'caption')
      const codeRel = relScale(env, styleFor(env.card, textRef(index, 'code'), env.style))
      const labelRel = relScale(env, styleFor(env.card, labelRef, env.style))
      const captionRel = relScale(env, styleFor(env.card, captionRef, env.style))
      // A size pick moves the code with the body; the floor is the caption step of the size it asked for.
      const codePt = Math.max(Math.round(minPt * codeRel), stepPt(tenth(pt * codeRel), CODE_RATIO))
      const labelPt = Math.max(Math.round(minPt * labelRel), stepPt(tenth(pt * labelRel), CODE_RATIO))
      const captionPt = Math.max(Math.round(minPt * captionRel), stepPt(tenth(pt * captionRel), CODE_RATIO))
      const labelH = block.label
        ? boxHeight(block.label, innerW, bodyFace(env.theme, env.style), labelPt, { markBold: markBold(env.card, labelRef), scale: markScale(env.card, labelRef) }, env.measure)
        : 0
      const captionH = block.caption
        ? boxHeight(block.caption, innerW, bodyFace(env.theme, env.style), captionPt, { markBold: markBold(env.card, captionRef), scale: markScale(env.card, captionRef) }, env.measure)
        : 0
      const all = block.code.replace(/\t/g, '    ').split('\n').map((line) => clipLine(line, innerW, codePt, env.measure))
      const codeHeight = (n: number) =>
        textHeight(all.slice(0, n).map((text) => ({ text })), innerW, { preferredPt: codePt, minPt: codePt, face: CODE_FACE, lineSpacing: CODE_LINE_SPACING }, codePt, env.measure)
      const fixed = 2 * PANEL_PAD + labelH + captionH

      let lines = all
      if (fixed + codeHeight(all.length) > budgetIn && all.length > 2) {
        // Keep as many real lines as fit beside a marker line, and at least one.
        let keep = all.length - 1
        while (keep > 1 && fixed + codeHeight(keep + 1) > budgetIn) keep -= 1
        lines = [...all.slice(0, keep), '…']
      }
      const codeH = textHeight(lines.map((text) => ({ text })), innerW, { preferredPt: codePt, minPt: codePt, face: CODE_FACE, lineSpacing: CODE_LINE_SPACING }, codePt, env.measure)
      const heightIn = fixed + codeH
      const stripColor = (runs: PptxTextRun[]): PptxTextRun[] =>
        // The panel's ink wins over a colour mark, as on screen.
        runs.map((run) => {
          const { color: _color, ...options } = run.options
          void _color
          return { text: run.text, options }
        })
      return {
        heightIn,
        draw(target, x, y, opts) {
          // The panel keeps its own inks on a photo (the text on a photo is white, a panel's is not).
          const panelH = Math.max(heightIn, opts?.h ?? 0)
          const slide = turned(target.unwhitened ?? target, x, y, widthIn, panelH, opts?.rotate)
          slide.addShape('roundRect', {
            x,
            y,
            w: widthIn,
            h: panelH,
            rectRadius: cornerIn(env.theme),
            fill: { color: hex(env.inks.code.fill) },
            line: { type: 'none' },
          })
          let top = y + PANEL_PAD
          if (block.label) {
            addBox(slide, stripColor(markedRuns(block.label, marksFor(env.card, labelRef))), { x: x + PANEL_PAD, y: top, w: innerW, h: labelH }, {
              fontFace: bodyFace(env.theme, env.style),
              fontSize: labelPt,
              color: hex(env.inks.code.muted),
              align: 'left',
              lineSpacing: spacingPt(labelPt, DEFAULT_LINE_SPACING),
            })
            top += labelH
          }
          // One run per line: the code is plain text, so no marks and no run-level colour.
          const runs: PptxTextRun[] = lines.map((line, i) => ({ text: line, options: i < lines.length - 1 ? { breakLine: true } : {} }))
          addBox(slide, runs, { x: x + PANEL_PAD, y: top, w: innerW, h: codeH }, {
            fontFace: CODE_FACE,
            fontSize: codePt,
            color: hex(env.inks.code.ink),
            align: 'left',
            wrap: false,
            lineSpacing: spacingPt(codePt, CODE_LINE_SPACING),
          })
          top += codeH
          if (block.caption) {
            addBox(slide, stripColor(markedRuns(block.caption, marksFor(env.card, captionRef))), { x: x + PANEL_PAD, y: top, w: innerW, h: captionH }, {
              fontFace: bodyFace(env.theme, env.style),
              fontSize: captionPt,
              color: hex(env.inks.code.muted),
              align: 'left',
              lineSpacing: spacingPt(captionPt, DEFAULT_LINE_SPACING),
            })
          }
        },
      }
    },
  }
}

/* ------------------------------------------------------------------ stack --- */

/**
 * The painters for a card's blocks in author order: consecutive points as one run, each callout and
 * code block on its own, and the first callout as the slide's one accent fill. A stretch of other
 * blocks is handed to `plain(from, to)`, which may return a painter for it (the body arrangement's
 * text) or `null` to leave it out (the foot strip, which carries only the structured blocks).
 */
export function structuredPainters(
  env: Env,
  widthIn: number,
  plain: (from: number, to: number) => Painter | null = () => null,
): Painter[] {
  const out: Painter[] = []
  const blocks = env.card.blocks
  const owner = blocks.findIndex((block) => block.type === 'callout')
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]
    if (block.type === 'point') {
      const items: { block: PointBlock; index: number }[] = []
      let j = i
      while (j < blocks.length && blocks[j].type === 'point') {
        items.push({ block: blocks[j] as PointBlock, index: j })
        j++
      }
      out.push(pointRun(env, items, widthIn, true))
      i = j
    } else if (block.type === 'callout') {
      out.push(calloutBlock(env, i, block, i === owner, widthIn))
      i++
    } else if (block.type === 'code') {
      out.push(codeBlock(env, i, block, widthIn))
      i++
    } else {
      let j = i
      while (j < blocks.length && !isStructured(blocks[j])) j++
      const painter = plain(i, j)
      if (painter) out.push(painter)
      i = j
    }
  }
  return out
}

/**
 * Stacks painters top to bottom in `areaIn` of height: the largest body size from `maxPt` down to
 * `FLOOR_PT` at which they all fit, else the floor with code cut to the room left. The last layout of the
 * floor pass is returned even when something still overflows, because words are never dropped to fit
 * (the one exception is the code panel's cut lines).
 */
export function fitStack(painters: Painter[], areaIn: number, maxPt: number): { pt: number; layouts: BlockLayout[]; heightIn: number } {
  const gaps = Math.max(0, painters.length - 1) * BLOCK_GAP
  const floor = Math.min(FLOOR_PT, maxPt)
  const total = (layouts: BlockLayout[]) => layouts.reduce((sum, l) => sum + l.heightIn, 0) + gaps

  for (const pt of sizesFrom(maxPt, floor)) {
    const layouts = painters.map((p) => p.layout(pt, Infinity))
    if (total(layouts) <= areaIn) return { pt, layouts, heightIn: total(layouts) }
  }
  // Over even at the floor: give each painter in turn the room the others leave it.
  const layouts = painters.map((p) => p.layout(floor, Infinity))
  painters.forEach((painter, i) => {
    const others = layouts.reduce((sum, l, k) => (k === i ? sum : sum + l.heightIn), 0) + gaps
    layouts[i] = painter.layout(floor, Math.max(0, areaIn - others))
  })
  return { pt: floor, layouts, heightIn: total(layouts) }
}

/** The measured stack drawn from `(x, y)` downward. */
export function drawStack(slide: PptxSlide, layouts: BlockLayout[], x: number, y: number): void {
  let top = y
  for (const layout of layouts) {
    layout.draw(slide, x, top)
    top += layout.heightIn + BLOCK_GAP
  }
}

/** A strip of structured blocks to draw at the foot of an arrangement that has no place of its own for them. */
export interface ExtrasPlan {
  heightIn: number
  draw(slide: PptxSlide, x: number, bottomIn: number): void
}

/** The structured blocks of a card as one strip, fitted into at most `maxHeightIn`; `null` when it holds none. */
export function planExtras(env: Env, widthIn: number, maxHeightIn: number): ExtrasPlan | null {
  if (!hasStructured(env.card)) return null
  const { layouts, heightIn } = fitStack(structuredPainters(env, widthIn), maxHeightIn, env.bodyPt)
  return {
    heightIn,
    draw(slide, x, bottomIn) {
      drawStack(slide, layouts, x, bottomIn - heightIn)
    },
  }
}

/**
 * One block in a box a user sized on a nudged card: the largest size from `maxPt` down to `minPt`
 * whose block fits the box's height, else the smallest with code cut to the box. Draws at the box's
 * corner and stretches a panel to the box's height.
 */
export function drawInBox(slide: PptxSlide, painter: Painter, box: Box & { rotate?: number }, maxPt: number, minPt: number): void {
  const floor = Math.min(minPt, maxPt)
  const opts = { h: box.h, rotate: box.rotate }
  for (const pt of sizesFrom(maxPt, floor)) {
    const layout = painter.layout(pt, Infinity)
    if (layout.heightIn <= box.h) return layout.draw(slide, box.x, box.y, opts)
  }
  painter.layout(floor, box.h).draw(slide, box.x, box.y, opts)
}
