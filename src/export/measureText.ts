import type { FontSpec, TextMeasurer } from './textFit'
import { estimateMeasurer } from './textFit'

/*
  The one file in src/export allowed to touch `document` and canvas — every
  other module in this directory stays React- and DOM-free (see CLAUDE.md's
  PPTX export section and this work's global constraints) so it can be driven
  by a fake measurer in tests. This module is the real thing: a single reused
  offscreen canvas, measured with the browser's own font metrics.

  Vitest runs this repo's tests in node, where `document` does not exist, so
  the fallback branch below is what `measureText.test.ts` actually exercises.
*/

/** The canvas font string for a given spec — see the design doc's "4. Plumbing". */
function cssFont(font: FontSpec): string {
  const weight = font.bold ? 700 : 400
  return `${font.italic ? 'italic ' : ''}${weight} ${font.sizePt}pt "${font.face}", Arial, sans-serif`
}

/**
 * Awaits `document.fonts.ready`, then returns a `TextMeasurer` backed by one
 * reused offscreen canvas's 2D context. Falls back to `estimateMeasurer` when
 * there is no `document` or no 2D context — the only two ways this can run
 * outside a browser (or in a browser that refuses to hand back a context).
 */
export async function createCanvasMeasurer(): Promise<TextMeasurer> {
  if (typeof document === 'undefined') return estimateMeasurer

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return estimateMeasurer

  try {
    await document.fonts.ready
  } catch {
    // A failure here still leaves a usable canvas measurer — whatever fonts
    // did load are what the substitute-font risk in the design doc already
    // accounts for.
  }

  const cache = new Map<string, number>()

  return (text, font) => {
    // Pipe-joined rather than a null-character separator: a literal NUL byte
    // in this source file made `git diff` classify it as binary and hide the
    // diff from review. Any printable, unambiguous separator does the job.
    const key = `${cssFont(font)}|${text}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    ctx.font = cssFont(font)
    const widthIn = ctx.measureText(text).width / 96
    cache.set(key, widthIn)
    return widthIn
  }
}
