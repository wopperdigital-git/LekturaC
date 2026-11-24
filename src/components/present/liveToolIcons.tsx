import type { LiveTool } from '@/present/liveInk'

/* The presenter console's tool glyphs: inline SVG on `currentColor`, drawn like the editor toolbar's. */

const strokeProps = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'size-[18px]',
}

function CursorIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M5 3.5v12l3.2-3.1 2.3 4.6 2.1-1-2.3-4.5H15L5 3.5Z" />
    </svg>
  )
}

function PenIcon() {
  return (
    <svg {...strokeProps}>
      <path d="m12.5 4.5 3 3-8 8H4.5v-3l8-8Z" />
      <path d="m11 6 3 3" />
    </svg>
  )
}

function HighlighterIcon() {
  return (
    <svg {...strokeProps}>
      <path d="m13 3.5 3.5 3.5-6.5 6.5H6.5V10L13 3.5Z" />
      <path d="M6.5 13.5 4.5 15.5h3l1-1" />
      <path d="M3 17.5h14" strokeWidth={2.4} opacity={0.45} />
    </svg>
  )
}

function LaserIcon() {
  return (
    <svg {...strokeProps}>
      <circle cx="10" cy="10" r="2.2" fill="currentColor" />
      <circle cx="10" cy="10" r="5.5" opacity={0.5} />
      <path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5" />
    </svg>
  )
}

function TextIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M4.5 5.5V4h11v1.5M10 4v12M7.5 16h5" />
    </svg>
  )
}

export function WhiteboardIcon() {
  return (
    <svg {...strokeProps}>
      <rect x="2.5" y="3.5" width="15" height="10" rx="1.2" />
      <path d="M7 17.5l3-4 3 4M6 8.5c1.2-1.5 2.3-1.5 3.5 0s2.3 1.5 3.5 0" />
    </svg>
  )
}

function EraserIcon() {
  return (
    <svg {...strokeProps}>
      <path d="m8.5 16.5-4-4a1.4 1.4 0 0 1 0-2l6.5-6.5a1.4 1.4 0 0 1 2 0l3 3a1.4 1.4 0 0 1 0 2l-7.5 7.5Z" />
      <path d="m6.5 8.5 5 5M8.5 16.5H16" />
    </svg>
  )
}

export function ToolIcon({ tool }: { tool: LiveTool }) {
  switch (tool) {
    case 'pointer':
      return <CursorIcon />
    case 'pen':
      return <PenIcon />
    case 'highlighter':
      return <HighlighterIcon />
    case 'laser':
      return <LaserIcon />
    case 'eraser':
      return <EraserIcon />
    case 'text':
      return <TextIcon />
  }
}

/* One glyph for both directions: redo is the same arrow mirrored, as in the editor. */
export function UndoIcon({ flip }: { flip?: boolean }) {
  return (
    <svg {...strokeProps} style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M4 9h8.5a3.5 3.5 0 0 1 0 7H8" />
      <path d="M7 5.5 3.5 9 7 12.5" />
    </svg>
  )
}

export function ClearIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M4 6h12M8 6V4.5h4V6M5.5 6l.8 10.5h7.4L14.5 6" />
      <path d="M8.5 9v4.5M11.5 9v4.5" />
    </svg>
  )
}
