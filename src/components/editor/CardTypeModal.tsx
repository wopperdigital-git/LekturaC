import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { cardKindLabel } from '@/engine/layoutEngine'
import { CREATABLE_KINDS, KIND_DESCRIPTIONS, type CreatableKind } from '@/engine/cardTemplates'

/**
 * The picker for adding a slide: what kind of slide is this?
 *
 * Each type is drawn as a schematic slide rather than named alone. "Comparison"
 * and "Timeline" are not words that tell you what you are about to get, and a
 * six-line diagram does.
 *
 * This is the only place a slide's type is chosen. It is not offered for a slide
 * that already exists — to put more on one, the toolbar's Add content adds a
 * single element to it.
 */
export function CardTypeModal({
  onPick,
  onClose,
}: {
  onPick: (kind: CreatableKind) => void
  onClose: () => void
}) {
  return (
    <Modal title="Add a slide" onClose={onClose}>
      <p className="text-sm text-app-muted">
        Pick what kind of slide this is. Every type starts with placeholder text you edit on the
        slide.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CREATABLE_KINDS.map((kind) => (
          <CardTypeOption key={kind} kind={kind} onClick={() => onPick(kind)} />
        ))}
      </div>
    </Modal>
  )
}

function CardTypeOption({ kind, onClick }: { kind: CreatableKind; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-start gap-3 rounded-app-sm border border-app-border p-3 text-left transition-colors hover:border-app-accent/50 hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
    >
      <CardTypeDiagram kind={kind} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-app-foreground">
          {cardKindLabel(kind)}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-app-muted">
          {KIND_DESCRIPTIONS[kind]}
        </span>
      </span>
    </button>
  )
}

/*
  Schematic slides, not icons.

  Each is the arrangement the type actually produces, at 16:9 — a heading bar
  plus whatever the type puts under it. Drawn from the current text colour at
  two opacities so the diagram follows the light/dark toggle with the rest of
  the app chrome, and so the "heading" reads as the emphasised element in every
  one of them without a second colour to keep in sync.
*/
function CardTypeDiagram({ kind }: { kind: CreatableKind }) {
  return (
    <svg
      viewBox="0 0 48 27"
      aria-hidden="true"
      className="mt-0.5 size-10 shrink-0 rounded-[3px] border border-app-border bg-app-surface text-app-foreground"
    >
      {SHAPES[kind]}
    </svg>
  )
}

/** A filled bar. `o` is opacity: 0.75 for a heading, 0.3 for body content. */
function bar(x: number, y: number, w: number, h: number, o: number, key?: string) {
  return <rect key={key} x={x} y={y} width={w} height={h} rx={h / 2} fillOpacity={o} fill="currentColor" />
}

const SHAPES: Record<CreatableKind, ReactNode> = {
  // One big centred line with a shorter one beneath it.
  title: (
    <>
      {bar(10, 10, 28, 3.4, 0.75)}
      {bar(16, 16, 16, 2, 0.3)}
    </>
  ),
  // Heading, then full-width prose.
  text: (
    <>
      {bar(6, 6, 20, 3, 0.75)}
      {[13, 17, 21].map((y, i) => bar(6, y, i === 2 ? 24 : 36, 1.8, 0.3, `t${y}`))}
    </>
  ),
  // Heading, then bullets: a dot and a line each.
  list: (
    <>
      {bar(6, 6, 20, 3, 0.75)}
      {[13, 17.5, 22].map((y) => (
        <g key={`l${y}`}>
          <circle cx={7.5} cy={y + 0.9} r={1.4} fill="currentColor" fillOpacity={0.55} />
          {bar(11, y, 27, 1.8, 0.3)}
        </g>
      ))}
    </>
  ),
  // Three numbers across, each over its label.
  stats: (
    <>
      {bar(6, 5, 20, 2.6, 0.75)}
      {[6, 19, 32].map((x) => (
        <g key={`s${x}`}>
          {bar(x, 13, 10, 5, 0.6)}
          {bar(x + 1, 20, 8, 1.6, 0.3)}
        </g>
      ))}
    </>
  ),
  // A rail with three stops on it.
  timeline: (
    <>
      {bar(6, 5, 20, 2.6, 0.75)}
      <line x1="8" y1="17" x2="40" y2="17" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.2} />
      {[10, 24, 38].map((x) => (
        <g key={`tl${x}`}>
          <circle cx={x} cy={17} r={2.6} fill="currentColor" fillOpacity={0.6} />
          {bar(x - 4, 21.5, 8, 1.6, 0.3)}
        </g>
      ))}
    </>
  ),
  // Two columns, each a small heading over its own points.
  comparison: (
    <>
      {bar(6, 5, 20, 2.6, 0.75)}
      {[6, 26].map((x) => (
        <g key={`c${x}`}>
          {bar(x, 12, 10, 2.2, 0.6)}
          {bar(x, 16.5, 16, 1.6, 0.3)}
          {bar(x, 20, 16, 1.6, 0.3)}
        </g>
      ))}
    </>
  ),
  // Oversized quote mark beside the words.
  quote: (
    <>
      <text
        x="8"
        y="19"
        fontSize="16"
        fontFamily="Georgia, serif"
        fill="currentColor"
        fillOpacity={0.55}
      >
        “
      </text>
      {bar(17, 10, 24, 2.2, 0.4)}
      {bar(17, 14, 20, 2.2, 0.4)}
      {bar(17, 19.5, 12, 1.6, 0.25)}
    </>
  ),
}
