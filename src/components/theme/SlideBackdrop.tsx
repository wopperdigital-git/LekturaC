import { useMemo } from 'react'
import { starFieldCss } from '@/lib/celestial'
import { useSlideTheme } from './slideThemeContext'

/**
 * The decorative layers behind a slide's content.
 *
 * Everything here is `pointer-events-none` and `aria-hidden`: it is atmosphere,
 * never content, and it must never intercept a click or reach a screen reader.
 * The layers stack back-to-front — glow, grid, orbits, bodies, stars,
 * constellation — and each one is skipped entirely when the active theme
 * doesn't declare it, which is how the five themes stay visually distinct.
 *
 * Sizes are percentages of the card, so a backdrop is correct at any card size:
 * the same markup serves a full-width canvas card, a 136px outline thumbnail,
 * and a theme preview, because the thumbnails scale their whole subtree with a
 * CSS transform rather than re-rendering at a different size.
 */
export function SlideBackdrop() {
  const theme = useSlideTheme()
  const { stars, orbits, bodies, constellation, grid } = theme.celestial

  // Seeded on the theme id, so the sky is stable across re-renders and
  // identical between a card, its thumbnail, and the theme preview.
  const starLayers = useMemo(() => (stars ? starFieldCss(theme.id, stars) : null), [theme.id, stars])

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Nebula / aurora / corona — written by applyTheme as a token. */}
      <div className="absolute inset-0" style={{ backgroundImage: 'var(--slide-backdrop-image)' }} />

      {grid && (
        <div
          className="absolute inset-0"
          style={{
            opacity: grid.opacity,
            backgroundImage: `linear-gradient(${grid.color} 1px, transparent 1px), linear-gradient(90deg, ${grid.color} 1px, transparent 1px)`,
            backgroundSize: `${grid.sizePx}px ${grid.sizePx}px`,
          }}
        />
      )}

      {orbits?.map((orbit, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            // Width drives height through aspect-ratio so the ring stays a
            // circle however tall the card grows with its content.
            left: `${orbit.cx}%`,
            top: `${orbit.cy}%`,
            width: `${orbit.size}%`,
            aspectRatio: '1',
            transform: 'translate(-50%, -50%)',
            border: `${orbit.widthPx ?? 1}px ${orbit.dashed ? 'dashed' : 'solid'} ${orbit.color}`,
            opacity: orbit.opacity,
          }}
        />
      ))}

      {bodies?.map((body, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${body.cx}%`,
            top: `${body.cy}%`,
            width: `${body.size}%`,
            aspectRatio: '1',
            transform: 'translate(-50%, -50%)',
            background: body.fill,
            opacity: body.opacity,
            filter: body.blurPx ? `blur(${body.blurPx}px)` : undefined,
          }}
        />
      ))}

      {starLayers && (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: starLayers, backgroundRepeat: 'no-repeat' }}
        />
      )}

      {constellation && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          fill="none"
          style={{ opacity: constellation.opacity }}
        >
          {constellation.paths.map((path, i) => (
            <polyline
              key={i}
              points={path.map(([x, y]) => `${x},${y}`).join(' ')}
              stroke={constellation.color}
              strokeWidth={constellation.widthPx ?? 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              // Without this the non-uniform viewBox scaling would thicken the
              // stroke horizontally and thin it vertically on a tall card.
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}

      {/* Vertices of the constellation, as round dots. They are separate from the
          SVG above because a circle inside a `preserveAspectRatio="none"` viewBox
          would render as an ellipse. */}
      {constellation?.paths.flatMap((path, pathIndex) =>
        path.map(([x, y], pointIndex) => (
          <div
            key={`${pathIndex}-${pointIndex}`}
            className="absolute rounded-full"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: 3,
              height: 3,
              transform: 'translate(-50%, -50%)',
              background: constellation.color,
              opacity: constellation.opacity,
            }}
          />
        )),
      )}
    </div>
  )
}
