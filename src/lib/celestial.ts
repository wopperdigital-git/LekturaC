/*
  The decorative vocabulary behind each theme's celestial backdrop.

  Everything here is expressed as CSS, not as an image asset: a star field is a
  stack of tiny `radial-gradient` circles on a single element rather than one
  <div> per star, so a 30-card deck costs 30 elements instead of ~2000 and the
  whole field shrinks correctly inside the outline sidebar's `transform: scale()`
  thumbnails for free.

  Positions are percentages of the card, so a backdrop works at any card size —
  which matters because cards size to their content and have no fixed aspect
  ratio.
*/

/** A field of stars, rendered as one element. Omit from a theme that shouldn't have stars. */
export interface StarField {
  count: number
  color: string
  /** Largest dot radius in px; each star lands between 0.5px and this. */
  maxRadiusPx: number
  /** Peak opacity — individual stars vary between a third of this and all of it. */
  opacity: number
  /**
   * Keeps stars out of the middle of the card, where headings and body copy
   * sit. Readability is the constraint the decoration answers to, not the
   * other way round.
   */
  avoidCenter?: boolean
}

/** A large circular stroke: an orbital path or a corona ring. */
export interface Orbit {
  /** Center, as a percentage of the card. May sit outside 0–100 to run off the edge. */
  cx: number
  cy: number
  /** Diameter, as a percentage of the card's *width* — the ring stays circular at any card height. */
  size: number
  color: string
  opacity: number
  widthPx?: number
  dashed?: boolean
}

/** A filled disc: a moon, a distant planet, a planetary limb. */
export interface CelestialBody {
  cx: number
  cy: number
  /** Diameter, as a percentage of the card's width. */
  size: number
  /** Any CSS background value — a radial-gradient is what makes a disc read as lit rather than flat. */
  fill: string
  opacity: number
  blurPx?: number
}

/** Straight lines between named points, as drawn on a star chart. */
export interface Constellation {
  color: string
  opacity: number
  widthPx?: number
  /** Each path is a run of [x%, y%] points joined end to end. */
  paths: Array<Array<[number, number]>>
}

/**
 * One theme's celestial identity. Every field but `glow` is optional, and that
 * is the point: a theme picks the two or three elements that carry its mood and
 * leaves the rest out. Stacking all of them into every theme is what would make
 * the five themes look like one theme.
 */
export interface CelestialDecor {
  /** The atmospheric layer — nebula, aurora, corona, moonlight — as CSS background-image layers. */
  glow: string
  stars?: StarField
  orbits?: Orbit[]
  bodies?: CelestialBody[]
  constellation?: Constellation
  /** The faint measurement grid of an astronomical chart. */
  grid?: { color: string; opacity: number; sizePx: number }
}

/**
 * Deterministic PRNG (mulberry32). The sky must be identical on every render:
 * `Math.random()` would reshuffle the stars on each re-render, so switching
 * themes, undoing a card delete, or simply scrolling would visibly rearrange
 * the background.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  }
  return hash >>> 0
}

/** Hex (#rrggbb) to `rgba()` at the given alpha — stars vary in brightness, so the color needs one per star. */
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

/** Central keep-out zone, as a fraction of each axis, when `avoidCenter` is set. */
const CENTER_KEEP_OUT = { x: 0.46, y: 0.42 }

function inCenter(x: number, y: number): boolean {
  return (
    Math.abs(x - 50) < (CENTER_KEEP_OUT.x * 100) / 2 && Math.abs(y - 50) < (CENTER_KEEP_OUT.y * 100) / 2
  )
}

/** One star's placement, in the units both encodings need: position as a percentage, radius in px. */
export interface Star {
  x: number
  y: number
  radius: number
  alpha: number
}

/**
 * The seeded sky: where the stars are, how big, and how bright.
 *
 * Split out from `starFieldCss` so the PPTX export's SVG backdrop can draw the
 * *same* sky rather than reimplementing the generator and drifting from it.
 * One generator, two encodings — CSS gradients on screen, `<circle>` elements
 * in the export.
 *
 * The order of `rand()` calls is load-bearing. A star rejected by
 * `avoidCenter` consumes exactly its x and y draws and no more; drawing radius
 * and alpha before that rejection would shift every later value and reshuffle
 * all five themes' skies.
 */
export function starPositions(seed: string, field: StarField): Star[] {
  const rand = mulberry32(hashSeed(seed))
  const stars: Star[] = []

  // Bounded: a rejected position costs one draw, and the keep-out zone leaves
  // most of the card available, so this terminates well inside the cap.
  let attempts = 0
  while (stars.length < field.count && attempts < field.count * 12) {
    attempts++
    const x = rand() * 100
    const y = rand() * 100
    if (field.avoidCenter && inCenter(x, y)) continue

    // Uniform stars read as a printed pattern; varying radius and brightness
    // together is what makes the field look like a sky.
    stars.push({
      x,
      y,
      radius: 0.5 + rand() * (field.maxRadiusPx - 0.5),
      alpha: field.opacity * (0.35 + rand() * 0.65),
    })
  }

  return stars
}

/**
 * Builds a star field as a single `background-image` value: one soft
 * `radial-gradient` circle per star.
 *
 * `circle <r>px` keeps every star round no matter how tall the card grows,
 * which a percentage-sized gradient would not.
 */
export function starFieldCss(seed: string, field: StarField): string {
  return starPositions(seed, field)
    .map(
      ({ x, y, radius, alpha }) =>
        `radial-gradient(circle ${radius.toFixed(2)}px at ${x.toFixed(2)}% ${y.toFixed(2)}%, ` +
        `${withAlpha(field.color, alpha)} 0%, transparent 100%)`,
    )
    .join(', ')
}
