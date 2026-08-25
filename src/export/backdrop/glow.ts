/*
  `celestial.glow` is an opaque CSS string authored per theme, and the export
  needs it as SVG. Rather than approximate it, this parses it: all seventeen
  gradient layers across the five built-in themes share one grammar —

    radial-gradient(W% H% at X% Y%, rgba(r,g,b,a) P%, rgba(r,g,b,0) Q%)

  which is narrow enough to read exactly. `glow.test.ts` asserts every built-in
  theme parses, which is also what catches a future glow authored in a shape
  this cannot read.

  Nothing here throws. A layer that does not parse is dropped, because a
  slightly plainer background is a far better outcome than a failed export.
*/

export interface GlowStop {
  r: number
  g: number
  b: number
  a: number
  /** Percentage along the gradient, 0-100. */
  offset: number
}

export interface GlowLayer {
  /** Horizontal radius, as a percentage of the box width. */
  rx: number
  /** Vertical radius, as a percentage of the box height. */
  ry: number
  /** Centre, as percentages. May be negative or above 100 — several themes anchor a glow off-canvas on purpose. */
  cx: number
  cy: number
  from: GlowStop
  to: GlowStop
}

const LAYER_RE =
  /^radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s*,\s*(.+)\)$/
const STOP_RE = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)\s+([\d.]+)%$/

/**
 * Splits on commas that are not inside parentheses.
 *
 * A plain `split(',')` would cut every `rgba(r, g, b, a)` into pieces, which is
 * why this exists rather than the one-liner.
 */
function splitTopLevel(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter((part) => part.length > 0)
}

function parseStop(raw: string): GlowStop | null {
  const match = STOP_RE.exec(raw.trim())
  if (!match) return null
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: Number(match[4]),
    offset: Number(match[5]),
  }
}

/** One `radial-gradient(...)` layer, or `null` if it is not the shape above. */
export function parseGlowLayer(layer: string): GlowLayer | null {
  const match = LAYER_RE.exec(layer.trim())
  if (!match) return null

  const rx = Number(match[1])
  const ry = Number(match[2])
  // rx is the divisor building the SVG transform, so a zero would produce a
  // NaN scale and a gradient that silently renders as nothing.
  if (rx <= 0) return null

  const stops = splitTopLevel(match[5])
  if (stops.length !== 2) return null
  const from = parseStop(stops[0])
  const to = parseStop(stops[1])
  if (!from || !to) return null

  return { rx, ry, cx: Number(match[3]), cy: Number(match[4]), from, to }
}

/** Every readable layer of a theme's glow, outermost first, in CSS paint order. */
export function parseGlow(glow: string): GlowLayer[] {
  return splitTopLevel(glow)
    .map(parseGlowLayer)
    .filter((layer): layer is GlowLayer => layer !== null)
}

function stopSvg(stop: GlowStop, offset: number): string {
  return (
    `<stop offset="${offset}" stop-color="rgb(${stop.r},${stop.g},${stop.b})" ` +
    `stop-opacity="${stop.a}"/>`
  )
}

/**
 * One `<radialGradient>` matching a CSS radial-gradient layer.
 *
 * Left in `objectBoundingBox` units on purpose: in that space an x-fraction is
 * a fraction of the width and a y-fraction a fraction of the height, which is
 * exactly what CSS's `W% H%` means. So `r = rx/100` already gives the correct
 * horizontal radius, and a `scale(1, ry/rx)` about the centre stretches it to
 * the correct vertical one.
 */
export function glowGradientSvg(layer: GlowLayer, id: string): string {
  const cx = layer.cx / 100
  const cy = layer.cy / 100
  const r = layer.rx / 100
  const yScale = Number((layer.ry / layer.rx).toFixed(4))
  const transform = `translate(${cx},${cy}) scale(1,${yScale}) translate(${-cx},${-cy})`
  return (
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientTransform="${transform}">` +
    stopSvg(layer.from, layer.from.offset / 100) +
    stopSvg(layer.to, layer.to.offset / 100) +
    `</radialGradient>`
  )
}

/*
  A `CelestialBody.fill` is a different grammar from a glow layer: always
  `radial-gradient(circle at X% Y%, ...)` — the literal keyword `circle`
  rather than an independent `W% H%` ellipse — with two or more stops rather
  than exactly two, because the lit-limb shading a body needs (moon, nebula
  core, planet limb) takes more than a from/to pair. SVG's `fill` attribute
  accepts a colour or a `url(#id)` paint-server reference, never a CSS
  gradient function, so this has to become a real `<radialGradient>` def.
*/

export interface BodyGradientStop {
  /** `#rrggbb`, or `rgb(r,g,b)` when the source stop was `rgba(...)`. */
  color: string
  opacity: number
  /** Percentage along the gradient, 0-100. */
  offset: number
}

export interface BodyGradient {
  /** Centre, as percentages. */
  cx: number
  cy: number
  stops: BodyGradientStop[]
}

const BODY_LAYER_RE = /^radial-gradient\(\s*circle\s+at\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s*,\s*(.+)\)$/
const BODY_STOP_HEX_RE = /^(#[0-9a-fA-F]{6})\s+([\d.]+)%$/
const BODY_STOP_RGBA_RE =
  /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)\s+([\d.]+)%$/

function parseBodyStop(raw: string): BodyGradientStop | null {
  const trimmed = raw.trim()
  const hex = BODY_STOP_HEX_RE.exec(trimmed)
  if (hex) {
    return { color: hex[1], opacity: 1, offset: Number(hex[2]) }
  }
  const rgba = BODY_STOP_RGBA_RE.exec(trimmed)
  if (rgba) {
    return {
      color: `rgb(${rgba[1]},${rgba[2]},${rgba[3]})`,
      opacity: Number(rgba[4]),
      offset: Number(rgba[5]),
    }
  }
  return null
}

/**
 * One `radial-gradient(circle at X% Y%, <stop>, <stop>, ...)` body fill, or
 * `null` if it is not that shape. Never throws — decoration must never fail
 * the export.
 */
export function parseBodyGradient(css: string): BodyGradient | null {
  const match = BODY_LAYER_RE.exec(css.trim())
  if (!match) return null

  const rawStops = splitTopLevel(match[3])
  if (rawStops.length < 2) return null

  const stops: BodyGradientStop[] = []
  for (const raw of rawStops) {
    const stop = parseBodyStop(raw)
    if (!stop) return null
    stops.push(stop)
  }

  return { cx: Number(match[1]), cy: Number(match[2]), stops }
}

/**
 * One `<radialGradient>` matching a CSS `radial-gradient(circle at X% Y%, ...)`
 * body fill.
 *
 * `r` is CSS's default extent for a sizeless `circle` — farthest-corner from
 * the centre, i.e. the largest Euclidean distance from `(cx, cy)` to any of
 * the box's four corners. In `objectBoundingBox` units a body's box is a
 * square (it is a circle), so unlike `glowGradientSvg`'s ellipse this needs
 * no aspect correction — the computed radius is already correct on both axes.
 */
export function bodyGradientSvg(g: BodyGradient, id: string): string {
  const cx = g.cx / 100
  const cy = g.cy / 100
  const corners: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]
  const r = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy)))
  const stops = g.stops
    .map(
      (stop) =>
        `<stop offset="${stop.offset / 100}" stop-color="${stop.color}" stop-opacity="${stop.opacity}"/>`,
    )
    .join('')
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r.toFixed(4)}">${stops}</radialGradient>`
}
