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
  type TextStylePatch,
} from '@/engine/textStyle'
import type { Card, LayoutType, VisualStyle } from '@/engine/contentBlocks'
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
import { CONTENT_OPTIONS, type ContentType } from '@/engine/newContent'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { ThemeStrip } from '@/components/theme/ThemeStrip'
import { SlidePreview } from './SlidePreview'

/*
  The editing tools, docked at the right of the canvas.

  Modelled on Figma's properties panel (its "Design" tab), which solves the same
  problem — one panel, many kinds of selection — and is what people already know:

  - **Sections follow the selection.** Figma shows the properties of whatever
    kind of layer is selected and page-level settings when nothing is. Here the
    same three scopes (deck, slide, element) decide which sections appear: Layout
    and Content only exist once a slide is selected; Typography and Fill are
    always there and write to the narrowest thing selected.
  - **A fixed order, top to bottom:** Layout → Content → Typography → Fill →
    Theme. Figma's own is Alignment → Layout → Text → Fill → Stroke → Effects →
    Export; structure first, then type, then colour, then the ambient settings.
  - **Section chrome:** a short sentence-case title on the left, and on the right
    either muted context ("Selected element") or a small action button (the "+"
    on Content), separated from the next section by a hairline.
  - **Typography in Figma's order:** font (full width), then size, then the
    style and alignment icon groups; Figma's "Fill" is where a text layer's colour
    lives, so it is called Fill here too.
  - **Controls:** filled inputs with no border until hover or focus, icon-led
    segmented groups where the selected option is a raised chip, and a short
    caption above each field. Every icon-only control carries a tooltip naming
    it, with its shortcut where it has one.
  - **The header holds what is not a property:** undo/redo and Present, then a
    "Design" tab row with the zoom on the right, where Figma keeps its zoom.

  Deliberately app chrome, not deck theme: it follows the light/dark toggle and
  uses `app-*` tokens, because it is a tool sitting beside the deck rather than
  part of it. (The previews inside it are the deck's own theme on purpose — they
  are pictures of slides.)

  Every button refuses focus on mousedown. Formatting applies to the *character
  selection* inside a contentEditable run, and a button that took focus would
  collapse it and blur the run before the click landed. The inputs (size, zoom
  and the colour swatch) are the exceptions, since they have to take focus to be
  used; the run's last reported selection survives that, which is how a size
  typed for three selected letters still reaches those three.
*/

export type ToolbarLevel = 1 | 2 | 3

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
  /** The card the previews are drawn from, and whether it opens the deck. */
  card: Card
  isFirstCard: boolean
}

/* The one place the panel's field chrome is defined. Filled, no border until it is
   hovered or focused — which is how Figma's inputs read as part of the panel rather
   than as boxes dropped into it. */
const FIELD =
  'flex h-7 items-center rounded-[5px] bg-app-foreground/[0.06] text-[11px] text-app-foreground transition-colors hover:bg-app-foreground/10 focus-within:bg-app-background focus-within:ring-1 focus-within:ring-app-accent'

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent'

export function ToolsPanel({
  level,
  scopeLabel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  presentHref,
  textStyle,
  onTextStyleChange,
  onFontPreview,
  markState,
  onToggleMark,
  runValues,
  onRunValue,
  hasTextSelection,
  activeAlign,
  layout,
  onAddContent,
  theme,
  deckTextStyle,
  onThemeChange,
  zoom,
  onZoomChange,
}: {
  level: ToolbarLevel
  /** Plain words for what the text tools are writing to right now. */
  scopeLabel: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  presentHref?: string
  textStyle: TextStyle
  onTextStyleChange: (patch: TextStylePatch) => void
  /**
   * Called with a font while the pointer is over it, and with `undefined` when it
   * leaves — the page shows the font on the slide without storing it. `null`
   * previews the theme's own font.
   */
  onFontPreview: (fontFamily: string | null | undefined) => void
  /** Level 3: whether the current character selection is fully bold / italic / underlined. */
  markState?: { bold: boolean; italic: boolean; underline: boolean }
  onToggleMark?: (type: FlagMarkType) => void
  /** Level 3, with characters selected: what the selection currently is. `null` where its first character has none. */
  runValues?: { fontFamily: string | null; fontScale: number | null; color: string | null }
  /** Level 3, with characters selected: sets or, with `null`, clears a value on them. */
  onRunValue?: (type: ValueMarkType, value: MarkValue | null) => void
  hasTextSelection?: boolean
  /** The alignment the selected element is *rendering* with, whatever set it. */
  activeAlign?: TextAlign | null
  /** Present while a slide is selected. */
  layout?: LayoutTools
  /** Present while a slide is selected: appends one element of the chosen type to it. */
  onAddContent?: (type: ContentType) => void
  theme: ThemeTokens
  deckTextStyle: TextStyle
  onThemeChange: (theme: ThemeTokens) => void
  zoom: number
  /** The requested zoom, or `null` with a direction to step it; the page clamps. */
  onZoomChange: (zoom: number | null, direction?: 1 | -1) => void
}) {
  /*
    Font, size and colour act on the narrowest thing selected. With characters
    selected that is the characters — a value mark on the run — and otherwise the
    element, card or deck. Alignment has no character scope (it belongs to a whole
    paragraph), so it never takes this route.
  */
  const onRun = level === 3 && hasTextSelection === true && onRunValue !== undefined
  const scale = onRun ? (runValues?.fontScale ?? 1) : (textStyle.fontScale ?? 1)
  const activeFont = onRun ? (runValues?.fontFamily ?? '') : (textStyle.fontFamily ?? '')
  const activeColor = onRun ? (runValues?.color ?? '') : (textStyle.color ?? '')
  const minScale = onRun ? MIN_RUN_SCALE : MIN_FONT_SCALE
  const maxScale = onRun ? MAX_RUN_SCALE : MAX_FONT_SCALE
  const step = onRun ? RUN_SCALE_STEP : FONT_SCALE_STEP

  function setScale(next: number) {
    if (onRun) {
      // Back at 100% is "no override", not a stored 1 — so the mark goes away.
      const clamped = clampRunScale(next)
      onRunValue?.('fontScale', clamped === 1 ? null : clamped)
      return
    }
    onTextStyleChange({ fontScale: clampFontScale(next) })
  }

  function setFont(fontFamily: string | null) {
    if (onRun) onRunValue?.('fontFamily', fontFamily)
    else onTextStyleChange({ fontFamily })
  }

  function setColor(color: string | null) {
    if (onRun) onRunValue?.('color', color)
    else onTextStyleChange({ color })
  }

  // Bold, italic and underline need characters selected at Level 3 to have
  // something to mark; the other levels always have a scope (the card, or the deck).
  const markDisabled = level === 3 && !hasTextSelection
  const markHint = markDisabled ? 'Select some text to format it' : undefined
  const scope = scopeLabel.charAt(0).toUpperCase() + scopeLabel.slice(1)

  return (
    <div
      role="region"
      aria-label="Design"
      className="flex h-full flex-col overflow-hidden rounded-app border border-app-border bg-app-background shadow-app"
    >
      {/* What is not a property lives above the sections and never scrolls away:
          history and Present, then the tab row with the zoom on its right. */}
      <div className="shrink-0">
        <div className="flex items-center gap-0.5 px-2 pt-2">
          <IconButton label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon />
          </IconButton>
          <IconButton label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
            <UndoIcon flip />
          </IconButton>
          {presentHref && (
            // A link, not a button, because it navigates.
            <Link
              to={presentHref}
              title="Present this deck"
              className={`ml-auto flex h-7 items-center gap-1.5 rounded-[5px] bg-app-accent px-2.5 text-[11px] font-semibold text-white transition-colors hover:brightness-110 ${FOCUS_RING}`}
            >
              <PlayIcon />
              Present
            </Link>
          )}
        </div>

        <div className="flex items-center justify-between border-b border-app-border px-3">
          {/* The one tab. Styled as the selected tab so the panel reads the way
              Figma's does; there is no second tab to switch to. */}
          <span className="-mb-px flex h-9 items-center border-b-2 border-app-foreground text-[11px] font-semibold text-app-foreground">
            Design
          </span>
          <div className="flex items-center gap-0.5">
            <IconButton
              small
              label="Zoom out"
              title="Zoom out (Ctrl+scroll down)"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => onZoomChange(null, -1)}
            >
              <MinusIcon />
            </IconButton>
            <PercentField
              compact
              label="Zoom"
              value={zoom}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              onCommit={(next) => onZoomChange(next)}
            />
            <IconButton
              small
              label="Zoom in"
              title="Zoom in (Ctrl+scroll up)"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => onZoomChange(null, 1)}
            >
              <PlusIcon />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        {layout && (
          <Section title="Layout" meta={layout.kind ? cardKindLabel(layout.kind) : undefined}>
            <LayoutStrip layout={layout} theme={theme} deckTextStyle={deckTextStyle} />
          </Section>
        )}

        {onAddContent && <ContentSection onPick={onAddContent} />}

        <Section title="Typography" meta={scope}>
          <Caption>{onRun ? 'Font · selected text' : 'Font'}</Caption>
          <FontPicker value={activeFont} onChange={setFont} onPreview={onFontPreview} />

          <div className="mt-2.5 grid grid-cols-[1fr_auto] items-end gap-2">
            <div>
              <Caption>{onRun ? 'Size · selected text' : 'Size'}</Caption>
              {/* A size is a multiple of the theme's own scale, not a point size:
                  setting an absolute size would flatten the theme's heading and
                  body steps into one number. So it reads as a percentage. */}
              <PercentField
                prefix={<span aria-hidden="true" className="text-[10px] font-semibold">Aa</span>}
                label="Font size"
                value={scale}
                min={minScale}
                max={maxScale}
                onCommit={setScale}
              />
            </div>
            <Segmented label="Change size">
              <SegButton
                label="Decrease font size"
                disabled={scale <= minScale}
                onClick={() => setScale(scale - step)}
              >
                <SizeIcon direction="down" />
              </SegButton>
              <SegButton
                label="Increase font size"
                disabled={scale >= maxScale}
                onClick={() => setScale(scale + step)}
              >
                <SizeIcon direction="up" />
              </SegButton>
            </Segmented>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div>
              <Caption>Style</Caption>
              <Segmented label="Text style">
                <SegButton
                  label="Bold"
                  title={markHint ?? 'Bold (Ctrl+B)'}
                  pressed={level === 3 ? markState?.bold === true : textStyle.bold === true}
                  disabled={markDisabled}
                  onClick={() =>
                    level === 3
                      ? onToggleMark?.('bold')
                      : onTextStyleChange({ bold: textStyle.bold ? null : true })
                  }
                >
                  <BoldIcon />
                </SegButton>
                <SegButton
                  label="Italic"
                  title={markHint ?? 'Italic (Ctrl+I)'}
                  pressed={level === 3 ? markState?.italic === true : textStyle.italic === true}
                  disabled={markDisabled}
                  onClick={() =>
                    level === 3
                      ? onToggleMark?.('italic')
                      : onTextStyleChange({ italic: textStyle.italic ? null : true })
                  }
                >
                  <ItalicIcon />
                </SegButton>
                <SegButton
                  label="Underline"
                  title={markHint ?? 'Underline (Ctrl+U)'}
                  pressed={level === 3 ? markState?.underline === true : textStyle.underline === true}
                  disabled={markDisabled}
                  onClick={() =>
                    level === 3
                      ? onToggleMark?.('underline')
                      : onTextStyleChange({ underline: textStyle.underline ? null : true })
                  }
                >
                  <UnderlineIcon />
                </SegButton>
              </Segmented>
            </div>
            <div>
              <Caption>Alignment</Caption>
              <Segmented label="Text alignment">
                {TEXT_ALIGNMENTS.map((align) => (
                  <SegButton
                    key={align}
                    label={`Align ${align}`}
                    // What is rendering wins over what is stored; the stored value
                    // is the fallback for the card and deck scopes, which have no
                    // element to read. Always sets, never clears: re-clicking a lit
                    // button used to clear it, which read as broken once the
                    // highlight followed the rendered alignment.
                    pressed={(activeAlign ?? textStyle.align) === align}
                    onClick={() => onTextStyleChange({ align })}
                  >
                    <AlignIcon align={align} />
                  </SegButton>
                ))}
              </Segmented>
            </div>
          </div>
        </Section>

        <Section
          title="Fill"
          meta={onRun ? 'Selected text' : undefined}
          actions={
            activeColor !== '' && (
              <IconButton
                small
                label="Remove fill"
                title="Remove fill — use the theme colour"
                onClick={() => setColor(null)}
              >
                <MinusIcon />
              </IconButton>
            )
          }
        >
          <FillPicker value={activeColor} onChange={setColor} />
        </Section>

        <Section title="Theme" icon={<BrushIcon />}>
          <ThemeStrip theme={theme} onSelect={onThemeChange} />
        </Section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ structure --- */

/**
 * One section of the panel: a title, optional context or actions on its right, a
 * hairline above it, and the controls below. The same rhythm every time — that
 * regularity, more than any one control, is what makes Figma's panel scannable.
 */
function Section({
  title,
  icon,
  meta,
  actions,
  children,
}: {
  title: string
  icon?: ReactNode
  /** Muted context on the right: what this section is currently about. */
  meta?: string
  /** Small action buttons on the right, after the context. */
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="border-t border-app-border px-3 py-2.5 first:border-t-0">
      <div className="flex h-7 items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-app-foreground">
          {icon}
          {title}
        </h3>
        <div className="flex min-w-0 items-center gap-1">
          {meta && <span className="truncate text-[11px] text-app-muted">{meta}</span>}
          {actions}
        </div>
      </div>
      {children && <div className="mt-1.5">{children}</div>}
    </section>
  )
}

/** The short label above a field. */
function Caption({ children }: { children: ReactNode }) {
  return <p className="mb-1 truncate text-[11px] text-app-muted">{children}</p>
}

/* --------------------------------------------------------------- inputs --- */

/**
 * A number entered as a percentage, committed on Enter or when it loses focus.
 *
 * The value is a multiple (1 = 100%), held as text while it is being typed so a
 * half-typed "1" on the way to "120" is not clamped and rewritten under the
 * caret. Anything that is not a number reverts to what it was; a number outside
 * `min`/`max` is handed up as typed and the caller's own clamp decides — the same
 * clamp the step buttons go through, so all routes agree on the range.
 */
function PercentField({
  label,
  value,
  min,
  max,
  onCommit,
  prefix,
  compact,
}: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (next: number) => void
  /** An icon or letter inside the field, before the value — how Figma names a field without a caption. */
  prefix?: ReactNode
  /** A narrow, borderless variant for the header. */
  compact?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  // Escape must abandon the draft, but blurring the field is what commits it —
  // so the abandon is remembered for the blur that follows.
  const abandon = useRef(false)

  function commit() {
    if (abandon.current) {
      abandon.current = false
      setDraft(null)
      return
    }
    if (draft !== null) {
      const parsed = Number.parseFloat(draft.replace('%', ''))
      if (Number.isFinite(parsed)) onCommit(parsed / 100)
    }
    setDraft(null)
  }

  return (
    <label className={`${FIELD} ${compact ? 'h-6 w-14 gap-0.5 px-1.5' : 'gap-1.5 px-2'}`}>
      {prefix && <span className="shrink-0 text-app-muted">{prefix}</span>}
      <input
        type="text"
        inputMode="numeric"
        aria-label={`${label} (${Math.round(min * 100)}–${Math.round(max * 100)}%)`}
        value={draft ?? String(Math.round(value * 100))}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            abandon.current = true
            e.currentTarget.blur()
          }
        }}
        className={`min-w-0 flex-1 bg-transparent tabular-nums outline-none ${compact ? 'text-right' : ''}`}
      />
      <span aria-hidden="true" className="shrink-0 text-app-muted">
        %
      </span>
    </label>
  )
}

/**
 * A tray of icon buttons, the selected one raised as a chip — Figma's segmented
 * control. Used for both the exclusive group (alignment) and the independent
 * toggles (bold, italic, underline); `aria-pressed` on each button carries which.
 */
function Segmented({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-7 items-center gap-0.5 rounded-[5px] bg-app-foreground/[0.06] p-0.5"
    >
      {children}
    </div>
  )
}

function SegButton({
  label,
  title,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string
  title?: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      // Never take focus — see the note at the top of the file.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      className={`flex h-6 min-w-7 flex-1 cursor-pointer items-center justify-center rounded-[4px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING} ${
        pressed
          ? 'bg-app-background text-app-foreground shadow-sm ring-1 ring-app-border'
          : 'text-app-foreground/70 hover:text-app-foreground'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * The font list, open in the flow of the panel rather than floating over it.
 *
 * A popup would be clipped by the panel's own scroll area; expanding in place
 * cannot be. Each row is set in its own typeface, so the list is a specimen, and
 * hovering a row *previews* it on the slide — `onPreview` is told the font on the
 * way in and `undefined` on the way out — before anything is committed. The
 * current choice carries a tick, as in Figma's font list. "Theme font" is first
 * and is not a font but the absence of one: it hands the text back to whatever the
 * deck's theme says, which is how every element starts.
 *
 * `value` is the stored font stack, or `''` for none; `onChange` gets `null` to
 * clear it, matching how the rest of the panel clears an override.
 */
function FontPicker({
  value,
  onChange,
  onPreview,
}: {
  value: string
  onChange: (fontFamily: string | null) => void
  onPreview: (fontFamily: string | null | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const current = FONT_CHOICES.find((font) => font.value === value)
  // A stack that is not one of ours (an older deck, or a hand-edited row) still
  // gets a label and a preview rather than reading as "Theme font".
  const label = value === '' ? 'Theme font' : (current?.label ?? 'Custom')

  // Leaving the panel mid-hover must not strand the preview on the slide.
  const stop = useRef(onPreview)
  useEffect(() => {
    stop.current = onPreview
  })
  useEffect(() => () => stop.current(undefined), [])

  function pick(fontFamily: string | null) {
    onChange(fontFamily)
    onPreview(undefined)
    setOpen(false)
  }

  return (
    <div>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setOpen((v) => !v)
          onPreview(undefined)
        }}
        aria-expanded={open}
        aria-label={`Font — ${label}`}
        title={`Font — ${label}`}
        className={`${FIELD} w-full cursor-pointer justify-between gap-2 px-2 ${FOCUS_RING} ${
          open ? 'bg-app-background ring-1 ring-app-accent' : ''
        }`}
      >
        <span className="truncate" style={value ? { fontFamily: value } : undefined}>
          {label}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          role="menu"
          onPointerLeave={() => onPreview(undefined)}
          className="mt-1 rounded-[5px] border border-app-border bg-app-background p-1 shadow-app"
        >
          <FontRow
            label="Theme font"
            active={value === ''}
            onHover={() => onPreview(null)}
            onPick={() => pick(null)}
          />
          {FONT_CHOICES.map((font) => (
            <FontRow
              key={font.value}
              label={font.label}
              active={value === font.value}
              style={{ fontFamily: font.value }}
              onHover={() => onPreview(font.value)}
              onPick={() => pick(font.value)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FontRow({
  label,
  active,
  style,
  onHover,
  onPick,
}: {
  label: string
  active: boolean
  style?: CSSProperties
  onHover: () => void
  onPick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      // Never takes focus: a choice made for selected characters needs the run
      // to still be the focused element when the click lands.
      onMouseDown={(e) => e.preventDefault()}
      onPointerEnter={onHover}
      onFocus={onHover}
      onClick={onPick}
      className={`flex h-7 w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 text-left text-[11px] text-app-foreground transition-colors hover:bg-app-accent hover:text-white ${FOCUS_RING}`}
    >
      <span aria-hidden="true" className="w-3 shrink-0">
        {active && <CheckIcon />}
      </span>
      <span className="truncate" style={style}>
        {label}
      </span>
    </button>
  )
}

/**
 * The text colour, in Figma's Fill form: a row of [swatch] [value] and, once a
 * colour is set, a remove button in the section header. The swatch is the native
 * colour input itself (invisible over a painted square), so clicking it opens the
 * system picker — Figma's "click the swatch to edit" — and the twelve presets sit
 * underneath for the common case.
 *
 * With no colour set the row says "Theme colour" and the swatch is struck through:
 * a text layer with no fill *is* the theme's. The presets are fixed hexes, so a
 * colour somebody picked stays that colour across a theme switch.
 */
function FillPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string | null) => void
}) {
  const named = COLOR_CHOICES.find((c) => c.value === value)?.label
  return (
    <div>
      <div className={`${FIELD} gap-2 px-1.5`}>
        <label className="relative size-5 shrink-0 cursor-pointer">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-[4px] border border-app-border"
            style={{
              background:
                value ||
                'linear-gradient(135deg, transparent 46%, rgb(239 68 68) 46%, rgb(239 68 68) 54%, transparent 54%)',
            }}
          />
          <input
            type="color"
            aria-label="Pick a fill colour"
            title="Pick a fill colour"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#3b82f6'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <span className="truncate uppercase tabular-nums">
          {value === '' ? <span className="normal-case">Theme colour</span> : value}
        </span>
        {named && <span className="ml-auto truncate text-app-muted">{named}</span>}
      </div>

      <div className="mt-2 grid grid-cols-6 gap-1.5">
        {COLOR_CHOICES.map((color) => (
          <button
            key={color.value}
            type="button"
            aria-label={color.label}
            aria-pressed={value === color.value}
            title={color.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(color.value)}
            className={`aspect-square cursor-pointer rounded-[4px] border transition-transform hover:scale-110 ${FOCUS_RING} ${
              value === color.value ? 'border-app-accent ring-2 ring-app-accent/40' : 'border-app-border'
            }`}
            style={{ backgroundColor: color.value }}
          />
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- layout --- */

/**
 * The layout picker: a row of small pictures of the slide, one per layout it can
 * wear, scrolling sideways.
 *
 * Each picture is the card's *own* content drawn in that layout — the same
 * renderer the canvas uses, not an icon — so what you pick is what you see.
 * Varieties of the card's own type only (see `layoutVarieties`): offering another
 * type's layouts would let a bullet list be turned into a timeline and come out
 * blank, which is not what "pick a different layout" means. "Automatic" is first
 * and is not a variety: it hands the card back to the rule-based classifier, the
 * state every card starts in.
 */
function LayoutStrip({
  layout,
  theme,
  deckTextStyle,
}: {
  layout: LayoutTools
  theme: ThemeTokens
  deckTextStyle: TextStyle
}) {
  const { options, card, isFirstCard } = layout

  // The preview shows the layout, not the nudges: a dragged element would make
  // every option look the same as the others and as the slide.
  const previewOf = (layoutType: LayoutType, visualStyle?: VisualStyle): Card => ({
    ...card,
    layout: layoutType,
    visualStyle: visualStyle ?? card.visualStyle,
    adjusts: undefined,
  })

  const automaticLabel =
    layout.resolved && layout.active === 'auto'
      ? `Automatic · ${LAYOUT_LABELS[layout.resolved]}`
      : 'Automatic'

  return (
    <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      <LayoutOption
        label="Automatic"
        title={automaticLabel}
        active={layout.active === 'auto'}
        onClick={() => layout.onChange('auto')}
      >
        <SlidePreview
          card={previewOf('auto')}
          theme={theme}
          textStyle={deckTextStyle}
          isFirstCard={isFirstCard}
          className="aspect-video w-full rounded-[4px]"
        />
      </LayoutOption>

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
            active={
              layout.active === variety.layout && layout.activeVisualStyle === variety.visualStyle
            }
            onClick={() => layout.onChange(variety.layout, variety.visualStyle)}
          >
            <SlidePreview
              card={previewOf(variety.layout, variety.visualStyle)}
              theme={theme}
              textStyle={deckTextStyle}
              isFirstCard={isFirstCard}
              className="aspect-video w-full rounded-[4px]"
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
      className={`flex w-28 shrink-0 cursor-pointer flex-col items-stretch gap-1 rounded-[6px] border p-1 text-left transition-colors ${FOCUS_RING} ${
        active ? 'border-app-accent bg-app-accent/10' : 'border-transparent hover:bg-app-foreground/5'
      }`}
    >
      {children}
      <span className="truncate px-0.5 text-[11px] text-app-foreground">{label}</span>
    </button>
  )
}

/* --------------------------------------------------------------- content --- */

/**
 * "Content": what can be added to the slide. Like Figma's Fill and Stroke, an
 * empty-until-you-add section whose header carries a "+" — pressing it asks what
 * to add, and choosing a type appends it and folds the list away again.
 *
 * Nothing here knows where the element goes. The store appends it to the card and
 * the layout engine decides how it is drawn; the user can drag it from there.
 */
function ContentSection({ onPick }: { onPick: (type: ContentType) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <Section
      title="Content"
      actions={
        <IconButton
          small
          label="Add content"
          title="Add content to this slide"
          pressed={open}
          onClick={() => setOpen((v) => !v)}
        >
          <PlusIcon />
        </IconButton>
      }
    >
      {open ? (
        <div>
          <Caption>What do you want to add?</Caption>
          <div className="grid grid-cols-2 gap-1.5">
            {CONTENT_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(option.type)
                  setOpen(false)
                }}
                title={option.description}
                className={`h-7 cursor-pointer rounded-[5px] bg-app-foreground/[0.06] px-2 text-left text-[11px] text-app-foreground transition-colors hover:bg-app-accent hover:text-white ${FOCUS_RING}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] leading-snug text-app-muted">
          Add a heading, text, list or more to this slide.
        </p>
      )}
    </Section>
  )
}

/* ---------------------------------------------------------------- atoms --- */

/**
 * One icon button: the header's history and zoom steppers and a section's action.
 *
 * Icons sit at 90% of the foreground colour, which is the token that already
 * flips with the light/dark toggle — so they are always the near-opposite of the
 * panel's own background without hardcoding either side.
 */
function IconButton({
  label,
  onClick,
  children,
  pressed,
  disabled,
  title,
  small,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  pressed?: boolean
  disabled?: boolean
  title?: string
  /** A 24px square for the header row and section actions, against the default 28px. */
  small?: boolean
}) {
  return (
    <button
      type="button"
      // Never take focus — see the note at the top of the file.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      className={`flex shrink-0 cursor-pointer items-center justify-center rounded-[5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING} ${
        small ? 'size-6' : 'size-7'
      } ${
        pressed
          ? 'bg-app-foreground/15 text-app-foreground'
          : 'text-app-foreground/90 hover:bg-app-foreground/10'
      }`}
    >
      {children}
    </button>
  )
}

/* Icons are inline SVG rather than a font or an icon package: a dozen glyphs is
   well under the weight of a dependency, and `currentColor` lets the 90% opacity
   above drive them without a second colour to keep in sync. */

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

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-3">
      <path d="M6 4.2v11.6a.6.6 0 0 0 .92.5l9-5.8a.6.6 0 0 0 0-1l-9-5.8A.6.6 0 0 0 6 4.2Z" />
    </svg>
  )
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

/**
 * A capital A with an arrow: a big A and an up arrow to make text larger, a small
 * A and a down arrow to make it smaller. The size of the letter carries the same
 * message as the arrow, so the pair reads at a glance.
 */
function SizeIcon({ direction }: { direction: 'up' | 'down' }) {
  const up = direction === 'up'
  return (
    <svg {...strokeProps} strokeWidth={1.5}>
      {up ? (
        <>
          <path d="M2.5 16.5 7.5 4l5 12.5M4.4 12.5h6.2" />
          <path d="M16 12V4.5M13.5 7 16 4.5 18.5 7" />
        </>
      ) : (
        <>
          <path d="M3.5 16.5 7 8l3.5 8.5M4.9 13.7h4.2" />
          <path d="M16 4.5V12M13.5 9.5 16 12l2.5-2.5" />
        </>
      )}
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

function UnderlineIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M6 4v5.5a4 4 0 0 0 8 0V4M4.5 16.5h11" />
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

function PlusIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M10 4.5v11M4.5 10h11" />
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

function CheckIcon() {
  return (
    <svg {...strokeProps} strokeWidth={2} className="size-3">
      <path d="M4.5 10.5 8.5 14.5 15.5 6" />
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

/* A paint brush: the handle running up to the ferrule and the bristles' tip. */
function BrushIcon() {
  return (
    <svg {...strokeProps} className="size-3.5">
      <path d="M16.5 3.5 9.6 10.4" />
      <path d="M8.2 9.6c-1.7 0-3 1.3-3 3 0 1.3-.7 2.2-1.7 2.9 2.6.5 6.2.2 7.4-2 .7-1.2.3-2.6-.7-3.4z" />
    </svg>
  )
}
