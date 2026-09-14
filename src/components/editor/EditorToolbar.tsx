import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  FONT_CHOICES,
  FONT_SCALE_STEP,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  TEXT_ALIGNMENTS,
  clampFontScale,
  type TextAlign,
  type TextStyle,
} from '@/engine/textStyle'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { LayoutType } from '@/engine/contentBlocks'
import { cardKindLabel, type CardKind, type LayoutVariety } from '@/engine/layoutEngine'
import type { VisualStyle } from '@/engine/contentBlocks'

/*
  The floating editing toolbar.

  Three levels, driven by what is selected on the canvas:
    1 — nothing selected: tools apply deck-wide.
    2 — a card selected: tools apply to that card, plus a layout picker.
    3 — a text box selected: tools apply to the text, no layout picker.

  The formatting controls are identical across all three levels by design —
  what changes is the *scope* they write to, not the buttons — so they live in
  one row every level renders. Level 1 writes to the deck, Level 2 to the
  selected card, or to the selected element once there is one.

  Bold and italic are the exception at Level 3: they apply to the *selected
  characters* rather than the whole run, so the parent hands down their pressed
  state (`markState`) instead of it being read off a TextStyle. Font, size and
  alignment stay whole-element there, which is how every editor treats them —
  per-character alignment is not a thing, and neither is half a word in Georgia.
  So Level 3 leaves those three on the element scope rather than narrowing them
  to the run: see `typographyRef` in EditorPage.

  Deliberately app-chrome, not deck-theme: it follows the light/dark toggle and
  uses `app-*` tokens, because it is a tool sitting above the deck rather than
  part of it. Giving it the deck's theme would make it restyle itself every time
  the user previewed a different one.

  Undo/redo lead the bar at every level and are the one pair whose scope never
  changes with the selection: the history stack is the deck's, so what they undo
  is the last edit made anywhere. They sit here rather than in `TopBar` because
  the toolbar is where editing verbs live — a user reaching for undo looks at
  the tools, not at the deck-title strip.
*/

export type ToolbarLevel = 1 | 2 | 3

export function EditorToolbar({
  level = 1,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  textStyle,
  onTextStyleChange,
  themeName,
  onOpenThemes,
  themesOpen,
  layoutOptions,
  activeLayout,
  activeVisualStyle,
  onLayoutChange,
  cardKind,
  resolvedLayout,
  onChangeCardType,
  markState,
  onToggleMark,
  hasTextSelection,
  activeAlign,
}: {
  level?: ToolbarLevel
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  textStyle: TextStyle
  onTextStyleChange: (patch: Partial<Record<keyof TextStyle, TextStyle[keyof TextStyle] | null>>) => void
  themeName: ThemeTokens['name']
  onOpenThemes: () => void
  themesOpen: boolean
  /** Level 2 only: the varieties of this card's *own* type — never another type. */
  layoutOptions?: LayoutVariety[]
  activeLayout?: LayoutType
  activeVisualStyle?: VisualStyle
  onLayoutChange?: (layout: LayoutType, visualStyle?: VisualStyle) => void
  cardKind?: CardKind
  /**
   * What the card is *actually* rendering as, with `'auto'` already resolved by the
   * classifier. The picker names it beside Automatic, so "Automatic" stops
   * being the one option that does not say what it does.
   */
  resolvedLayout?: Exclude<LayoutType, 'auto'>
  /** Level 2: opens the card type picker for the selected card. */
  onChangeCardType?: () => void
  /** Level 3: whether the current character selection is fully bold / italic. */
  markState?: { bold: boolean; italic: boolean }
  /** Level 3: toggles a mark over the current character selection. */
  onToggleMark?: (type: 'bold' | 'italic') => void
  /** Level 3: true while there is a non-empty character selection to format. */
  hasTextSelection?: boolean
  /**
   * The alignment the selected element is *rendering* with, whatever set it.
   *
   * Supplied only when an element is selected, and it takes precedence over the
   * stored value so the lit button always matches the slide. An element nobody
   * has aligned has no stored `align`, which would otherwise leave all three
   * buttons dark while its text plainly sat centred — the confusion this
   * exists to remove.
   */
  activeAlign?: TextAlign | null
}) {
  const scale = textStyle.fontScale ?? 1
  const activeFont = textStyle.fontFamily ?? ''

  function stepScale(direction: 1 | -1) {
    onTextStyleChange({ fontScale: clampFontScale(scale + direction * FONT_SCALE_STEP) })
  }

  return (
    <div
      role="toolbar"
      aria-label={`Formatting tools (level ${level})`}
      /*
        `supports-[backdrop-filter]` guard: without a backdrop blur the 75%
        alpha alone leaves the deck's artwork legible straight through the bar
        and the icons stop being readable, so browsers without it get a nearly
        opaque surface instead.
      */
      className="pointer-events-auto flex items-center gap-1 rounded-app border border-white/10 bg-app-background/95 px-2 py-1.5 shadow-app supports-[backdrop-filter]:bg-app-background/70 supports-[backdrop-filter]:backdrop-blur-md dark:border-white/10"
    >
      <ToolButton
        label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <UndoIcon />
      </ToolButton>
      <ToolButton
        label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <UndoIcon flip />
      </ToolButton>

      <Divider />

      <select
        aria-label="Font style"
        value={activeFont}
        onChange={(e) => onTextStyleChange({ fontFamily: e.target.value || null })}
        className="h-8 cursor-pointer rounded-app-sm bg-transparent px-1.5 text-xs text-app-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent"
      >
        <option value="">Theme font</option>
        {FONT_CHOICES.map((font) => (
          <option key={font.value} value={font.value}>
            {font.label}
          </option>
        ))}
      </select>

      <Divider />

      <ToolButton
        label="Decrease font size"
        onClick={() => stepScale(-1)}
        disabled={scale <= MIN_FONT_SCALE}
      >
        <MinusIcon />
      </ToolButton>
      {/* Shown as a percentage because the underlying value is a multiplier over
          the theme's scale, not a point size — see engine/textStyle.ts. */}
      <span className="w-11 text-center text-xs tabular-nums text-app-foreground/90">
        {Math.round(scale * 100)}%
      </span>
      <ToolButton
        label="Increase font size"
        onClick={() => stepScale(1)}
        disabled={scale >= MAX_FONT_SCALE}
      >
        <PlusIcon />
      </ToolButton>

      <Divider />

      <ToolButton
        label="Bold"
        pressed={level === 3 ? markState?.bold === true : textStyle.bold === true}
        // Level 3 needs characters selected to have something to mark; the
        // other levels always have a scope (the card, or the deck).
        disabled={level === 3 && !hasTextSelection}
        title={
          level === 3 && !hasTextSelection ? 'Select some text to format it' : undefined
        }
        onClick={() =>
          level === 3
            ? onToggleMark?.('bold')
            : onTextStyleChange({ bold: textStyle.bold ? null : true })
        }
      >
        <BoldIcon />
      </ToolButton>
      <ToolButton
        label="Italic"
        pressed={level === 3 ? markState?.italic === true : textStyle.italic === true}
        disabled={level === 3 && !hasTextSelection}
        title={
          level === 3 && !hasTextSelection ? 'Select some text to format it' : undefined
        }
        onClick={() =>
          level === 3
            ? onToggleMark?.('italic')
            : onTextStyleChange({ italic: textStyle.italic ? null : true })
        }
      >
        <ItalicIcon />
      </ToolButton>

      <Divider />

      {TEXT_ALIGNMENTS.map((align) => (
        <ToolButton
          key={align}
          label={`Align ${align}`}
          // What is rendering wins over what is stored; the stored value is the
          // fallback for the card and deck scopes, which have no element to read.
          pressed={(activeAlign ?? textStyle.align) === align}
          /*
            Always sets, never clears. Re-clicking the lit button used to clear
            the override back to whatever was inherited — invisible once the
            highlight reflects the rendered alignment, because clearing an
            explicit centre usually falls back to centre and the button stays
            lit, so the click reads as broken. Word, PowerPoint and Figma all
            just set.
          */
          onClick={() => onTextStyleChange({ align })}
        >
          <AlignIcon align={align} />
        </ToolButton>
      ))}

      {/* Level 3 edits text inside one box, where "which layout is this card"
          is not a question that applies. */}
      {level !== 3 && (
        <>
          <Divider />
          <ToolButton label={`Theme: ${themeName}`} pressed={themesOpen} onClick={onOpenThemes}>
            <ThemeIcon />
          </ToolButton>
        </>
      )}

      {level === 2 && layoutOptions && onLayoutChange && (
        <LayoutPicker
          options={layoutOptions}
          activeLayout={activeLayout ?? 'auto'}
          activeVisualStyle={activeVisualStyle}
          onChange={onLayoutChange}
          kind={cardKind}
          resolvedLayout={resolvedLayout}
        />
      )}

      {level === 2 && onChangeCardType && (
        <ToolButton
          label="Change slide type"
          title="Change slide type"
          onClick={onChangeCardType}
        >
          <SwapIcon />
        </ToolButton>
      )}
    </div>
  )
}

const LAYOUT_LABELS: Record<Exclude<LayoutType, 'auto'>, string> = {
  hero: 'Hero',
  statHero: 'Single stat',
  statGrid: 'Stat grid',
  comparison: 'Comparison',
  timeline: 'Timeline',
  quote: 'Quote',
  iconGrid: 'Icon grid',
  numberedList: 'Numbered list',
  textFocus: 'Text focus',
  gallery: 'Gallery',
  standardSplit: 'Split',
  standard: 'Standard',
}

/**
 * Level 2's layout picker.
 *
 * `options` are varieties of the card's *own* type only — see
 * `layoutVarieties`. Offering another type's layouts would let a user turn a
 * bullet list into a timeline and get a blank slide, and is not what "pick a
 * different layout" means for a slide that already is what it is.
 *
 * Each component contributes its treatments as numbered entries ("Hero · 1",
 * "Hero · 2"), so the numbering is the variety and the name is the type.
 *
 * "Automatic" is always first and is not a variety: it hands the card back to
 * the rule-based classifier, which is the state every card starts in.
 */
function LayoutPicker({
  options,
  activeLayout,
  activeVisualStyle,
  onChange,
  kind,
  resolvedLayout,
}: {
  options: LayoutVariety[]
  activeLayout: LayoutType
  activeVisualStyle?: VisualStyle
  onChange: (layout: LayoutType, visualStyle?: VisualStyle) => void
  kind?: CardKind
  resolvedLayout?: Exclude<LayoutType, 'auto'>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on an outside click or Escape. Registered only while open so the
  // toolbar isn't holding document listeners for a menu nobody opened.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      {/*
        The trigger names the selected card's type rather than being one more
        anonymous glyph. Which kind of slide you are standing on decides what
        this menu can offer — a bullet list is never going to list quote
        layouts — so the type is the label, and the icon alone left the user to
        infer it from the menu contents after opening it.
      */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-label={kind ? `Layout — ${cardKindLabel(kind)} slide` : 'Layout'}
        aria-expanded={open}
        aria-haspopup="menu"
        title={
          resolvedLayout
            ? `${kind ? cardKindLabel(kind) + ' slide' : 'Layout'} — ${LAYOUT_LABELS[resolvedLayout]}`
            : 'Layout'
        }
        className={`flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-app-sm px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
          open ? 'bg-app-accent/20 text-app-accent-text' : 'text-app-foreground/90 hover:bg-app-foreground/10'
        }`}
      >
        <LayoutIcon />
        {kind && <span className="max-w-24 truncate">{cardKindLabel(kind)}</span>}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 min-w-44 rounded-app border border-app-border bg-app-background p-1 shadow-app"
        >
          {kind && (
            <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-app-muted">
              {cardKindLabel(kind)} layouts
            </p>
          )}
          {/* Naming the resolved layout is what makes Automatic legible: it is
              otherwise the only option that does not say what the slide will
              look like, and it is the state nearly every card is in. */}
          <LayoutOption
            label={
              resolvedLayout && activeLayout === 'auto'
                ? `Automatic · ${LAYOUT_LABELS[resolvedLayout]}`
                : 'Automatic'
            }
            active={activeLayout === 'auto'}
            onClick={() => {
              onChange('auto')
              setOpen(false)
            }}
          />
          {options.map((variety, i) => {
            // Number restarts per component, so a type with two components
            // reads "Icon grid · 1/2, Numbered list · 1/2" rather than 1..4.
            const ordinal =
              options.filter((o, j) => o.layout === variety.layout && j <= i).length
            return (
              <LayoutOption
                key={`${variety.layout}:${variety.visualStyle}`}
                label={`${LAYOUT_LABELS[variety.layout]} · ${ordinal}`}
                active={
                  activeLayout === variety.layout && activeVisualStyle === variety.visualStyle
                }
                onClick={() => {
                  onChange(variety.layout, variety.visualStyle)
                  setOpen(false)
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function LayoutOption({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={`block w-full cursor-pointer rounded-app-sm px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
        active ? 'bg-app-accent/20 text-app-accent-text' : 'text-app-foreground hover:bg-app-surface'
      }`}
    >
      {label}
    </button>
  )
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-app-foreground/15" />
}

/**
 * One icon button.
 *
 * Icons sit at 90% of the foreground colour, which is the token that already
 * flips with the light/dark toggle — so they are always the near-opposite of
 * the bar's own translucent background without hardcoding either side.
 */
function ToolButton({
  label,
  onClick,
  children,
  pressed,
  disabled,
  title,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  pressed?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      /*
        Never take focus, and this is what makes Bold work at all.

        Level 3 formats the *character selection* inside a contentEditable run.
        Pressing a button moves focus to it, which collapses that selection and
        fires the run's `onBlur` — so `textRange` was already null by the time
        the click handler read it, and the toggle silently did nothing (the
        button had even re-rendered as disabled by then). Preventing the default
        on mousedown leaves focus, caret and selection exactly where the user
        put them.
      */
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-app-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed
          ? 'bg-app-accent/20 text-app-accent-text'
          : 'text-app-foreground/90 hover:bg-app-foreground/10'
      }`}
    >
      {children}
    </button>
  )
}

/* Icons are inline SVG rather than a font or an icon package: five glyphs is
   well under the weight of a dependency, and `currentColor` lets the 90%
   opacity above drive them without a second colour to keep in sync. */

const strokeProps = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'size-4',
}

/* One glyph for both directions — redo is the same arrow mirrored, which is how
   every editor draws the pair and keeps them unmistakably a pair. */
function UndoIcon({ flip }: { flip?: boolean }) {
  return (
    <svg {...strokeProps} style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M4 9h8.5a3.5 3.5 0 0 1 0 7H8" />
      <path d="M7 5.5 3.5 9 7 12.5" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M4.5 10h11" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  )
}

function BoldIcon() {
  return (
    <svg {...strokeProps} strokeWidth={1.9}>
      <path d="M6.5 4h4.75a2.75 2.75 0 0 1 0 5.5H6.5zM6.5 9.5h5.25a3.25 3.25 0 0 1 0 6.5H6.5z" />
    </svg>
  )
}

function ItalicIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M12.5 4h-4M11.5 16h-4M11 4 9 16" />
    </svg>
  )
}

function AlignIcon({ align }: { align: TextAlign }) {
  // Short lines shift to the aligned edge; long lines stay full width. That
  // contrast is what makes the three icons readable apart at 16px.
  const short = { left: 'M4 13h7', center: 'M6.5 13h7', right: 'M9 13h7' }[align]
  const shortTop = { left: 'M4 7h7', center: 'M6.5 7h7', right: 'M9 7h7' }[align]
  return (
    <svg {...strokeProps}>
      <path d="M4 4h12" />
      <path d={shortTop} />
      <path d="M4 10h12" />
      <path d={short} />
    </svg>
  )
}

function ThemeIcon() {
  return (
    <svg {...strokeProps}>
      <circle cx="10" cy="10" r="6.25" />
      <path d="M10 3.75v12.5" />
      <path d="M16.25 10H10" />
    </svg>
  )
}

/* Two arrows trading places — the card keeps its words, its shape is swapped. */
function SwapIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M4 7.5h9.5M11 5l2.5 2.5L11 10" />
      <path d="M16 12.5H6.5M9 10l-2.5 2.5L9 15" />
    </svg>
  )
}

function LayoutIcon() {
  return (
    <svg {...strokeProps}>
      <rect x="3.5" y="4" width="13" height="12" rx="1.5" />
      <path d="M3.5 8.5h13M9 8.5V16" />
    </svg>
  )
}
