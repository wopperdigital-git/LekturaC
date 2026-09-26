import {
  MARKER_OPACITY,
  SHAPE_FILL_OPACITY,
  inkColor,
  shapePolygon,
  strokePath,
  type OverlayItem,
  type Shape,
} from '@/engine/overlay'

/** How faded an item looks while the eraser is over it. */
const ERASING_OPACITY = 0.2

/** A rounded rectangle's corner radius, as a share of its shorter side. */
const ROUNDED_RADIUS_SHARE = 0.2

/**
 * Ink over one card's content box: hand-drawn strokes and placed shapes.
 *
 * One SVG, `pointer-events: none` so it never takes a press meant for the text
 * beneath, `overflow: visible` so ink that runs past the box (it can start over
 * the card's padding) is still drawn and only the card's own clipping cuts it.
 * Coordinates are fractions of the content width, turned into pixels here against
 * the width `SlideBody` measures — so it needs no idea of zoom or of where on
 * screen it is.
 *
 * The one exception to "never takes a press" is a shape when the editor passes
 * `onPressItem`: it then takes the pointer on what it paints (its outline, or its
 * area when filled), so pressing it selects it while an empty outline still lets
 * a press through to the text inside.
 *
 * Drawn on every surface that draws a slide, not only the editor: ink that is
 * part of the slide is part of what the presenter and thumbnails show. (Temporary
 * ink is a second, editor-only instance, marked with `data-temporary`.)
 */
export function OverlayLayer({
  items,
  width,
  fading,
  temporary,
  onPressItem,
}: {
  items: readonly OverlayItem[] | undefined
  /** The content box's width in pixels. */
  width: number
  /** Ids to draw faded: what the eraser is currently touching. */
  fading?: ReadonlySet<string>
  temporary?: boolean
  /** When given, shapes become pressable and report the press. */
  onPressItem?: (id: string) => void
}) {
  if (!items || items.length === 0 || width <= 0) return null
  return (
    <svg
      aria-hidden="true"
      data-overlay
      {...(temporary ? { 'data-temporary': '' } : {})}
      width={width}
      height="100%"
      // Above the content and the grid, below the selection box (z-20).
      style={{ position: 'absolute', left: 0, top: 0, zIndex: 15, overflow: 'visible', pointerEvents: 'none' }}
    >
      {items.map((item) => {
        const erasing = fading?.has(item.id) ?? false
        if (item.kind === 'shape') {
          return (
            <ShapeMark key={item.id} shape={item} width={width} erasing={erasing} onPress={onPressItem} />
          )
        }
        return (
          <path
            key={item.id}
            d={strokePath(item, width)}
            fill="none"
            stroke={inkColor(item.color)}
            strokeWidth={item.width * width}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...(erasing
              ? { opacity: ERASING_OPACITY }
              : item.tool === 'marker'
                ? { strokeOpacity: MARKER_OPACITY }
                : {})}
          />
        )
      })}
    </svg>
  )
}

function ShapeMark({
  shape,
  width,
  erasing,
  onPress,
}: {
  shape: Shape
  width: number
  erasing: boolean
  onPress?: (id: string) => void
}) {
  const color = inkColor(shape.color)
  const x = shape.x * width
  const y = shape.y * width
  const w = shape.w * width
  const h = shape.h * width

  const common = {
    'data-shape': shape.shape,
    fill: shape.fill ? color : 'none',
    ...(shape.fill ? { fillOpacity: SHAPE_FILL_OPACITY } : {}),
    stroke: color,
    strokeWidth: shape.width * width,
    strokeLinejoin: 'round' as const,
    ...(erasing ? { opacity: ERASING_OPACITY } : {}),
    ...(onPress
      ? {
          style: { pointerEvents: 'visiblePainted' as const, cursor: 'pointer' },
          onPointerDown: (e: React.PointerEvent) => {
            e.stopPropagation()
            onPress(shape.id)
          },
          // The card's own click handler resets the selection to the card, which
          // would clear the shape a moment after this press picked it.
          onClick: (e: React.MouseEvent) => e.stopPropagation(),
          onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
        }
      : {}),
  }

  switch (shape.shape) {
    case 'rectangle':
      return <rect {...common} x={x} y={y} width={w} height={h} />
    case 'rounded': {
      const radius = Math.min(w, h) * ROUNDED_RADIUS_SHARE
      return <rect {...common} x={x} y={y} width={w} height={h} rx={radius} ry={radius} />
    }
    case 'ellipse':
      return <ellipse {...common} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />
    default: {
      const points = shapePolygon(shape)
        .map(([px, py]) => `${Math.round(px * width * 100) / 100},${Math.round(py * width * 100) / 100}`)
        .join(' ')
      return <polygon {...common} points={points} />
    }
  }
}
