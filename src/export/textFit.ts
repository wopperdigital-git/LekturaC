import { pointSize } from './textRun'

/*
  The pure fitting core for the .pptx export. See
  docs/superpowers/specs/2026-09-19-pptx-fit-design.md for the "why": Canva,
  Google Slides and Keynote draw the stored box size and text size as written
  — only PowerPoint recalculates `fit: 'shrink'` on open — so the export has
  to work out sizes and box heights itself rather than lean on that autofit.

  This module stays React- and DOM-free (see CLAUDE.md's PPTX export section
  and the global constraints for this work): it takes a `TextMeasurer` as a
  parameter rather than reaching for `canvas.measureText` itself, so it can be
  driven by a real browser measurer in `measureText.ts` and by a deterministic
  fake in tests.
*/

/** The style a piece of text is measured in. */
export interface FontSpec {
  face: string
  sizePt: number
  bold: boolean
  italic: boolean
}

/** Width of `text` set in `font`, in inches. */
export type TextMeasurer = (text: string, font: FontSpec) => number

/**
 * Measured widths and heights are inflated by these before being checked
 * against a box, to cover a wider substitute font (the app never loads its
 * theme fonts as web fonts — see the design doc) and each app's own line-
 * metric differences. Applied to width during wrapping and to the total
 * height once, not per line.
 */
export const WIDTH_HEADROOM = 1.1
export const HEIGHT_HEADROOM = 1.1

/** The absolute floor `fitText` will not shrink text below, even over budget. */
export const FLOOR_PT = 10

/** The "single" line height PowerPoint and Canva use when none is specified. */
export const DEFAULT_LINE_SPACING = 1.2

/**
 * `lineSpacing` in points for a run set at `sizePt` with a `spacing`
 * multiple (the theme's `typography.lineHeight` where a box uses it, else
 * `DEFAULT_LINE_SPACING`).
 *
 * pptxgenjs's `lineSpacingMultiple` option emits `<a:spcPct>`, which PowerPoint
 * defines as a percentage of *single* spacing — roughly 1.2x the font size for
 * most faces, not 1.0x — so passing the model's own `spacing` value through it
 * under-counts the actual line pitch by about 20%. `lineSpacing` (exact points,
 * `<a:spcPts>`) has no such ambiguity: every app draws exactly the pitch this
 * fit assumed. One helper so every text box derives it the same way.
 */
export function spacingPt(sizePt: number, spacing: number): number {
  return sizePt * spacing
}

/**
 * Bullet hanging indent, in inches, matching what pptxgenjs actually draws for
 * `indentLevel: 0` (`marL` = `DEF_BULLET_MARGIN` = 27pt, verified against
 * `pptxgen.es.js`). Each deeper level adds another `BULLET_INDENT_IN`.
 */
export const BULLET_INDENT_IN = 27 / 72

/**
 * pptxgenjs text box margin, in points, applied to every side.
 *
 * A scalar rather than the `[top, right, bottom, left]` array the d.ts
 * suggests: pptxgenjs actually applies an array `margin` as
 * `[left, right, bottom, top]` (verified against `pptxgen.es.js`), which is
 * not what the typings claim and not an order worth relying on. A scalar sets
 * all four sides identically regardless of which order the library reads them
 * in, so the fit maths and every app agree on the usable width and height
 * without depending on that quirk.
 */
export const TEXT_MARGIN_PT = 5.4

/** Total horizontal inset (left + right margin), in inches. */
export const INSET_X_IN = (2 * TEXT_MARGIN_PT) / 72
/** Total vertical inset (top + bottom margin), in inches. */
export const INSET_Y_IN = (2 * TEXT_MARGIN_PT) / 72

/** What kind of text a size is being picked for — indexes the ladder below. */
export type SizeRole = 'title' | 'heading' | 'subheading' | 'body' | 'statSingle' | 'statGrid'

/**
 * Caps and minimums per role, in points. A theme's own rem scale decides the
 * ratio between roles; this ladder only keeps the result inside a band that
 * still fits a slide and stays legible — see the design doc's table.
 *
 * Density brief (2026-09-19, measured against a real Gamma PPTX export):
 * `body`/`subheading` were cut and `title` was dropped to the same cap as
 * `heading` — a title slide is now distinguished by `renderTitle`'s bold
 * weight and centred group layout, not by a larger size, matching how Gamma's
 * own title slide reuses its regular heading size.
 */
export const SIZE_LADDER: Record<SizeRole, { cap: number; min: number }> = {
  title: { cap: 30, min: 24 },
  heading: { cap: 30, min: 20 },
  subheading: { cap: 18, min: 14 },
  body: { cap: 14, min: 10 },
  statSingle: { cap: 54, min: 28 },
  statGrid: { cap: 40, min: 24 },
}

/**
 * The size a role starts fitting from: the theme's own size (via `pointSize`,
 * imported from `./textRun`), clamped into the role's `[min, cap]` band. A
 * theme's `fontScale` can push a size below its role's floor (e.g. a small
 * scaled body), so the minimum is enforced after the cap rather than assumed.
 */
export function preferredSize(role: SizeRole, rem: number, fontScale: number | undefined): number {
  const { cap, min } = SIZE_LADDER[role]
  return Math.max(min, Math.min(cap, pointSize(rem, fontScale)))
}

/**
 * A DOM-free fallback measurer: average glyph width per em, in inches,
 * widened for bold and for the wider glyphs of uppercase letters and digits.
 * Used when no canvas is available (`measureText.ts`) and as the tests' fake
 * in `slideRenderers.test.ts`'s fit harness.
 */
function emFactor(ch: string, bold: boolean): number {
  const isWide = (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')
  if (isWide) return bold ? 0.7 : 0.65
  return bold ? 0.6 : 0.55
}

export const estimateMeasurer: TextMeasurer = (text, font) => {
  let ems = 0
  for (const ch of text) {
    ems += emFactor(ch, font.bold)
  }
  return (ems * font.sizePt) / 72
}

/** One paragraph to fit — a heading, a bullet item, a stat label, and so on. */
export interface FitParagraph {
  text: string
  /** Overrides `sizing.bold` for measuring this paragraph only. */
  bold?: boolean
  /** Narrows this paragraph's usable width, e.g. a bullet's hanging indent. */
  indentIn?: number
  /**
   * The largest size multiple any run in this paragraph is set at (a word
   * enlarged by the user). The whole paragraph is measured at that size — wider
   * than it really is, which can only over-estimate the height and never leave
   * text spilling out of its box. Conservative in the same way, and for the same
   * reason, as the bold override above.
   */
  scale?: number
}

/** The size band and font a run of paragraphs is fit within. */
export interface FitSizing {
  preferredPt: number
  minPt: number
  face: string
  bold?: boolean
  italic?: boolean
  lineSpacing?: number
}

function fitsWidth(text: string, widthIn: number, font: FontSpec, measure: TextMeasurer): boolean {
  return measure(text, font) * WIDTH_HEADROOM <= widthIn
}

/** Breaks a single word into line-sized chunks by character, never dropping any. */
function breakByChars(
  word: string,
  widthIn: number,
  font: FontSpec,
  measure: TextMeasurer,
): string[] {
  const lines: string[] = []
  let current = ''
  for (const ch of word) {
    const candidate = current + ch
    if (current === '' || fitsWidth(candidate, widthIn, font, measure)) {
      current = candidate
    } else {
      lines.push(current)
      current = ch
    }
  }
  if (current !== '') lines.push(current)
  return lines.length === 0 ? [''] : lines
}

/** Greedy word wrap of one paragraph (no embedded `\n`). */
function wrapParagraph(
  text: string,
  widthIn: number,
  font: FontSpec,
  measure: TextMeasurer,
): string[] {
  if (text === '') return ['']

  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`
    if (fitsWidth(candidate, widthIn, font, measure)) {
      current = candidate
      continue
    }
    if (current !== '') {
      lines.push(current)
      current = ''
    }
    if (fitsWidth(word, widthIn, font, measure)) {
      current = word
    } else {
      const broken = breakByChars(word, widthIn, font, measure)
      lines.push(...broken.slice(0, -1))
      current = broken[broken.length - 1]
    }
  }

  if (current !== '' || lines.length === 0) {
    lines.push(current)
  }
  return lines
}

/**
 * Lines `text` wraps to at `widthIn`. Explicit `'\n'` is honoured as a hard
 * break; within each line, wrapping is greedy at word boundaries, and a word
 * that alone exceeds the line is broken by characters — words are never
 * dropped. `WIDTH_HEADROOM` is applied to every width check.
 */
export function wrapLines(
  text: string,
  widthIn: number,
  font: FontSpec,
  measure: TextMeasurer,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    lines.push(...wrapParagraph(paragraph, widthIn, font, measure))
  }
  return lines
}

/**
 * Height in inches the paragraphs need at `sizePt` inside a box of
 * `boxWidthIn`. Sum of each paragraph's wrapped line count × `sizePt` ×
 * `lineSpacing` / 72, then `HEIGHT_HEADROOM`, then the box's own vertical
 * inset. An empty paragraph list still needs the inset; an empty-string
 * paragraph still counts as one line (see `wrapLines`).
 */
export function textHeight(
  paragraphs: FitParagraph[],
  boxWidthIn: number,
  sizing: FitSizing,
  sizePt: number,
  measure: TextMeasurer,
): number {
  if (paragraphs.length === 0) return INSET_Y_IN

  const lineSpacing = sizing.lineSpacing ?? DEFAULT_LINE_SPACING

  let heightPt = 0

  for (const paragraph of paragraphs) {
    const usableWidth = boxWidthIn - INSET_X_IN - (paragraph.indentIn ?? 0)
    const paragraphPt = sizePt * Math.max(1, paragraph.scale ?? 1)
    const font: FontSpec = {
      face: sizing.face,
      sizePt: paragraphPt,
      bold: paragraph.bold ?? sizing.bold ?? false,
      italic: sizing.italic ?? false,
    }
    // Each paragraph's lines are as tall as its own size: a line holding one big
    // word is as tall as that word.
    heightPt += wrapLines(paragraph.text, usableWidth, font, measure).length * paragraphPt * lineSpacing
  }

  return (heightPt / 72) * HEIGHT_HEADROOM + INSET_Y_IN
}

/**
 * The largest size from `sizing.preferredPt` down (1pt steps) whose
 * `textHeight` fits `box.maxHeightIn`. `sizing.minPt` is not a hard stop —
 * the descent continues below it down to `floor` if nothing fit yet, and
 * `floor` itself is never crossed: if even that overflows, it is returned
 * anyway with its real, over-budget height, because words are never dropped
 * to make a size fit.
 *
 * `floor` is `Math.min(FLOOR_PT, sizing.preferredPt)`, not `FLOOR_PT` alone —
 * a caller that asked for something smaller than `FLOOR_PT` (a box-proportional
 * adjusted-card size, say 7pt) must get that size back unchanged when it
 * already fits, and its own real height when it doesn't, never `FLOOR_PT`
 * pushed back up past what was asked for. Text is never enlarged past
 * `preferredPt` and never shrunk past this floor.
 */
export function fitText(
  paragraphs: FitParagraph[],
  box: { widthIn: number; maxHeightIn: number },
  sizing: FitSizing,
  measure: TextMeasurer,
): { sizePt: number; heightIn: number } {
  const floor = Math.min(FLOOR_PT, sizing.preferredPt)

  for (let size = sizing.preferredPt; size > floor; size--) {
    const heightIn = textHeight(paragraphs, box.widthIn, sizing, size, measure)
    if (heightIn <= box.maxHeightIn) {
      return { sizePt: size, heightIn }
    }
  }

  return { sizePt: floor, heightIn: textHeight(paragraphs, box.widthIn, sizing, floor, measure) }
}
