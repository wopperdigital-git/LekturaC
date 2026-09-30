import type { ReactNode } from 'react'
import type { LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { cardKindLabel, type CardKind, type LayoutVariety } from '@/engine/layoutEngine'
import { LayoutWireframe } from './LayoutWireframe'

/*
  The layout picker, shared by the tools panel's Layout section and the floating
  toolbar's Layout dropdown, so the two can never offer different options.
*/

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent'

const LAYOUT_LABELS: Record<Exclude<LayoutType, 'auto'>, string> = {
  hero: 'Hero',
  statHero: 'Single stat',
  statGrid: 'Stat grid',
  comparison: 'Comparison',
  timeline: 'Timeline',
  quote: 'Quote',
  iconGrid: 'Icon grid',
  numberedList: 'Numbered list',
  checklist: 'Checklist',
  splitList: 'Two-column list',
  statList: 'Stat rows',
  timelineRow: 'Horizontal timeline',
  comparisonTable: 'Comparison table',
  textFocus: 'Text focus',
  gallery: 'Gallery',
  standardSplit: 'Split',
  standard: 'Standard',
}

/** What the layout picker needs, present only while a slide is selected. */
export interface LayoutTools {
  /** Varieties of the card's *own* type — never another type. */
  options: LayoutVariety[]
  active: LayoutType
  activeVisualStyle?: VisualStyle
  onChange: (layout: LayoutType, visualStyle?: VisualStyle) => void
  kind?: CardKind
  /** What the card is *actually* rendering as, with `'auto'` already resolved. */
  resolved?: Exclude<LayoutType, 'auto'>
}

/**
 * The layout picker: a two-column grid of low-fidelity wireframes, one per
 * layout the slide can wear (`LayoutWireframe`) — the shape of the arrangement,
 * not the slide's own words, so the options read at a glance and compare easily.
 * Varieties of the card's own type only (see `layoutVarieties`): offering another
 * type's layouts would let a bullet list be turned into a timeline and come out
 * blank, which is not what "pick a different layout" means. There is no
 * "Automatic" option: a card on 'auto' shows the variety it resolves to as chosen.
 */
export function LayoutGrid({ layout }: { layout: LayoutTools }) {
  const { options } = layout

  // A card still on 'auto' lights the option it is actually drawn as.
  const current = layout.active === 'auto' ? layout.resolved : layout.active

  return (
    <div className="-mx-1 grid grid-cols-2 gap-1.5 px-1 py-1">
      {options.map((variety, i) => {
        // Number restarts per component, so a type with two components reads
        // "Icon grid · 1/2, Numbered list · 1/2" rather than 1..4.
        const ordinal = options.filter((o, j) => o.layout === variety.layout && j <= i).length
        const label = `${LAYOUT_LABELS[variety.layout]} · ${ordinal}`
        return (
          <LayoutOption
            key={`${variety.layout}:${variety.visualStyle}`}
            label={label}
            title={label}
            active={current === variety.layout && layout.activeVisualStyle === variety.visualStyle}
            onClick={() => layout.onChange(variety.layout, variety.visualStyle)}
          >
            <LayoutWireframe
              layout={variety.layout}
              visualStyle={variety.visualStyle}
              className="aspect-video w-full rounded-[4px] bg-app-surface"
            />
          </LayoutOption>
        )
      })}
    </div>
  )
}

function LayoutOption({
  label,
  title,
  active,
  onClick,
  children,
}: {
  label: string
  title: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`flex min-w-0 cursor-pointer flex-col items-stretch gap-1 rounded-[6px] border p-1 text-left transition-colors ${FOCUS_RING} ${
        active ? 'border-app-accent bg-app-accent/10' : 'border-transparent hover:bg-app-foreground/5'
      }`}
    >
      {children}
      <span className="truncate px-0.5 text-[11px] text-app-foreground">{label}</span>
    </button>
  )
}

/**
 * The floating toolbar's Layout dropdown: the slide's type named on top — the
 * picker only offers layouts of that type, so it says which one — then the grid.
 */
export function LayoutMenu({ layout }: { layout: LayoutTools }) {
  return (
    <div className="w-72">
      {layout.kind && (
        <div className="flex items-center justify-between gap-2 border-b border-app-border px-3 py-2">
          <span className="text-[11px] text-app-muted">Layouts for this slide</span>
          <span
            aria-label={`Slide type: ${cardKindLabel(layout.kind)}`}
            className="rounded-full bg-app-accent/15 px-2 py-0.5 text-[11px] font-semibold text-app-accent-text"
          >
            {cardKindLabel(layout.kind)}
          </span>
        </div>
      )}
      <div className="scrollbar-subtle max-h-[60vh] overflow-y-auto p-1">
        <LayoutGrid layout={layout} />
      </div>
    </div>
  )
}
