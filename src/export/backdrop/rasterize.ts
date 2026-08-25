import type { ThemeTokens } from '@/lib/theme-tokens'
import { BACKDROP_HEIGHT, BACKDROP_WIDTH, celestialSvg } from './celestialSvg'

/*
  SVG string to PNG data URL, through an <img> and a <canvas>.

  This is the only file in `src/export/` that touches the DOM, and it is
  deliberately the whole of it: everything upstream is a pure string builder,
  so the fragile part is one function with one job.

  The SVG produced by `celestialSvg` is fully self-contained — no external
  references, no `foreignObject`, no webfonts — which is what guarantees the
  canvas is never tainted and `toDataURL` cannot throw a security error. That
  guarantee is the reason the export builds its own SVG rather than
  screenshotting the live `SlideBackdrop`.
*/
/**
 * An `<img>` that never fires `onload` or `onerror` would otherwise leave
 * this promise pending forever — the export spinner running with no way out.
 */
const RASTERIZE_TIMEOUT_MS = 15000

export function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // Guards against the timeout firing after `onload`/`onerror` already
    // settled the promise (or the reverse), since a settled promise can only
    // resolve/reject once but nothing stops both paths from firing.
    let settled = false

    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('Timed out rendering the backdrop SVG'))
    }, RASTERIZE_TIMEOUT_MS)

    image.onload = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get a 2D canvas context to render the backdrop'))
        return
      }
      ctx.drawImage(image, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
    }

    image.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      reject(new Error('The backdrop SVG could not be rendered'))
    }

    // A data URL rather than a blob URL: nothing to revoke, and no window in
    // which the object URL could be collected before `onload` fires.
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** The theme's backdrop as a PNG data URL, sized for a 16:9 PowerPoint slide. */
export function backdropPng(theme: ThemeTokens): Promise<string> {
  return svgToPngDataUrl(celestialSvg(theme), BACKDROP_WIDTH, BACKDROP_HEIGHT)
}
