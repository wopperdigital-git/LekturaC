import type { ReactNode } from 'react'
import type { LayoutType, VisualStyle } from '@/engine/contentBlocks'

/*
  A low-fidelity picture of one layout variety for the Layout picker: bars for
  text, tinted rectangles for surfaces, the accent where the real layout puts
  it. Each drawing follows its component's own JSX (`GroupRenderer` for the
  families, the frame components for the rest), both visual treatments — so a
  change to how a layout looks should be mirrored here, or the picker will
  promise one thing and the slide show another.

  App chrome: painted with `app-*` tokens, never the deck's theme. Drawn in a
  160×90 viewBox (16:9) and scaled to the tile.
*/

const INK = 'var(--app-foreground)'
const ACCENT = 'var(--app-accent)'

/** A heading (h2 in every layout but the hero). */
function Title({ x = 12, y = 11, w = 64, h = 6 }: { x?: number; y?: number; w?: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={1.5} fill={INK} opacity={0.72} />
}

/** Body text. */
function Line({ x, y, w, h = 3 }: { x: number; y: number; w: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={1.5} fill={INK} opacity={0.24} />
}

/** A semibold accent label (timeline step labels, featured headings). */
function Label({ x, y, w, h = 3.5 }: { x: number; y: number; w: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={1.5} fill={ACCENT} opacity={0.85} />
}

/** A stat's figure: large, bold, accent. */
function Figure({ x, y, w, h = 8 }: { x: number; y: number; w: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={2} fill={ACCENT} />
}

/** `bg-slide-surface`. */
function Surface({ x, y, w, h, r = 3 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} fill={INK} opacity={0.07} />
}

/** A bordered box; `featured` is the accent border and tint. */
function Outline({ x, y, w, h, featured = false }: { x: number; y: number; w: number; h: number; featured?: boolean }) {
  return (
    <rect
      x={x + 0.5}
      y={y + 0.5}
      width={w - 1}
      height={h - 1}
      rx={3}
      fill={featured ? ACCENT : INK}
      fillOpacity={featured ? 0.12 : 0.05}
      stroke={featured ? ACCENT : INK}
      strokeOpacity={featured ? 0.9 : 0.2}
    />
  )
}

function Rule({ x, y, w, h = 0.75, accent = false }: { x: number; y: number; w: number; h?: number; accent?: boolean }) {
  return <rect x={x} y={y} width={w} height={h} fill={accent ? ACCENT : INK} opacity={accent ? 0.9 : 0.18} />
}

function Dot({ cx, cy, r = 2.5, soft = false }: { cx: number; cy: number; r?: number; soft?: boolean }) {
  return <circle cx={cx} cy={cy} r={r} fill={soft ? INK : ACCENT} opacity={soft ? 0.35 : 1} />
}

function Tick({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x} ${y + 2}l2 2 4-4.5`}
      fill="none"
      stroke={ACCENT}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

/** A picture placeholder: a surface with a small mountain in it. */
function Picture({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2
  const cy = y + h / 2
  return (
    <g>
      <Surface x={x} y={y} w={w} h={h} />
      <rect x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={3} fill="none" stroke={INK} strokeOpacity={0.16} />
      <path d={`M${cx - 7} ${cy + 4}l4.5-5.5 3 3.5 2.5-2.5 4.5 4.5z`} fill={INK} opacity={0.22} />
      <circle cx={cx + 4} cy={cy - 4} r={1.6} fill={INK} opacity={0.22} />
    </g>
  )
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

function structured(layout: LayoutType): ReactNode {
  switch (layout) {
    case 'hero':
      // Centred: a short accent bar, the title, a muted subtitle.
      return (
        <>
          <rect x={72} y={26} width={16} height={2.5} rx={1.25} fill={ACCENT} />
          <Title x={30} y={36} w={100} h={9} />
          <Line x={48} y={53} w={64} />
        </>
      )
    case 'standard':
      // A left accent border beside the content.
      return (
        <>
          <rect x={12} y={12} width={2.5} height={62} rx={1.25} fill={ACCENT} />
          <Title x={21} y={13} />
          {[118, 110, 122, 74].map((w, i) => <Line key={i} x={21} y={28 + i * 9} w={w} />)}
        </>
      )
    case 'standardSplit':
      // Text on the left, the picture on the right.
      return (
        <>
          <Title y={24} w={58} />
          {[62, 56, 60, 40].map((w, i) => <Line key={i} x={12} y={38 + i * 8} w={w} />)}
          <Picture x={84} y={14} w={64} h={62} />
        </>
      )
    case 'statHero':
      // Centred: heading, big figure, its label, a line of text.
      return (
        <>
          <Title x={48} y={14} w={64} />
          <Figure x={56} y={30} w={48} h={16} />
          <Line x={60} y={52} w={40} />
          <Line x={44} y={62} w={72} />
        </>
      )
    case 'statGrid':
      // Equal columns, each under an accent top rule.
      return (
        <>
          <Title />
          {range(3).map((i) => {
            const x = 12 + i * 47
            return (
              <g key={i}>
                <Rule x={x} y={32} w={42} h={1.5} accent />
                <Figure x={x} y={40} w={24} />
                <Line x={x} y={54} w={36} />
                <Line x={x} y={61} w={26} />
              </g>
            )
          })}
        </>
      )
    case 'statList':
      // A ledger: divided rows, the figure in the left third.
      return (
        <>
          <Title />
          {range(3).map((i) => {
            const y = 28 + i * 17
            return (
              <g key={i}>
                {i > 0 && <Rule x={12} y={y - 3} w={136} />}
                <Figure x={12} y={y + 2} w={28} h={7} />
                <Line x={60} y={y + 4} w={78 - i * 10} />
              </g>
            )
          })}
        </>
      )
    case 'timeline':
      // A vertical accent line with a dot per step.
      return (
        <>
          <Title />
          <rect x={15.25} y={28} width={1.5} height={52} fill={ACCENT} opacity={0.4} />
          {range(3).map((i) => {
            const y = 29 + i * 17
            return (
              <g key={i}>
                <Dot cx={16} cy={y + 2} />
                <Label x={24} y={y} w={32} />
                <Line x={24} y={y + 6.5} w={96 - i * 12} />
              </g>
            )
          })}
        </>
      )
    case 'timelineRow':
      // Steps side by side, a rule with a dot over each.
      return (
        <>
          <Title />
          {range(4).map((i) => {
            const x = 12 + i * 35
            return (
              <g key={i}>
                <rect x={x} y={37.25} width={30} height={1.5} fill={ACCENT} opacity={0.4} />
                <Dot cx={x + 2.5} cy={38} />
                <Label x={x} y={47} w={22} />
                <Line x={x} y={55} w={28} />
                <Line x={x} y={61} w={20} />
              </g>
            )
          })}
        </>
      )
    case 'comparison':
      // Side-by-side cards; the first is featured.
      return (
        <>
          <Title />
          {range(2).map((i) => {
            const x = 12 + i * 70
            const featured = i === 0
            return (
              <g key={i}>
                <Outline x={x} y={26} w={66} h={52} featured={featured} />
                {featured ? <Label x={x + 6} y={32} w={28} /> : <Title x={x + 6} y={32} w={28} h={3.5} />}
                {range(3).map((j) => (
                  <g key={j}>
                    <Dot cx={x + 8} cy={45.5 + j * 9} r={1.3} soft={!featured} />
                    <Line x={x + 12} y={44 + j * 9} w={40 - j * 6} />
                  </g>
                ))}
              </g>
            )
          })}
        </>
      )
    case 'comparisonTable':
      // Column headings over an accent rule, ruled cells beneath.
      return (
        <>
          <Title />
          {range(2).map((i) => {
            const x = 12 + i * 70
            return (
              <g key={i}>
                <Title x={x} y={29} w={30} h={3.5} />
                <Rule x={x} y={36} w={66} h={1.5} accent />
                {range(3).map((j) => (
                  <g key={j}>
                    <Line x={x} y={42 + j * 12} w={44 - j * 6} />
                    <Rule x={x} y={49 + j * 12} w={66} />
                  </g>
                ))}
              </g>
            )
          })}
        </>
      )
    case 'iconGrid':
      // Bordered tiles, each with a numbered accent disc.
      return (
        <>
          <Title />
          {range(6).map((i) => {
            const x = 12 + (i % 3) * 46
            const y = 25 + Math.floor(i / 3) * 29
            return (
              <g key={i}>
                <Outline x={x} y={y} w={43} h={26} />
                <Dot cx={x + 8} cy={y + 8} r={3.5} />
                <Line x={x + 5} y={y + 16} w={30} />
              </g>
            )
          })}
        </>
      )
    case 'numberedList':
      // Divided rows, a zero-padded accent number before each.
      return (
        <>
          <Title />
          {range(4).map((i) => {
            const y = 28 + i * 13
            return (
              <g key={i}>
                {i > 0 && <Rule x={12} y={y - 4} w={136} />}
                <Label x={12} y={y} w={8} />
                <Line x={26} y={y + 0.25} w={[96, 82, 104, 70][i]} />
              </g>
            )
          })}
        </>
      )
    case 'checklist':
      // A plain accent tick per row.
      return (
        <>
          <Title />
          {range(4).map((i) => {
            const y = 28 + i * 12
            return (
              <g key={i}>
                <Tick x={12} y={y - 1} />
                <Line x={24} y={y} w={[90, 76, 98, 64][i]} />
              </g>
            )
          })}
        </>
      )
    case 'splitList':
      // Two columns of cells, each under a thin rule, a square accent bullet.
      return (
        <>
          <Title />
          {range(6).map((i) => {
            const x = 12 + (i % 2) * 72
            const y = 28 + Math.floor(i / 2) * 16
            return (
              <g key={i}>
                <Rule x={x} y={y} w={64} />
                <rect x={x} y={y + 5} width={2} height={2} fill={ACCENT} />
                <Line x={x + 6} y={y + 4.5} w={44 - (i % 3) * 8} />
              </g>
            )
          })}
        </>
      )
    case 'quote':
      // Centred: an accent quote mark, italic lines, muted attribution.
      return (
        <>
          <text x={80} y={36} textAnchor="middle" fontSize={26} fontFamily="Georgia, serif" fill={ACCENT}>
            “
          </text>
          <Line x={30} y={38} w={100} h={4} />
          <Line x={38} y={46} w={84} h={4} />
          <Line x={50} y={54} w={60} h={4} />
          <Line x={66} y={65} w={28} />
        </>
      )
    case 'textFocus':
      // A heading over flowing prose.
      return (
        <>
          <Title />
          {[112, 104, 110, 68, 108, 90].map((w, i) => (
            <Line key={i} x={12} y={26 + i * 8 + (i > 3 ? 4 : 0)} w={w} />
          ))}
        </>
      )
    case 'gallery':
      // A grid of square pictures.
      return (
        <>
          <Title />
          {range(3).map((i) => <Picture key={i} x={12 + i * 47} y={28} w={42} h={42} />)}
        </>
      )
    default:
      return null
  }
}

function expressive(layout: LayoutType): ReactNode {
  switch (layout) {
    case 'hero':
      // Left-aligned beside a vertical accent bar.
      return (
        <>
          <rect x={16} y={26} width={3} height={38} rx={1.5} fill={ACCENT} />
          <Title x={27} y={32} w={96} h={9} />
          <Line x={27} y={49} w={64} />
        </>
      )
    case 'standard':
      // The content on one surface.
      return (
        <>
          <Surface x={10} y={10} w={140} h={70} />
          <Title x={18} y={18} />
          {[118, 110, 122, 74].map((w, i) => <Line key={i} x={18} y={33 + i * 9} w={w} />)}
        </>
      )
    case 'standardSplit':
      // The picture on the left, text on the right.
      return (
        <>
          <Picture x={12} y={14} w={64} h={62} />
          <Title x={88} y={24} w={56} />
          {[60, 54, 58, 38].map((w, i) => <Line key={i} x={88} y={38 + i * 8} w={w} />)}
        </>
      )
    case 'statHero':
      // One surface: the figure on the left, heading and text beside it.
      return (
        <>
          <Surface x={10} y={16} w={140} h={58} />
          <Figure x={22} y={30} w={40} h={16} />
          <Line x={22} y={52} w={34} />
          <Title x={76} y={30} w={60} />
          <Line x={76} y={43} w={62} />
          <Line x={76} y={50} w={48} />
        </>
      )
    case 'statGrid':
      // Equal cells on surfaces.
      return (
        <>
          <Title />
          {range(3).map((i) => {
            const x = 12 + i * 47
            return (
              <g key={i}>
                <Surface x={x} y={28} w={42} h={46} />
                <Figure x={x + 6} y={36} w={24} />
                <Line x={x + 6} y={50} w={30} />
                <Line x={x + 6} y={57} w={22} />
              </g>
            )
          })}
        </>
      )
    case 'statList':
      // Ledger rows, each on its own surface.
      return (
        <>
          <Title />
          {range(3).map((i) => {
            const y = 25 + i * 18
            return (
              <g key={i}>
                <Surface x={12} y={y} w={136} h={15} />
                <Figure x={18} y={y + 4} w={26} h={7} />
                <Line x={60} y={y + 6} w={72 - i * 10} />
              </g>
            )
          })}
        </>
      )
    case 'timeline':
      // A card per step with a numbered accent disc.
      return (
        <>
          <Title />
          {range(3).map((i) => {
            const y = 25 + i * 18
            return (
              <g key={i}>
                <Surface x={12} y={y} w={136} h={15} />
                <Dot cx={21} cy={y + 7.5} r={4} />
                <Label x={30} y={y + 3.5} w={30} h={3} />
                <Line x={30} y={y + 9} w={96 - i * 12} />
              </g>
            )
          })}
        </>
      )
    case 'timelineRow':
      // Numbered cards side by side.
      return (
        <>
          <Title />
          {range(4).map((i) => {
            const x = 12 + i * 35
            return (
              <g key={i}>
                <Surface x={x} y={27} w={31} h={48} />
                <Dot cx={x + 8} cy={35} r={4} />
                <Label x={x + 4} y={45} w={20} h={3} />
                <Line x={x + 4} y={53} w={23} />
                <Line x={x + 4} y={59} w={16} />
              </g>
            )
          })}
        </>
      )
    case 'comparison':
      // Stacked, divided rows; the first heading in accent.
      return (
        <>
          <Title />
          {range(2).map((i) => {
            const y = 27 + i * 26
            return (
              <g key={i}>
                {i > 0 && <Rule x={12} y={y - 3} w={136} />}
                {i === 0 ? <Label x={12} y={y} w={32} /> : <Title x={12} y={y} w={32} h={3.5} />}
                {range(2).map((j) => (
                  <g key={j}>
                    <Dot cx={14} cy={y + 10.5 + j * 7} r={1.3} soft={i > 0} />
                    <Line x={18} y={y + 9 + j * 7} w={80 - j * 16} />
                  </g>
                ))}
              </g>
            )
          })}
        </>
      )
    case 'comparisonTable':
      // Filled accent headers over cells on surfaces.
      return (
        <>
          <Title />
          {range(2).map((i) => {
            const x = 12 + i * 70
            return (
              <g key={i}>
                <rect x={x} y={26} width={66} height={10} rx={2} fill={ACCENT} />
                <rect x={x + 4} y={29.5} width={26} height={3} rx={1.5} fill="var(--app-accent-foreground)" opacity={0.9} />
                {range(3).map((j) => (
                  <g key={j}>
                    <Surface x={x} y={37 + j * 13} w={66} h={12} r={0} />
                    <Line x={x + 4} y={41.5 + j * 13} w={42 - j * 6} />
                  </g>
                ))}
              </g>
            )
          })}
        </>
      )
    case 'iconGrid':
      // Wrapping pills tinted with the accent, a numbered disc in each.
      return (
        <>
          <Title />
          {[
            [12, 28, 52],
            [68, 28, 44],
            [116, 28, 32],
            [12, 43, 40],
            [56, 43, 58],
            [12, 58, 48],
          ].map(([x, y, w], i) => (
            <g key={i}>
              <rect x={x} y={y} width={w} height={11} rx={5.5} fill={ACCENT} opacity={0.14} />
              <Dot cx={x + 5.5} cy={y + 5.5} r={3.5} />
              <Line x={x + 12} y={y + 4} w={w - 17} />
            </g>
          ))}
        </>
      )
    case 'numberedList':
      // Numbered cards.
      return (
        <>
          <Title />
          {range(3).map((i) => {
            const y = 25 + i * 18
            return (
              <g key={i}>
                <Surface x={12} y={y} w={136} h={15} />
                <Dot cx={21} cy={y + 7.5} r={4} />
                <Line x={30} y={y + 6} w={[96, 82, 104][i]} />
              </g>
            )
          })}
        </>
      )
    case 'checklist':
      // Cards with a filled accent check.
      return (
        <>
          <Title />
          {range(3).map((i) => {
            const y = 25 + i * 18
            return (
              <g key={i}>
                <Surface x={12} y={y} w={136} h={15} />
                <Dot cx={21} cy={y + 7.5} r={4} />
                <path
                  d={`M18.8 ${y + 7.6}l1.5 1.5 3-3.3`}
                  fill="none"
                  stroke="var(--app-accent-foreground)"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Line x={30} y={y + 6} w={[90, 76, 98][i]} />
              </g>
            )
          })}
        </>
      )
    case 'splitList':
      // Two columns of cards with an accent left edge.
      return (
        <>
          <Title />
          {range(4).map((i) => {
            const x = 12 + (i % 2) * 70
            const y = 26 + Math.floor(i / 2) * 25
            return (
              <g key={i}>
                <Surface x={x} y={y} w={66} h={21} />
                <rect x={x} y={y} width={2.5} height={21} rx={1} fill={ACCENT} />
                <Line x={x + 8} y={y + 7} w={44 - i * 4} />
                <Line x={x + 8} y={y + 12} w={30} />
              </g>
            )
          })}
        </>
      )
    case 'quote':
      // Left-aligned italic lines beside an accent border, attribution below.
      return (
        <>
          <rect x={16} y={24} width={2.5} height={42} rx={1.25} fill={ACCENT} />
          <Line x={26} y={28} w={104} h={4} />
          <Line x={26} y={36} w={96} h={4} />
          <Line x={26} y={44} w={70} h={4} />
          <Line x={26} y={57} w={30} />
        </>
      )
    case 'textFocus':
      // The first paragraph larger, a lede above the prose.
      return (
        <>
          <Title />
          <rect x={12} y={26} width={120} height={4.5} rx={2} fill={INK} opacity={0.5} />
          <rect x={12} y={34} width={86} height={4.5} rx={2} fill={INK} opacity={0.5} />
          {[112, 104, 110, 70].map((w, i) => <Line key={i} x={12} y={46 + i * 8} w={w} />)}
        </>
      )
    case 'gallery':
      // A featured picture beside two stacked ones.
      return (
        <>
          <Title />
          <Picture x={12} y={26} w={66} h={54} />
          <Picture x={82} y={26} w={66} h={25} />
          <Picture x={82} y={55} w={66} h={25} />
        </>
      )
    default:
      return null
  }
}

export function LayoutWireframe({
  layout,
  visualStyle,
  className,
}: {
  layout: LayoutType
  visualStyle: VisualStyle
  className?: string
}) {
  return (
    <svg viewBox="0 0 160 90" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {visualStyle === 'expressive' ? expressive(layout) : structured(layout)}
    </svg>
  )
}
