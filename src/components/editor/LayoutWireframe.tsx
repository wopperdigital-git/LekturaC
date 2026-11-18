import type { CSSProperties, ReactNode } from 'react'
import type { LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { groundOfLayout } from '@/engine/composition'

/*
  A low-fidelity picture of one layout variety for the Layout picker: bars for
  text, tinted rectangles for surfaces, the accent where the real layout puts
  it. Each drawing follows its component's own JSX (`GroupRenderer` for the
  families, the frame components for the rest), both visual treatments — so a
  change to how a layout looks should be mirrored here, or the picker will
  promise one thing and the slide show another.

  App chrome: painted with `app-*` tokens, never the deck's theme. Drawn in a
  160×90 viewBox (16:9) and scaled to the tile.

  The ground follows `groundOfLayout`, as the slide does: the hero is drawn on a
  filled ground with its bars in the page colour (the deep ground swaps text and
  background together), a quote and a stat hero on a faint tint, the rest on the
  tile's own surface.
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

/**
 * A photo that bleeds: it reaches the tile's top, bottom and outer edge (the frame's
 * `bleed`), so it is square and unbordered, a flat block with the same small mountain.
 * `data-wire-photo` names it for the test that pins the bleed.
 */
function BleedPicture({ x, w }: { x: number; w: number }) {
  const cx = x + w / 2
  return (
    <g>
      <rect data-wire-photo="" x={x} y={0} width={w} height={90} fill={INK} opacity={0.12} />
      <path d={`M${cx - 7} 49l4.5-5.5 3 3.5 2.5-2.5 4.5 4.5z`} fill={INK} opacity={0.22} />
      <circle cx={cx + 4} cy={37} r={1.6} fill={INK} opacity={0.22} />
    </g>
  )
}

/** A figure on its own accent panel, with its label in accent-foreground ink. */
function FigurePanel({ x, y, w, h, labelW = 0.55 }: { x: number; y: number; w: number; h: number; labelW?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2.5} fill={ACCENT} />
      <rect x={x + w * 0.14} y={y + h * 0.22} width={w * 0.58} height={h * 0.34} rx={2} fill="var(--app-accent-foreground)" opacity={0.95} />
      <rect x={x + w * 0.14} y={y + h * 0.68} width={w * labelW * 0.9} height={Math.max(2.4, h * 0.1)} rx={1.2} fill="var(--app-accent-foreground)" opacity={0.6} />
    </g>
  )
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/** A stroke-only chevron or arrow in accent, for the steps and the before and after. */
function Chevron({ x, y, name }: { x: number; y: number; name: string }) {
  return (
    <path
      {...{ [name]: '' }}
      d={`M${x} ${y}l3 3-3 3`}
      fill="none"
      stroke={ACCENT}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

/**
 * Two halves and an arrow between them: the first half plain, the second on a filled deep block
 * (`data-wire-after`) whose bars are drawn in the page colour, as `LayoutWireframe` does for a deep
 * ground. Each half is a heading bar over three item rows, a hairline above each when structured, a
 * small accent square before each when expressive.
 */
function BeforeAfterDrawing({ expressive: loud }: { expressive: boolean }) {
  const half = (x: number) => (
    <g>
      <Title x={x + 6} y={33} w={26} h={3.5} />
      {range(3).map((j) => {
        const y = 42 + j * 11
        return (
          <g key={j}>
            {loud ? <rect x={x + 6} y={y + 0.5} width={2.4} height={2.4} fill={ACCENT} /> : <Rule x={x + 6} y={y - 2.5} w={44} />}
            <Line x={x + (loud ? 12 : 6)} y={y} w={(loud ? 34 : 38) - j * 6} h={3.5} />
          </g>
        )
      })}
    </g>
  )
  return (
    <>
      <Title x={12} y={loud ? 11 : 13} w={58} />
      {half(12)}
      <path data-wire-arrow="" d="M72 50h10M79 46l4 4-4 4" fill="none" stroke={ACCENT} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <rect data-wire-after="" x={90} y={26} width={58} height={54} rx={3} fill={INK} opacity={0.88} />
      <g style={{ '--app-foreground': 'var(--app-background)', '--app-accent': 'var(--app-background)' } as CSSProperties}>
        {half(90)}
      </g>
    </>
  )
}

/** Rows of a term (accent, left third) and its meaning (right two thirds), a hairline above each and one below the last. */
function TermRowsDrawing({ expressive: loud }: { expressive: boolean }) {
  return (
    <>
      <Title x={12} y={loud ? 11 : 13} w={58} />
      <g data-wire-term-rows="">
        {range(4).map((i) => {
          const y = 28 + i * 15
          return (
            <g key={i} data-wire-term-row="">
              <Rule x={12} y={y} w={136} />
              <Label x={12} y={y + 4} w={[24, 20, 26, 18][i]} h={loud ? 5 : 4} />
              <Line x={56} y={y + 4.5} w={[84, 72, 88, 60][i]} h={3.5} />
            </g>
          )
        })}
        <Rule x={12} y={88} w={136} />
      </g>
    </>
  )
}

/** A row of numbered steps with a chevron between neighbours, a hairline above each step when structured. */
function StepsDrawing({ expressive: loud }: { expressive: boolean }) {
  return (
    <>
      <Title x={12} y={loud ? 11 : 13} />
      {range(4).map((i) => {
        const x = 12 + i * 35
        return (
          <g key={i} data-wire-step="">
            {!loud && <Rule x={x} y={30} w={29} />}
            <Figure x={x} y={34} w={loud ? 9 : 8} h={4} />
            <Title x={x} y={43} w={22} h={3.5} />
            <Line x={x} y={51} w={28} />
            <Line x={x} y={57} w={20} />
            {i < 3 && <Chevron x={x + 30.5} y={34} name="data-wire-chevron" />}
          </g>
        )
      })}
    </>
  )
}

function structured(layout: LayoutType): ReactNode {
  switch (layout) {
    case 'hero':
      // At the foot, left-aligned: a short accent rule, the title, a muted subtitle at most 62% wide.
      return (
        <>
          <rect x={16} y={48} width={16} height={1.5} fill={ACCENT} />
          <Title x={16} y={55} w={104} h={11} />
          <Line x={16} y={71} w={72} h={3.5} />
        </>
      )
    case 'section':
      // On the deep ground, at the foot: a large accent numeral, a short accent rule, then the title, all on the left edge.
      return (
        <>
          <Figure x={16} y={36} w={26} h={13} />
          <rect x={16} y={54} width={16} height={1.5} fill={ACCENT} />
          <Title x={16} y={61} w={84} h={9} />
        </>
      )
    case 'statement':
      // On the tint, centred vertically: one thick title bar over one thin line.
      return (
        <>
          <Title x={16} y={34} w={104} h={11} />
          <Line x={16} y={51} w={74} h={4} />
        </>
      )
    case 'twoColumn':
      // The title top-left, then the prose in two columns of equal width, the second starting level with the first.
      return (
        <>
          <Title x={12} y={13} w={58} />
          {range(4).map((i) => <Line key={`a${i}`} x={12} y={30 + i * 8} w={[62, 56, 60, 40][i]} />)}
          {range(4).map((i) => <Line key={`b${i}`} x={84} y={30 + i * 8} w={[60, 64, 52, 36][i]} />)}
        </>
      )
    case 'statSplit':
      // On the left two fifths a large accent figure over its label; on the right three fifths ruled numbered rows, a hairline between them, no box.
      return (
        <>
          <Title x={12} y={13} w={58} />
          <g data-wire-figure=""><Figure x={12} y={32} w={44} h={22} /></g>
          <Line x={12} y={60} w={40} h={3.5} />
          <g data-wire-rows="">
            {range(3).map((i) => {
              const y = 30 + i * 15
              return (
                <g key={i}>
                  {i > 0 && <Rule x={68} y={y - 4} w={80} />}
                  <Label x={68} y={y} w={7} h={4} />
                  <Line x={82} y={y + 0.5} w={[58, 50, 62][i]} h={3.5} />
                </g>
              )
            })}
          </g>
        </>
      )
    case 'photoList':
      // Text on the left half: the title, then ruled numbered rows; the picture bleeding off the other half's top, bottom and outer edge (the side alternates down the deck; the first slide's is drawn).
      return (
        <>
          <Title x={12} y={13} w={58} />
          <g data-wire-rows="">
            {range(3).map((i) => {
              const y = 30 + i * 15
              return (
                <g key={i}>
                  {i > 0 && <Rule x={12} y={y - 4} w={62} />}
                  <Label x={12} y={y} w={7} h={4} />
                  <Line x={24} y={y + 0.5} w={[46, 40, 48][i]} h={3.5} />
                </g>
              )
            })}
          </g>
          <BleedPicture x={84} w={76} />
        </>
      )
    case 'termRows':
      // Ruled rows: the term in accent on the left third, its meaning on the right, a hairline above each row and below the last.
      return <TermRowsDrawing expressive={false} />
    case 'steps':
      // A row of numbered steps across the slide, each under a hairline, a chevron between neighbours.
      return <StepsDrawing expressive={false} />
    case 'beforeAfter':
      // A plain half, an arrow, then a half on a filled deep block.
      return <BeforeAfterDrawing expressive={false} />
    case 'standard':
      // The heading, then the content below it, no border or fill.
      return (
        <>
          <Title x={12} y={13} />
          {[118, 110, 122, 74].map((w, i) => <Line key={i} x={12} y={28 + i * 9} w={w} />)}
        </>
      )
    case 'imageFocus':
      // The picture bleeds off the left, top and bottom edges, about three fifths wide; the heading tops the text column beside it, then the caption.
      return (
        <>
          <BleedPicture x={0} w={100} />
          <Title x={110} y={14} w={38} />
          {[38, 34, 36, 24].map((w, i) => <Line key={i} x={110} y={28 + i * 8} w={w} />)}
        </>
      )
    case 'standardSplit':
      // Text on one half, the heading at its top, the picture bleeding off the other half's top, bottom and outer edge (the side alternates down the deck; the first slide's is drawn).
      return (
        <>
          <Title y={14} w={58} />
          {[62, 56, 60, 40].map((w, i) => <Line key={i} x={12} y={28 + i * 8} w={w} />)}
          <BleedPicture x={84} w={76} />
        </>
      )
    case 'statHero':
      // Centred: heading, a very large figure in accent, its label at lead size, a line of text.
      return (
        <>
          <Title x={48} y={12} w={64} />
          <Figure x={47} y={25} w={66} h={24} />
          <Line x={54} y={54} w={52} h={3.5} />
          <Line x={42} y={65} w={76} />
        </>
      )
    case 'statGrid':
      // Equal columns, each under a hairline in accent: the figure large over its label.
      return (
        <>
          <Title />
          {range(3).map((i) => {
            const x = 12 + i * 47
            return (
              <g key={i}>
                <Rule x={x} y={30} w={42} h={0.75} accent />
                <Figure x={x} y={35} w={36} h={18} />
                <Line x={x} y={59} w={38} />
                <Line x={x} y={66} w={26} />
              </g>
            )
          })}
        </>
      )
    case 'statList':
      // A ledger: a hairline between rows, the figure left-aligned on the heading's edge in the first quarter, its label beside it.
      return (
        <>
          <Title />
          {range(3).map((i) => {
            const y = 28 + i * 17
            return (
              <g key={i}>
                {i > 0 && <Rule x={12} y={y - 3} w={136} />}
                <Figure x={12} y={y + 2} w={26} h={8} />
                <Line x={52} y={y + 4} w={84 - i * 10} h={3.5} />
              </g>
            )
          })}
        </>
      )
    case 'timeline':
      // One continuous track down the left edge, a small dot per step, the label over its text.
      return (
        <>
          <Title />
          <rect data-wire-track="" x={15.25} y={26} width={1.5} height={52} fill={ACCENT} opacity={0.4} />
          {range(3).map((i) => {
            const y = 29 + i * 17
            return (
              <g key={i}>
                <Dot cx={16} cy={y + 2} r={2} />
                <Label x={24} y={y} w={32} />
                <Line x={24} y={y + 6.5} w={96 - i * 12} />
              </g>
            )
          })}
        </>
      )
    case 'timelineRow':
      // Steps side by side on one full-width track, a dot at each column's left edge.
      return (
        <>
          <Title />
          <rect data-wire-track="" x={12} y={37.25} width={136} height={1.5} fill={ACCENT} opacity={0.4} />
          {range(4).map((i) => {
            const x = 12 + i * 35
            return (
              <g key={i}>
                <Dot cx={x + 2} cy={38} r={2} />
                <Label x={x} y={47} w={22} />
                <Line x={x} y={55} w={28} />
                <Line x={x} y={61} w={20} />
              </g>
            )
          })}
        </>
      )
    case 'comparison':
      // Equal columns: the first group on the tint panel with its heading in accent, the rest bare. A hairline above each item.
      return (
        <>
          <Title />
          <Surface x={12} y={26} w={66} h={52} />
          {range(2).map((i) => {
            const x = 12 + i * 70
            return (
              <g key={i}>
                {i === 0 ? <Label x={x + 6} y={32} w={28} /> : <Title x={x + 6} y={32} w={28} h={3.5} />}
                {range(3).map((j) => (
                  <g key={j}>
                    <Rule x={x + 6} y={40 + j * 12} w={54} />
                    <Line x={x + 6} y={44 + j * 12} w={44 - j * 6} />
                  </g>
                ))}
              </g>
            )
          })}
        </>
      )
    case 'comparisonTable':
      // Column headings over an accent rule, the first in accent text; a hairline under each cell, no panel.
      return (
        <>
          <Title />
          {range(2).map((i) => {
            const x = 12 + i * 70
            return (
              <g key={i}>
                {i === 0 ? <Label x={x} y={29} w={30} /> : <Title x={x} y={29} w={30} h={3.5} />}
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
      // Columns under a hairline: a big accent numeral at the top, the text at the foot of the column. No box.
      return (
        <>
          <Title />
          {range(3).map((i) => {
            const x = 12 + i * 47
            return (
              <g key={i}>
                <Rule x={x} y={29} w={42} />
                <Figure x={x} y={35} w={24} h={14} />
                <Line x={x} y={66} w={36} />
                <Line x={x} y={73} w={26} />
              </g>
            )
          })}
        </>
      )
    case 'numberedList':
      // Ruled rows: a big accent numeral in its own column, the text beside it.
      return (
        <>
          <Title />
          {range(4).map((i) => {
            const y = 28 + i * 13
            return (
              <g key={i}>
                {i > 0 && <Rule x={12} y={y - 3} w={136} />}
                <Label x={12} y={y} w={12} h={6} />
                <Line x={36} y={y + 1.5} w={[96, 82, 104, 70][i]} />
              </g>
            )
          })}
        </>
      )
    case 'checklist':
      // Ruled rows: a plain accent tick in the numeral's column, the text beside it.
      return (
        <>
          <Title />
          {range(4).map((i) => {
            const y = 28 + i * 13
            return (
              <g key={i}>
                {i > 0 && <Rule x={12} y={y - 3} w={136} />}
                <Tick x={13} y={y - 0.5} />
                <Line x={36} y={y + 1.5} w={[90, 76, 98, 64][i]} />
              </g>
            )
          })}
        </>
      )
    case 'splitList':
      // Two columns of rows with a hairline between them, a small square accent marker before each.
      return (
        <>
          <Title />
          {range(6).map((i) => {
            const x = 12 + (i % 2) * 72
            const y = 28 + Math.floor(i / 2) * 16
            return (
              <g key={i}>
                {i > 1 && <Rule x={x} y={y} w={64} />}
                <rect x={x} y={y + 6.5} width={3} height={3} fill={ACCENT} />
                <Line x={x + 10} y={y + 6.5} w={44 - (i % 3) * 8} />
              </g>
            )
          })}
        </>
      )
    case 'quote':
      // Left-aligned: the heading, an accent quote mark, regular lines at most 85% wide, then a rule and a small attribution.
      return (
        <>
          <Title x={16} y={9} w={56} h={5} />
          <text x={14} y={38} fontSize={26} fontFamily="Georgia, serif" fill={ACCENT}>
            {'“'}
          </text>
          <Line x={16} y={42} w={104} h={4} />
          <Line x={16} y={50} w={86} h={4} />
          <Line x={16} y={58} w={58} h={4} />
          <Rule x={16} y={70.5} w={8} h={1.5} accent />
          <Line x={28} y={69.5} w={26} h={3} />
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
      // As the structured one with a larger title, and one big accent circle bleeding past the top-right corner.
      return (
        <>
          <circle cx={148} cy={2} r={36} fill={ACCENT} opacity={0.3} />
          <rect x={16} y={45} width={16} height={1.5} fill={ACCENT} />
          <Title x={16} y={52} w={116} h={14} />
          <Line x={16} y={71} w={72} h={3.5} />
        </>
      )
    case 'section':
      // As the structured one with a heavier title: the numeral is the same size in both treatments, as in the JSX.
      return (
        <>
          <Figure x={16} y={36} w={26} h={13} />
          <rect x={16} y={52} width={16} height={1.5} fill={ACCENT} />
          <Title x={16} y={59} w={92} h={11} />
        </>
      )
    case 'statement':
      // On the tint, centred vertically: a heavier title bar over one thin line.
      return (
        <>
          <Title x={16} y={32} w={112} h={13} />
          <Line x={16} y={51} w={78} h={4} />
        </>
      )
    case 'twoColumn':
      // As the structured one with a larger title and a little more air between the lines, the columns still level.
      return (
        <>
          <Title x={12} y={14} w={64} />
          {range(4).map((i) => <Line key={`a${i}`} x={12} y={32 + i * 9} w={[62, 56, 60, 40][i]} />)}
          {range(4).map((i) => <Line key={`b${i}`} x={84} y={32 + i * 9} w={[60, 64, 52, 36][i]} />)}
        </>
      )
    case 'statSplit':
      // A heavier, larger accent figure on the left; the rows on the right separated by space alone, no hairlines.
      return (
        <>
          <Title x={12} y={14} w={64} />
          <g data-wire-figure=""><Figure x={12} y={30} w={50} h={26} /></g>
          <Line x={12} y={62} w={42} h={3.5} />
          <g data-wire-rows="">
            {range(3).map((i) => {
              const y = 31 + i * 15
              return (
                <g key={i}>
                  <Label x={68} y={y} w={8} h={5} />
                  <Line x={84} y={y + 1} w={[56, 48, 60][i]} h={3.5} />
                </g>
              )
            })}
          </g>
        </>
      )
    case 'photoList':
      // As the structured one with a larger title, the rows separated by space alone, the picture bleeding off the other half.
      return (
        <>
          <Title x={12} y={14} w={60} />
          <g data-wire-rows="">
            {range(3).map((i) => {
              const y = 31 + i * 15
              return (
                <g key={i}>
                  <Label x={12} y={y} w={8} h={5} />
                  <Line x={26} y={y + 1} w={[44, 38, 46][i]} h={3.5} />
                </g>
              )
            })}
          </g>
          <BleedPicture x={84} w={76} />
        </>
      )
    case 'termRows':
      // The same rows with a larger, heavier term.
      return <TermRowsDrawing expressive={true} />
    case 'steps':
      // The same row, bare and heavier, a chevron between neighbours.
      return <StepsDrawing expressive={true} />
    case 'beforeAfter':
      // The same two halves with an accent square before each item and no rules.
      return <BeforeAfterDrawing expressive={true} />
    case 'standard':
      // The lead heading, then the content below it.
      return (
        <>
          <Title x={12} y={15} w={64} />
          {[126, 118, 130, 80].map((w, i) => <Line key={i} x={12} y={34 + i * 10} w={w} />)}
        </>
      )
    case 'imageFocus':
      // The picture bleeds off the left, top and bottom edges, about three fifths wide, with no frame of its own (the accent outline is only the stacked photo's); the heading tops the text column beside it, then the caption.
      return (
        <>
          <BleedPicture x={0} w={100} />
          <Title x={110} y={14} w={38} />
          {[38, 34, 36, 24].map((w, i) => <Line key={i} x={110} y={30 + i * 8} w={w} />)}
        </>
      )
    case 'standardSplit':
      // The lead heading at the top of the text on one half, the picture bleeding off the other half's top, bottom and outer edge.
      return (
        <>
          <Title x={12} y={14} w={60} />
          {[60, 54, 58, 38].map((w, i) => <Line key={i} x={12} y={30 + i * 8} w={w} />)}
          <BleedPicture x={84} w={76} />
        </>
      )
    case 'statHero':
      // The figure on its own accent panel, heading and text beside it.
      return (
        <>
          <FigurePanel x={12} y={20} w={64} h={50} />
          <Title x={88} y={30} w={58} />
          <Line x={88} y={43} w={58} />
          <Line x={88} y={50} w={46} />
        </>
      )
    case 'statGrid':
      // Bare columns: no rule and no fill (a stat grid has no accent owner), the figure in
      // heavy accent ink, larger than the structured one, over its label.
      return (
        <>
          <Title x={12} y={11} />
          {range(3).map((i) => {
            const x = 12 + i * 47
            return (
              <g key={i}>
                <Figure x={x} y={30} w={41} h={22} />
                <Line x={x} y={59} w={38} />
                <Line x={x} y={66} w={26} />
              </g>
            )
          })}
        </>
      )
    case 'statList':
      // Ledger rows separated by space alone: no surface and no rule, each figure in heavy accent
      // ink, left-aligned on the heading's edge in the first quarter, its label beside it.
      return (
        <>
          <Title x={12} y={11} />
          {range(3).map((i) => {
            const y = 27 + i * 18
            return (
              <g key={i}>
                <Figure x={12} y={y + 1} w={30} h={11} />
                <Line x={52} y={y + 4.5} w={80 - i * 10} h={3.5} />
              </g>
            )
          })}
        </>
      )
    case 'timeline':
      // A thicker track down the left edge with the step number on it, the label over its text.
      return (
        <>
          <Title x={12} y={11} />
          <rect data-wire-track="" x={14.5} y={26} width={3} height={52} fill={ACCENT} opacity={0.4} />
          {range(3).map((i) => {
            const y = 28 + i * 17
            return (
              <g key={i}>
                <rect x={13} y={y} width={6} height={5.5} rx={1.2} fill={ACCENT} />
                <Label x={26} y={y} w={30} h={3} />
                <Line x={26} y={y + 6.5} w={96 - i * 12} />
              </g>
            )
          })}
        </>
      )
    case 'timelineRow':
      // One thicker full-width track, a large step number above each label.
      return (
        <>
          <Title x={12} y={11} />
          <rect data-wire-track="" x={12} y={28} width={136} height={3} fill={ACCENT} opacity={0.4} />
          {range(4).map((i) => {
            const x = 12 + i * 35
            return (
              <g key={i}>
                <rect x={x} y={34} width={9} height={10} rx={1.5} fill={ACCENT} />
                <Label x={x} y={49} w={22} h={3} />
                <Line x={x} y={57} w={28} />
                <Line x={x} y={63} w={20} />
              </g>
            )
          })}
        </>
      )
    case 'comparison':
      // Equal columns: the first group on the tint panel with its heading in accent, the rest bare. A small accent square before each item, no rules.
      return (
        <>
          <Title x={12} y={11} />
          <Surface x={12} y={26} w={66} h={52} />
          {range(2).map((i) => {
            const x = 12 + i * 70
            return (
              <g key={i}>
                {i === 0 ? <Label x={x + 6} y={32} w={28} /> : <Title x={x + 6} y={32} w={28} h={3.5} />}
                {range(3).map((j) => (
                  <g key={j}>
                    <rect x={x + 6} y={42.5 + j * 11} width={2.4} height={2.4} fill={ACCENT} />
                    <Line x={x + 12} y={42 + j * 11} w={40 - j * 6} h={3.5} />
                  </g>
                ))}
              </g>
            )
          })}
        </>
      )
    case 'comparisonTable':
      // The first column on the tint panel with its heading in accent; every heading over an accent rule, a hairline under each cell.
      return (
        <>
          <Title x={12} y={11} />
          <Surface x={12} y={26} w={66} h={54} />
          {range(2).map((i) => {
            const x = 12 + i * 70
            return (
              <g key={i}>
                {i === 0 ? <Label x={x + 4} y={29.5} w={26} /> : <Title x={x + 4} y={29.5} w={26} h={3.5} />}
                <Rule x={x} y={36} w={66} h={1.5} accent />
                {range(3).map((j) => (
                  <g key={j}>
                    <Line x={x + 4} y={42 + j * 12} w={42 - j * 6} />
                    <Rule x={x} y={49 + j * 12} w={66} />
                  </g>
                ))}
              </g>
            )
          })}
        </>
      )
    case 'iconGrid':
      // Columns: a bigger accent numeral at the top, the text at the foot of the column. No rule, no box.
      return (
        <>
          <Title x={12} y={11} />
          {range(3).map((i) => {
            const x = 12 + i * 47
            return (
              <g key={i}>
                <Figure x={x} y={30} w={30} h={18} />
                <Line x={x} y={66} w={38} h={3.5} />
                <Line x={x} y={73} w={28} />
              </g>
            )
          })}
        </>
      )
    case 'numberedList':
      // Rows: a big accent numeral, the text beside it, only space between rows. No box.
      return (
        <>
          <Title x={12} y={11} />
          {range(4).map((i) => {
            const y = 26 + i * 14
            return (
              <g key={i}>
                <Figure x={12} y={y} w={14} h={9} />
                <Line x={38} y={y + 3} w={[96, 82, 104, 70][i]} h={3.5} />
              </g>
            )
          })}
        </>
      )
    case 'checklist':
      // Rows: an accent tick in an unfilled ring, the text beside it. No box.
      return (
        <>
          <Title x={12} y={11} />
          {range(4).map((i) => {
            const y = 26 + i * 14
            return (
              <g key={i}>
                <circle cx={18} cy={y + 4.5} r={4.5} fill="none" stroke={ACCENT} strokeWidth={1.2} />
                <Tick x={15} y={y + 2.2} />
                <Line x={34} y={y + 3} w={[90, 76, 98, 64][i]} h={3.5} />
              </g>
            )
          })}
        </>
      )
    case 'splitList':
      // Two columns of rows, an accent numeral before each, only space between rows.
      return (
        <>
          <Title x={12} y={11} />
          {range(6).map((i) => {
            const x = 12 + (i % 2) * 70
            const y = 27 + Math.floor(i / 2) * 18
            return (
              <g key={i}>
                <Label x={x} y={y + 1} w={8} h={5} />
                <Line x={x + 14} y={y + 2} w={44 - (i % 3) * 8} />
              </g>
            )
          })}
        </>
      )
    case 'quote':
      // The heading, a larger accent quote mark, semibold lines at most 85% wide, then a rule and a small attribution.
      return (
        <>
          <Title x={16} y={9} w={56} h={5} />
          <text x={14} y={40} fontSize={32} fontFamily="Georgia, serif" fill={ACCENT}>
            {'“'}
          </text>
          <Line x={16} y={44} w={108} h={5} />
          <Line x={16} y={53} w={90} h={5} />
          <Line x={16} y={62} w={62} h={5} />
          <Rule x={16} y={74.5} w={8} h={1.5} accent />
          <Line x={28} y={73.5} w={26} h={3} />
        </>
      )
    case 'textFocus':
      // The first paragraph larger, a lede above the prose.
      return (
        <>
          <Title x={12} y={11} />
          <rect x={12} y={26} width={120} height={4.5} rx={2} fill={INK} opacity={0.5} />
          <rect x={12} y={34} width={86} height={4.5} rx={2} fill={INK} opacity={0.5} />
          {[112, 104, 110, 70].map((w, i) => <Line key={i} x={12} y={46 + i * 8} w={w} />)}
        </>
      )
    case 'gallery':
      // A featured picture beside two stacked ones.
      return (
        <>
          <Title x={12} y={11} />
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
  const ground = layout === 'auto' ? 'plain' : groundOfLayout(layout)
  const drawing = visualStyle === 'expressive' ? expressive(layout) : structured(layout)
  return (
    <svg viewBox="0 0 160 90" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {ground === 'deep' ? (
        <>
          <rect data-wire-ground="deep" x={0} y={0} width={160} height={90} fill={INK} opacity={0.88} />
          {/* The bars read the same two custom properties as everywhere else, so on the deep ground they
              are re-pointed to the page colour: ink and ground swap, and the accent bar becomes ink too. */}
          <g style={{ '--app-foreground': 'var(--app-background)', '--app-accent': 'var(--app-background)' } as CSSProperties}>
            {drawing}
          </g>
        </>
      ) : (
        <>
          {ground === 'tint' && (
            <rect data-wire-ground="tint" x={0} y={0} width={160} height={90} fill={ACCENT} opacity={0.1} />
          )}
          {drawing}
        </>
      )}
    </svg>
  )
}
