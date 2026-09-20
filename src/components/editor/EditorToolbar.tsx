import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  COLOR_CHOICES,
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
import {
  MAX_RUN_SCALE,
  MIN_RUN_SCALE,
  RUN_SCALE_STEP,
  clampRunScale,
  type FlagMarkType,
  type MarkValue,
  type ValueMarkType,
} from '@/engine/marks'
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/zoom'
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
  presentHref,
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
  onAddItem,
  onRemove,
  removeLabel,
  zoom,
  onZoomChange,
  markState,
  onToggleMark,
  runValues,
  onRunValue,
  hasTextSelection,
  activeAlign,
}: {
  level?: ToolbarLevel
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** Where Present goes. When given, the button sits between Undo and Redo. */
  presentHref?: string
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
  /** Levels 2 and 3: appends an item to the list being worked on. Absent when there is no list to grow. */
  onAddItem?: () => void
  /** Levels 2 and 3: removes the selected element, or the selected item of a list. Absent when nothing is selected. */
  onRemove?: () => void
  removeLabel?: string
  /** How large the canvas is drawn, as a multiple of natural size. With `onZoomChange`, shows the zoom controls. */
  zoom?: number
  /** Called with the requested zoom; the page clamps it. `null` asks for the default. */
  onZoomChange?: (zoom: number | null, direction?: 1 | -1) => void
  /** Level 3: whether the current character selection is fully bold / italic. */
  markState?: { bold: boolean; italic: boolean; underline: boolean }
  /** Level 3: toggles a mark over the current character selection. */
  onToggleMark?: (type: FlagMarkType) => void
  /**
   * Level 3, with characters selected: what the selection currently is, for the
   * font, size and colour controls. `null` for a value the selection's first
   * character does not have. Read only while `hasTextSelection` is true.
   */
  runValues?: { fontFamily: string | null; fontScale: number | null; color: string | null }
  /**
   * Level 3, with characters selected: sets or, with `null`, clears a value on
   * the selected characters. When there is a selection, font, size and colour go
   * here instead of to the element — a selection is the narrowest scope there is,
   * and the tools always act on the narrowest thing selected.
   */
  onRunValue?: (type: ValueMarkType, value: MarkValue | null) => void
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
  /*
    Font, size and colour act on the narrowest thing selected. With characters
    selected that is the characters — a value mark on the run — and otherwise the
    element, card or deck as before. Alignment has no character scope (it belongs
    to a whole paragraph), so it never takes this route.
  */
  const onRun = level === 3 && hasTextSelection === true && onRunValue !== undefined
  const scale = onRun ? (runValues?.fontScale ?? 1) : (textStyle.fontScale ?? 1)
  const activeFont = onRun ? (runValues?.fontFamily ?? '') : (textStyle.fontFamily ?? '')
  const activeColor = onRun ? (runValues?.color ?? '') : (textStyle.color ?? '')
  const minScale = onRun ? MIN_RUN_SCALE : MIN_FONT_SCALE
  const maxScale = onRun ? MAX_RUN_SCALE : MAX_FONT_SCALE

  function stepScale(direction: 1 | -1) {
    if (onRun) {
      // Back at 100% is "no override", not a stored 1 — so the mark goes away.
      const next = clampRunScale(scale + direction * RUN_SCALE_STEP)
      onRunValue?.('fontScale', next === 1 ? null : next)
      return
    }
    onTextStyleChange({ fontScale: clampFontScale(scale + direction * FONT_SCALE_STEP) })
  }

  function setFont(fontFamily: string | null) {
    if (onRun) onRunValue?.('fontFamily', fontFamily)
    else onTextStyleChange({ fontFamily })
  }

  function setColor(color: string | null) {
    if (onRun) onRunValue?.('color', color)
    else onTextStyleChange({ color })
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

      {/*
        Present sits between Undo and Redo — the middle of the bar's first group —
        as a bare triangle, styled like the tools around it: no fill, and only a
        hover tint. It is a link, not a button, because it navigates; the label
        and tooltip say what the triangle does.
      */}
      {presentHref && (
        <Link
          to={presentHref}
          aria-label="Present"
          title="Present this deck"
          className="flex size-8 shrink-0 items-center justify-center rounded-app-sm text-app-foreground/90 transition-colors hover:bg-app-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent"
        >
          <PlayIcon />
        </Link>
      )}

      <ToolButton
        label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <UndoIcon flip />
      </ToolButton>

      <Divider />

      <FontPicker value={activeFont} onChange={setFont} selection={onRun} />

      <Divider />

      <ToolButton
        label="Decrease font size"
        onClick={() => stepScale(-1)}
        disabled={scale <= minScale}
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
        disabled={scale >= maxScale}
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
      <ToolButton
        label="Underline"
        pressed={level === 3 ? markState?.underline === true : textStyle.underline === true}
        disabled={level === 3 && !hasTextSelection}
        title={
          level === 3 && !hasTextSelection ? 'Select some text to format it' : 'Underline (Ctrl+U)'
        }
        onClick={() =>
          level === 3
            ? onToggleMark?.('underline')
            : onTextStyleChange({ underline: textStyle.underline ? null : true })
        }
      >
        <UnderlineIcon />
      </ToolButton>

      <ColorPicker value={activeColor} onChange={setColor} selection={onRun} />

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

      {level !== 1 && onAddItem && (
        <>
          <Divider />
          <button
            type="button"
            // Never takes focus, for the same reason `ToolButton` does not: from
            // inside a run it would blur the run and end the edit before the
            // click landed.
            onMouseDown={(e) => e.preventDefault()}
            onClick={onAddItem}
            title="Add an item to this list"
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-app-sm px-2 text-xs text-app-foreground/90 transition-colors hover:bg-app-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent"
          >
            <PlusIcon />
            Add item
          </button>
        </>
      )}

      {level !== 1 && onRemove && (
        <>
          <Divider />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemove}
            title={`${removeLabel ?? 'Remove'} (Backspace)`}
            className="flex h-8 shrink-0 cursor-pointer items-center rounded-app-sm px-2 text-xs text-app-foreground/90 transition-colors hover:bg-app-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent"
          >
            {removeLabel ?? 'Remove'}
          </button>
        </>
      )}

      {zoom !== undefined && onZoomChange && (
        <>
          <Divider />
          <ToolButton
            label="Zoom out"
            title="Zoom out (Ctrl+scroll down)"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => onZoomChange(null, -1)}
          >
            <ZoomIcon direction="out" />
          </ToolButton>
          {/* Also the way back: clicking the figure returns to 100%, the same as
              every editor whose zoom readout is a button. */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onZoomChange(1)}
            title="Reset zoom to 100%"
            aria-label={`Zoom ${Math.round(zoom * 100)}% — reset to 100%`}
            className="h-8 w-11 shrink-0 cursor-pointer rounded-app-sm text-center text-xs tabular-nums text-app-foreground/90 transition-colors hover:bg-app-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolButton
            label="Zoom in"
            title="Zoom in (Ctrl+scroll up)"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => onZoomChange(null, 1)}
          >
            <ZoomIcon direction="in" />
          </ToolButton>
        </>
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
  const { open, setOpen, ref } = useDropdown()

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
          <MenuOption
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
              <MenuOption
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

function MenuOption({
  label,
  active,
  onClick,
  style,
}: {
  label: string
  active: boolean
  onClick: () => void
  /** Lets an option preview itself — the font picker sets each row in its own typeface. */
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      // Never takes focus: a choice made for selected characters needs the run to
      // still be the focused element when the click lands.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={style}
      className={`block w-full cursor-pointer rounded-app-sm px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
        active ? 'bg-app-accent/20 text-app-accent-text' : 'text-app-foreground hover:bg-app-surface'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Open/closed state for a toolbar dropdown, and the two ways out of it.
 *
 * Closes on an outside press or Escape. The listeners are registered only while
 * open, so the toolbar is not holding document listeners for a menu nobody
 * opened. Shared by every dropdown in the bar so they cannot drift apart on
 * something as easy to get subtly wrong as dismissal.
 */
function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      // Escape closed a menu; it must not also step the slide's selection back.
      // The page's own Escape handler is on `window`, after this one, and stands
      // down for a key that has already been claimed.
      e.preventDefault()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return { open, setOpen, ref }
}

/**
 * The font picker.
 *
 * A menu built like the layout picker beside it — same trigger, same panel, same
 * option rows — rather than a native `<select>`, whose popup is drawn by the
 * operating system and looks like a different application dropped into the bar.
 *
 * Each option is set in its own typeface, so the list is a specimen: choosing a
 * font by name alone meant picking blind and undoing. "Theme font" is first and
 * is not a font but the absence of one — it hands the text back to whatever the
 * deck's theme says, which is the state every element starts in.
 *
 * `value` is the stored font stack, or `''` for none; `onChange` gets `null` to
 * clear it, matching how the rest of the toolbar clears an override.
 */
function FontPicker({
  value,
  onChange,
  selection = false,
}: {
  value: string
  onChange: (fontFamily: string | null) => void
  /** True while the choice will go to the selected characters rather than the element. */
  selection?: boolean
}) {
  const { open, setOpen, ref } = useDropdown()

  const current = FONT_CHOICES.find((font) => font.value === value)
  // A stack that is not one of ours (an older deck, or a hand-edited row) still
  // gets a label and a preview rather than reading as "Theme font".
  const label = value === '' ? 'Theme font' : (current?.label ?? 'Custom')

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        // Never takes focus, for the same reason `ToolButton` does not: the
        // caret and selection inside a live run must survive the click.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Font — ${label}`}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Font — ${label}`}
        className={`flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-app-sm px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
          open ? 'bg-app-accent/20 text-app-accent-text' : 'text-app-foreground/90 hover:bg-app-foreground/10'
        }`}
      >
        <span className="w-20 truncate text-left" style={value ? { fontFamily: value } : undefined}>
          {label}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 min-w-44 rounded-app border border-app-border bg-app-background p-1 shadow-app"
        >
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-app-muted">
            {selection ? 'Font · selected text' : 'Font'}
          </p>
          <MenuOption
            label="Theme font"
            active={value === ''}
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
          />
          {FONT_CHOICES.map((font) => (
            <MenuOption
              key={font.value}
              label={font.label}
              active={value === font.value}
              style={{ fontFamily: font.value }}
              onClick={() => {
                onChange(font.value)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The text colour picker.
 *
 * Built like the font and layout pickers beside it. "Theme colour" is first and
 * is the absence of a colour, not one: it hands the text back to whatever the
 * deck's theme says, which is how every element starts and what keeps following
 * the theme when it changes. The swatches are fixed hexes, so a colour somebody
 * picked stays that colour across a theme switch; the native colour input at the
 * end covers everything else.
 *
 * `value` is the stored `#rrggbb`, or `''` for none; `onChange` gets `null` to
 * clear it, like the rest of the toolbar.
 */
function ColorPicker({
  value,
  onChange,
  selection = false,
}: {
  value: string
  onChange: (color: string | null) => void
  /** True while the choice will go to the selected characters rather than the element. */
  selection?: boolean
}) {
  const { open, setOpen, ref } = useDropdown()
  const label = value === '' ? 'Theme colour' : (COLOR_CHOICES.find((c) => c.value === value)?.label ?? value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Text colour — ${label}`}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Text colour — ${label}`}
        className={`flex size-8 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-app-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
          open ? 'bg-app-accent/20 text-app-accent-text' : 'text-app-foreground/90 hover:bg-app-foreground/10'
        }`}
      >
        <span className="text-sm font-bold leading-none">A</span>
        {/* The bar under the letter is the picked colour; with none picked it
            is the text colour, so it reads as "no override" rather than as a
            colour of its own. */}
        <span
          aria-hidden="true"
          className="h-[3px] w-4 rounded-full"
          style={{ backgroundColor: value || 'currentColor' }}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 w-48 rounded-app border border-app-border bg-app-background p-1 shadow-app"
        >
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-app-muted">
            {selection ? 'Text colour · selected text' : 'Text colour'}
          </p>
          <MenuOption
            label="Theme colour"
            active={value === ''}
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
          />
          <div className="grid grid-cols-6 gap-1.5 px-2 py-2">
            {COLOR_CHOICES.map((color) => (
              <button
                key={color.value}
                type="button"
                role="menuitemradio"
                aria-checked={value === color.value}
                aria-label={color.label}
                title={color.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(color.value)
                  setOpen(false)
                }}
                className={`size-6 cursor-pointer rounded-full border transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
                  value === color.value ? 'border-app-accent ring-2 ring-app-accent/40' : 'border-app-border'
                }`}
                style={{ backgroundColor: color.value }}
              />
            ))}
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-app-sm px-2 py-1.5 text-xs text-app-foreground hover:bg-app-surface">
            Custom…
            <input
              type="color"
              aria-label="Custom text colour"
              value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#3b82f6'}
              onChange={(e) => onChange(e.target.value)}
              className="size-6 cursor-pointer rounded border border-app-border bg-transparent p-0"
            />
          </label>
        </div>
      )}
    </div>
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
function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
      <path d="M6 4.2v11.6a.6.6 0 0 0 .92.5l9-5.8a.6.6 0 0 0 0-1l-9-5.8A.6.6 0 0 0 6 4.2Z" />
    </svg>
  )
}

function UnderlineIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M6 4v5.5a4 4 0 0 0 8 0V4M4.5 16.5h11" />
    </svg>
  )
}

function ZoomIcon({ direction }: { direction: 'in' | 'out' }) {
  return (
    <svg {...strokeProps}>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="M12.5 12.5L16.5 16.5" />
      <path d={direction === 'in' ? 'M6.5 8.5h4M8.5 6.5v4' : 'M6.5 8.5h4'} />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      {...strokeProps}
      className={`size-3 shrink-0 text-app-muted transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  )
}

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
