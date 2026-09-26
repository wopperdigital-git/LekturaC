import { SHAPE_KINDS, type ShapeKind } from '@/engine/overlay'
import type { PenSettings } from '@/engine/penSettings'
import { SHAPE_LABELS, type ShapeSettings } from '@/engine/shapes'
import { Choice, ColorRow, FullNote, KeepRow, Row } from './InkControls'

/**
 * Which shape the shape tool draws, filled or not, and where it goes.
 *
 * App chrome (`app-*` tokens); the popover of the toolbar's shapes button. Colour
 * and Keep are the pen's — the same "ink" settings — so changing them here changes
 * them there, and the rows are the shared ones from `InkControls.tsx`.
 */
export function ShapePopover({
  settings,
  onChange,
  ink,
  onInkChange,
  atLimit,
}: {
  settings: ShapeSettings
  onChange: (patch: Partial<ShapeSettings>) => void
  /** The colour and destination shared with the pen. */
  ink: Pick<PenSettings, 'color' | 'keep'>
  onInkChange: (patch: Partial<Pick<PenSettings, 'color' | 'keep'>>) => void
  /** The slide is at its item limit for the chosen destination: new shapes are refused. */
  atLimit: boolean
}) {
  return (
    <div className="w-60 space-y-3 p-3 text-[11px] text-app-foreground">
      <Row label="Shape" wrap>
        {SHAPE_KINDS.map((kind) => (
          <span key={kind} data-shape-choice>
            <Choice
              label={SHAPE_LABELS[kind]}
              pressed={settings.shape === kind}
              onClick={() => onChange({ shape: kind })}
              className="size-8 justify-center"
            >
              <ShapeGlyph kind={kind} />
            </Choice>
          </span>
        ))}
      </Row>

      <Row label="Style">
        <Choice pressed={!settings.fill} onClick={() => onChange({ fill: false })} className="flex-1 px-2 py-1">
          Outline
        </Choice>
        <Choice pressed={settings.fill} onClick={() => onChange({ fill: true })} className="flex-1 px-2 py-1">
          Filled
        </Choice>
      </Row>

      <ColorRow value={ink.color} onChange={(color) => onInkChange({ color })} />
      <KeepRow value={ink.keep} onChange={(keep) => onInkChange({ keep })} />

      <p className="text-app-muted">Drag on a slide to draw, or click to drop one. Then drag it to move or resize.</p>

      {atLimit && <FullNote />}
    </div>
  )
}

/** A small picture of a shape, in `currentColor`. */
function ShapeGlyph({ kind }: { kind: ShapeKind }) {
  const common = {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'size-[18px]',
  }
  switch (kind) {
    case 'rectangle':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="14" height="10" />
        </svg>
      )
    case 'rounded':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="14" height="10" rx="3" />
        </svg>
      )
    case 'ellipse':
      return (
        <svg {...common}>
          <ellipse cx="10" cy="10" rx="7" ry="5" />
        </svg>
      )
    case 'triangle':
      return (
        <svg {...common}>
          <path d="M10 4 17 16H3Z" />
        </svg>
      )
    case 'diamond':
      return (
        <svg {...common}>
          <path d="M10 3 17 10 10 17 3 10Z" />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M3 8h8V4.5L17 10l-6 5.5V12H3Z" />
        </svg>
      )
  }
}
