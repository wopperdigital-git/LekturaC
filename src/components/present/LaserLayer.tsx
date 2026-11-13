import type { LaserPoint } from '@/present/liveInk'

const LASER_RED = '#ef4444'
/** The dot's radius, as a fraction of the content width. */
const DOT_RADIUS = 0.009

/**
 * The laser pointer over one slide's content box: a red dot with a short trail
 * that thins and fades behind it. Same coordinates as the ink (fractions of the
 * content width), so the console and the projector put it in the same place
 * whatever size each draws the slide.
 */
export function LaserLayer({ trail, width }: { trail: readonly LaserPoint[]; width: number }) {
  if (trail.length === 0 || width <= 0) return null
  const n = trail.length
  const dot = trail[n - 1]
  return (
    <svg
      aria-hidden="true"
      data-laser
      width={width}
      height="100%"
      style={{ position: 'absolute', left: 0, top: 0, zIndex: 25, overflow: 'visible', pointerEvents: 'none' }}
    >
      {trail.slice(0, -1).map((p, i) => (
        <circle
          key={`${p.at}-${i}`}
          cx={p.x * width}
          cy={p.y * width}
          r={DOT_RADIUS * width * (0.3 + (0.5 * (i + 1)) / n)}
          fill={LASER_RED}
          opacity={(0.5 * (i + 1)) / n}
        />
      ))}
      <circle cx={dot.x * width} cy={dot.y * width} r={DOT_RADIUS * width * 2.2} fill={LASER_RED} opacity={0.25} />
      <circle
        cx={dot.x * width}
        cy={dot.y * width}
        r={DOT_RADIUS * width}
        fill={LASER_RED}
        stroke="#fff"
        strokeWidth={Math.max(1, DOT_RADIUS * width * 0.25)}
      />
    </svg>
  )
}
