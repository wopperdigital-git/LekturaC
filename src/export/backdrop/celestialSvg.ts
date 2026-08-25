import type { ThemeTokens } from '@/lib/theme-tokens'
import { starPositions } from '@/lib/celestial'
import { bodyGradientSvg, glowGradientSvg, parseBodyGradient, parseGlow } from './glow'

/*
  The deck theme's celestial backdrop, as one self-contained SVG sized for a
  PowerPoint slide.

  Layer order is copied from `components/theme/SlideBackdrop.tsx` — glow, grid,
  orbits, bodies, stars, constellation — so the two can be compared by eye. Both
  read the same `CelestialDecor` object, which is what keeps them from drifting;
  the star field goes further and shares the generator outright
  (`starPositions`).

  Self-contained is load-bearing, not incidental: no external references, no
  `foreignObject`, no webfonts. That is what lets `rasterize.ts` draw this to a
  canvas without tainting it, and it is the whole reason the export builds its
  own SVG instead of screenshotting the live component.
*/

export const BACKDROP_WIDTH = 1920
export const BACKDROP_HEIGHT = 1080

/*
  The themes express stroke widths, star radii, blur and grid pitch in px
  against a card as it renders on screen — roughly 960px wide. This canvas is
  1920, so those quantities are doubled to keep their apparent size. Without
  this the stars would export at half the size they look in the editor.
*/
const PX_SCALE = 2

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A percentage of the canvas width, in user units. */
function px(percent: number): number {
  return Number(((percent / 100) * BACKDROP_WIDTH).toFixed(2))
}

/** A percentage of the canvas height, in user units. */
function py(percent: number): number {
  return Number(((percent / 100) * BACKDROP_HEIGHT).toFixed(2))
}

function glowSvg(theme: ThemeTokens): { defs: string; rects: string } {
  const layers = parseGlow(theme.celestial.glow)
  const defs = layers.map((layer, i) => glowGradientSvg(layer, `glow${i}`)).join('')
  // CSS paints the FIRST `background-image` layer closest to the viewer; SVG
  // paints the LAST element in the document on top. `layers` is in CSS paint
  // order (outermost/first-declared first), so the rects have to be emitted
  // back to front — reversed — for `layers[0]` to end up on top here too,
  // matching what `SlideBackdrop` shows on screen. Do not "tidy" this back to
  // array order; that silently changes every overlap's blended colour.
  const rects = layers
    .map((_, i) => i)
    .reverse()
    .map((i) => `<rect width="100%" height="100%" fill="url(#glow${i})"/>`)
    .join('')
  return { defs, rects }
}

function gridSvg(theme: ThemeTokens): string {
  const grid = theme.celestial.grid
  if (!grid) return ''
  const pitch = grid.sizePx * PX_SCALE
  // A non-positive pitch (a theme declaring `grid.sizePx` as 0 or negative)
  // would make the loops below never advance past `WIDTH`/`HEIGHT` — an
  // infinite loop that freezes the tab, which `pptx.ts`'s try/catch cannot
  // rescue because a tight synchronous loop never yields.
  if (pitch <= 0) return ''
  const lines: string[] = []
  // The on-screen CSS grid tiles from `background-position: 0 0`, so it draws
  // a line at the top and left edge too — start both loops at 0, not `pitch`.
  for (let x = 0; x < BACKDROP_WIDTH; x += pitch) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${BACKDROP_HEIGHT}"/>`)
  }
  for (let y = 0; y < BACKDROP_HEIGHT; y += pitch) {
    lines.push(`<line x1="0" y1="${y}" x2="${BACKDROP_WIDTH}" y2="${y}"/>`)
  }
  return (
    `<g class="grid" stroke="${esc(grid.color)}" stroke-width="${PX_SCALE}" ` +
    `opacity="${grid.opacity}">${lines.join('')}</g>`
  )
}

function orbitsSvg(theme: ThemeTokens): string {
  const orbits = theme.celestial.orbits
  if (!orbits?.length) return ''
  return orbits
    .map((orbit) => {
      // `size` is a width percentage and the on-screen ring is forced circular
      // by `aspect-ratio: 1`, so the radius comes off the width on both axes.
      const r = px(orbit.size) / 2
      const width = (orbit.widthPx ?? 1) * PX_SCALE
      const dash = orbit.dashed ? ` stroke-dasharray="${width * 4},${width * 4}"` : ''
      return (
        `<circle class="orbit" cx="${px(orbit.cx)}" cy="${py(orbit.cy)}" r="${r}" fill="none" ` +
        `stroke="${esc(orbit.color)}" stroke-width="${width}" opacity="${orbit.opacity}"${dash}/>`
      )
    })
    .join('')
}

/**
 * When a body's `fill` isn't the standard `radial-gradient(circle at X% Y%,
 * ...)` shape, try to recover a plain colour rather than leave the shape
 * unpainted. `parseBodyGradient` already reads every built-in theme's body
 * fill, so this only needs to catch a fill authored as a bare colour — it
 * does not attempt to dig a first stop out of an otherwise-malformed
 * gradient string. Decoration must never fail the export: this returns
 * `null` rather than guessing further, and the caller falls back to
 * `fill="none"` — SVG's initial value for `fill` is black, so an unpainted
 * shape needs `none` written explicitly, not the attribute left off.
 */
function fallbackBodyColor(fill: string): string | null {
  const trimmed = fill.trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(trimmed)) return trimmed
  return null
}

function bodiesSvg(theme: ThemeTokens): { defs: string; shapes: string } {
  const bodies = theme.celestial.bodies
  if (!bodies?.length) return { defs: '', shapes: '' }

  const defs: string[] = []
  const shapes = bodies
    .map((body, i) => {
      const r = px(body.size) / 2

      // SVG's `fill` attribute accepts a colour or a `url(#id)` paint-server
      // reference, never a CSS gradient function — `body.fill` is a
      // `radial-gradient(...)` in every built-in theme that declares bodies
      // (the lit-limb shading is the point: Moonlight's moon, Deep Space's
      // nebula core, Aurora's planet limb), so it has to become a real
      // `<radialGradient>` def rather than being written into the attribute
      // as-is, which would paint as invalid — i.e. black.
      const gradient = parseBodyGradient(body.fill)
      let fill: string
      if (gradient) {
        const id = `bodyfill${i}`
        defs.push(bodyGradientSvg(gradient, id))
        fill = `url(#${id})`
      } else {
        // No usable fill: emit `fill="none"` explicitly. SVG's initial value
        // for `fill` is black, so leaving the attribute off does not mean
        // "invisible" — it paints a solid black disc at the body's opacity.
        fill = fallbackBodyColor(body.fill) ?? 'none'
      }
      const fillAttr = ` fill="${esc(fill)}"`

      let filter = ''
      if (body.blurPx) {
        // `filterUnits="userSpaceOnUse"` with an explicit region: the default
        // bounding-box region clips a large blur back to 110% of the circle and
        // visibly crops the halo.
        const id = `blur${i}`
        const pad = body.blurPx * PX_SCALE * 3
        defs.push(
          `<filter id="${id}" filterUnits="userSpaceOnUse" ` +
            `x="${px(body.cx) - r - pad}" y="${py(body.cy) - r - pad}" ` +
            `width="${(r + pad) * 2}" height="${(r + pad) * 2}">` +
            `<feGaussianBlur stdDeviation="${body.blurPx * PX_SCALE}"/></filter>`,
        )
        filter = ` filter="url(#${id})"`
      }
      return (
        `<circle class="body" cx="${px(body.cx)}" cy="${py(body.cy)}" r="${r}"` +
        `${fillAttr} opacity="${body.opacity}"${filter}/>`
      )
    })
    .join('')

  return { defs: defs.join(''), shapes }
}

function starsSvg(theme: ThemeTokens): string {
  const field = theme.celestial.stars
  if (!field) return ''
  // Seeded on the theme id, exactly as the on-screen field is, so the exported
  // sky is the same sky.
  const stars = starPositions(theme.id, field)
  const circles = stars
    .map(
      (star) =>
        `<circle class="star" cx="${px(star.x)}" cy="${py(star.y)}" ` +
        `r="${(star.radius * PX_SCALE).toFixed(2)}" opacity="${star.alpha.toFixed(3)}"/>`,
    )
    .join('')
  return `<g fill="${esc(field.color)}">${circles}</g>`
}

function constellationSvg(theme: ThemeTokens): string {
  const constellation = theme.celestial.constellation
  if (!constellation) return ''

  const width = (constellation.widthPx ?? 1) * PX_SCALE
  const lines = constellation.paths
    .map((path) => {
      const points = path.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')
      return `<polyline points="${points}"/>`
    })
    .join('')

  // On screen these dots are separate divs, because a circle inside a
  // `preserveAspectRatio="none"` viewBox would render as an ellipse. This
  // canvas has a fixed ratio and no such distortion, so they are ordinary
  // circles in the same SVG.
  const dots = constellation.paths
    .flatMap((path) => path)
    .map(([x, y]) => `<circle cx="${px(x)}" cy="${py(y)}" r="${1.5 * PX_SCALE}"/>`)
    .join('')

  return (
    `<g class="constellation" opacity="${constellation.opacity}">` +
    `<g fill="none" stroke="${esc(constellation.color)}" stroke-width="${width}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${lines}</g>` +
    `<g fill="${esc(constellation.color)}">${dots}</g>` +
    `</g>`
  )
}

/** The theme's backdrop as one self-contained SVG document string. */
export function celestialSvg(theme: ThemeTokens): string {
  const glow = glowSvg(theme)
  const bodies = bodiesSvg(theme)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BACKDROP_WIDTH}" height="${BACKDROP_HEIGHT}" ` +
    `viewBox="0 0 ${BACKDROP_WIDTH} ${BACKDROP_HEIGHT}">` +
    `<defs>${glow.defs}${bodies.defs}</defs>` +
    `<rect width="100%" height="100%" fill="${esc(theme.colors.background)}"/>` +
    glow.rects +
    gridSvg(theme) +
    orbitsSvg(theme) +
    bodies.shapes +
    starsSvg(theme) +
    constellationSvg(theme) +
    `</svg>`
  )
}
