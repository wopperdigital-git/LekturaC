import type { MouseEvent } from 'react'
import type { BrushSize } from '@/engine/overlay'
import { swatch } from './inkSwatch'
import { LIVE_COLORS, liveToolMenu, type LivePen, type LiveTextSize, type LiveTool } from '@/present/liveInk'

/*
  The small menu a live tool opens when it is pressed again: its size, and for
  the pen, highlighter and text its colour. It hangs above the tool row (the row
  sits at the foot of the console). The console owns whether it is open and
  closes it on an outside press or Escape.
*/

const SIZES: readonly { id: BrushSize; label: string; px: number }[] = [
  { id: 'dot', label: 'Fine', px: 4 },
  { id: 'small', label: 'Medium', px: 8 },
  { id: 'big', label: 'Thick', px: 14 },
]

const TEXT_SIZES: readonly { id: LiveTextSize; label: string; px: number }[] = [
  { id: 'small', label: 'Small', px: 12 },
  { id: 'medium', label: 'Medium', px: 16 },
  { id: 'large', label: 'Large', px: 22 },
]

const TOOL_NAMES: Record<LiveTool, string> = {
  pointer: 'Pointer',
  pen: 'Pen',
  highlighter: 'Highlighter',
  laser: 'Laser',
  eraser: 'Eraser',
  text: 'Text',
}

/** A press must not take focus: a focused button would eat the clicker's next Space. */
function refuseFocus(e: MouseEvent) {
  e.preventDefault()
}

const CHOICE =
  'flex size-9 cursor-pointer items-center justify-center rounded-app-sm border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent'

export function LiveToolMenu({
  tool,
  pen,
  onChange,
  onColor,
}: {
  tool: LiveTool
  pen: LivePen
  onChange: (patch: Partial<LivePen>) => void
  onColor: (color: string) => void
}) {
  const menu = liveToolMenu(tool)
  if (!menu) return null
  const name = TOOL_NAMES[tool]
  const color = tool === 'highlighter' ? pen.highlighterColor : pen.penColor
  const size = tool === 'highlighter' ? pen.highlighterSize : tool === 'eraser' ? pen.eraserSize : pen.penSize
  const sizeKey = tool === 'highlighter' ? 'highlighterSize' : tool === 'eraser' ? 'eraserSize' : 'penSize'
  // The sample is drawn in the tool's own colour; the eraser's is an outline, the size it clears.
  const sample = tool === 'eraser' ? undefined : swatch(color)

  return (
    <div
      role="dialog"
      aria-label={`${name} settings`}
      data-tool-menu
      className="absolute bottom-full left-0 z-40 mb-2 flex w-max flex-col gap-2 rounded-app-sm border border-app-border bg-app-background p-2.5 shadow-app"
    >
      <div role="group" aria-label="Size" className="flex items-center gap-1.5">
        <span className="w-12 text-xs font-medium text-app-muted">Size</span>
        {tool === 'text'
          ? TEXT_SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={refuseFocus}
                onClick={() => onChange({ textSize: s.id })}
                aria-pressed={pen.textSize === s.id}
                aria-label={s.label}
                title={s.label}
                className={`${CHOICE} ${pen.textSize === s.id ? 'border-app-accent bg-app-accent/15' : 'border-app-border hover:bg-app-border/40'}`}
              >
                <span aria-hidden="true" className="font-semibold leading-none" style={{ fontSize: s.px, color: sample }}>
                  A
                </span>
              </button>
            ))
          : SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={refuseFocus}
                onClick={() => onChange({ [sizeKey]: s.id })}
                aria-pressed={size === s.id}
                aria-label={s.label}
                title={s.label}
                className={`${CHOICE} ${size === s.id ? 'border-app-accent bg-app-accent/15' : 'border-app-border hover:bg-app-border/40'}`}
              >
                <span
                  aria-hidden="true"
                  className="rounded-full"
                  style={{
                    width: s.px + (tool === 'highlighter' ? 4 : 0),
                    height: s.px + (tool === 'highlighter' ? 4 : 0),
                    background: sample ?? 'transparent',
                    opacity: tool === 'highlighter' ? 0.6 : 1,
                    border: sample ? undefined : '1.5px solid currentColor',
                  }}
                />
              </button>
            ))}
      </div>
      {menu.color && (
        <div role="group" aria-label="Colour" className="flex items-center gap-1.5">
          <span className="w-12 text-xs font-medium text-app-muted">Colour</span>
          {LIVE_COLORS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onMouseDown={refuseFocus}
              onClick={() => onColor(value)}
              aria-pressed={color === value}
              aria-label={label}
              title={label}
              className={`size-7 cursor-pointer rounded-full border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${color === value ? 'scale-110 border-app-foreground' : 'border-app-border'}`}
              style={{ background: swatch(value) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
