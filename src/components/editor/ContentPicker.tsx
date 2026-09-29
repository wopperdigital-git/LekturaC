import type { ReactNode } from 'react'
import { CONTENT_OPTIONS, type ContentType } from '@/engine/newContent'

/*
  The Insert picker for the floating toolbar: a grid of low-fidelity
  pictures of each element, not a list of names — the same idea as the layout
  picker's wireframes. Bars for text, the accent where the slide puts it.

  App chrome: painted with `app-*` tokens, never the deck's theme. Drawn in a
  64×40 viewBox and scaled to the tile.
*/

const INK = 'var(--app-foreground)'
const ACCENT = 'var(--app-accent)'

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent'

export function ContentGrid({ onPick }: { onPick: (type: ContentType) => void }) {
  return (
    <div className="grid w-72 grid-cols-3 gap-1.5 p-2">
      {CONTENT_OPTIONS.map((option) => (
        <button
          key={option.type}
          type="button"
          role="menuitem"
          title={option.description}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(option.type)}
          className={`flex min-w-0 cursor-pointer flex-col items-stretch gap-1 rounded-[6px] border border-transparent p-1 text-left transition-colors hover:border-app-accent/60 hover:bg-app-accent/10 ${FOCUS_RING}`}
        >
          <svg viewBox="0 0 64 40" aria-hidden="true" className="aspect-[8/5] w-full rounded-[4px] bg-app-surface">
            {PICTURES[option.type]}
          </svg>
          <span className="truncate px-0.5 text-[11px] text-app-foreground">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

function Bar({ x, y, w, h, accent = false, strong = false }: { x: number; y: number; w: number; h: number; accent?: boolean; strong?: boolean }) {
  return <rect x={x} y={y} width={w} height={h} rx={Math.min(1.5, h / 2)} fill={accent ? ACCENT : INK} opacity={accent ? 0.9 : strong ? 0.72 : 0.24} />
}

const PICTURES: Record<ContentType, ReactNode> = {
  h1: <Bar x={10} y={16} w={44} h={8} strong />,
  h2: <Bar x={10} y={17} w={36} h={6} strong />,
  h3: <Bar x={10} y={18} w={28} h={4} strong />,
  body: (
    <>
      <Bar x={10} y={12} w={44} h={3} />
      <Bar x={10} y={18.5} w={44} h={3} />
      <Bar x={10} y={25} w={30} h={3} />
    </>
  ),
  list: (
    <>
      {[11, 18.5, 26].map((y) => (
        <g key={y}>
          <circle cx={12} cy={y + 1.5} r={1.8} fill={ACCENT} />
          <Bar x={17} y={y} w={y === 26 ? 26 : 36} h={3} />
        </g>
      ))}
    </>
  ),
  stat: (
    <>
      <Bar x={20} y={9} w={24} h={12} accent />
      <Bar x={16} y={26} w={32} h={3} />
    </>
  ),
  quote: (
    <>
      <path d="M10 14c0-3 2-4.5 4.5-4.5v2.2c-1.2 0-2 .8-2 2h2v4.3H10V14Zm7 0c0-3 2-4.5 4.5-4.5v2.2c-1.2 0-2 .8-2 2h2v4.3H17V14Z" fill={ACCENT} />
      <Bar x={26} y={12} w={28} h={3} />
      <Bar x={26} y={18.5} w={22} h={3} />
      <Bar x={26} y={27} w={14} h={2.5} strong />
    </>
  ),
  step: (
    <>
      <rect x={13.25} y={8} width={1.5} height={24} fill={INK} opacity={0.18} />
      <circle cx={14} cy={14} r={3} fill={ACCENT} />
      <Bar x={21} y={11.5} w={16} h={3.5} accent />
      <Bar x={21} y={19} w={32} h={3} />
      <Bar x={21} y={25} w={24} h={3} />
    </>
  ),
  group: (
    <>
      <rect x={8.5} y={6.5} width={47} height={27} rx={3} fill={INK} fillOpacity={0.05} stroke={INK} strokeOpacity={0.2} />
      <Bar x={13} y={11} w={20} h={4} strong />
      <circle cx={14.5} cy={21.5} r={1.4} fill={ACCENT} />
      <Bar x={18} y={20} w={30} h={3} />
      <circle cx={14.5} cy={27.5} r={1.4} fill={ACCENT} />
      <Bar x={18} y={26} w={22} h={3} />
    </>
  ),
}
