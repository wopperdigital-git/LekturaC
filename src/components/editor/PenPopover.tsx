import type { BrushSize } from '@/engine/overlay'
import { type PenKind, type PenSettings } from '@/engine/penSettings'
import { Choice, ColorRow, FullNote, KeepRow, Row } from './InkControls'

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent'

const TOOLS: readonly { id: PenKind; label: string }[] = [
  { id: 'pen', label: 'Pen' },
  { id: 'marker', label: 'Marker' },
  { id: 'eraser', label: 'Eraser' },
]

/** Diameters of the sample dots, in px: the sizes as they will roughly look. */
const SIZES: readonly { id: BrushSize; label: string; diameter: number }[] = [
  { id: 'dot', label: 'Dot', diameter: 4 },
  { id: 'small', label: 'Small circle', diameter: 9 },
  { id: 'big', label: 'Big circle', diameter: 16 },
]

/**
 * What the pen tool draws with, and where the ink goes.
 *
 * App chrome (`app-*` tokens); the popover of the toolbar's pen button. The
 * colour and Keep rows are shared with the shape tool's popover
 * (`InkControls.tsx`).
 */
export function PenPopover({
  settings,
  onChange,
  hasTemporaryHere,
  hasTemporary,
  onClearSlide,
  onClearAll,
  atLimit,
}: {
  settings: PenSettings
  onChange: (patch: Partial<PenSettings>) => void
  /** Whether the slide being worked on has temporary ink. */
  hasTemporaryHere: boolean
  /** Whether any slide in the deck does. */
  hasTemporary: boolean
  onClearSlide: () => void
  onClearAll: () => void
  /** The slide is at its item limit for the chosen destination: new ink is refused. */
  atLimit: boolean
}) {
  const erasing = settings.tool === 'eraser'

  return (
    <div className="w-60 space-y-3 p-3 text-[11px] text-app-foreground">
      <Row label="Tool">
        {TOOLS.map((tool) => (
          <Choice
            key={tool.id}
            pressed={settings.tool === tool.id}
            onClick={() => onChange({ tool: tool.id })}
            className="flex-1 px-2 py-1"
          >
            {tool.label}
          </Choice>
        ))}
      </Row>

      <Row label={erasing ? 'Eraser size' : 'Size'}>
        {SIZES.map((size) => (
          <Choice
            key={size.id}
            label={size.label}
            pressed={settings.size === size.id}
            onClick={() => onChange({ size: size.id })}
            className="size-8 shrink-0 justify-center"
          >
            <span
              aria-hidden="true"
              className="rounded-full bg-current"
              style={{ width: size.diameter, height: size.diameter }}
            />
          </Choice>
        ))}
      </Row>

      {!erasing && <ColorRow value={settings.color} onChange={(color) => onChange({ color })} />}

      <KeepRow
        label={erasing ? 'Erase from' : 'Keep'}
        value={settings.keep}
        onChange={(keep) => onChange({ keep })}
      />

      {atLimit && <FullNote />}

      {hasTemporary && (
        <div className="flex gap-1.5 border-t border-app-border pt-2.5">
          {hasTemporaryHere && <ClearButton onClick={onClearSlide}>Clear this slide</ClearButton>}
          <ClearButton onClick={onClearAll}>Clear all slides</ClearButton>
        </div>
      )}
    </div>
  )
}

function ClearButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex-1 cursor-pointer rounded-[5px] bg-app-foreground/[0.06] px-2 py-1 text-app-foreground transition-colors hover:bg-app-foreground/10 ${FOCUS_RING}`}
    >
      {children}
    </button>
  )
}
