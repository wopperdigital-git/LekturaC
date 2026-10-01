import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
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
import {
  MAX_RUN_SCALE,
  MIN_RUN_SCALE,
  RUN_SCALE_STEP,
  clampRunScale,
  type FlagMarkType,
  type MarkValue,
  type ValueMarkType,
} from '@/engine/marks'
import { FIELD, PercentField } from './PercentField'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { ThemeGrid } from '@/components/theme/ThemeGrid'

/*
  The editing tools, docked at the right of the canvas.

  Modelled on Figma's properties panel (its "Design" tab), which solves the same
  problem — one panel, many kinds of selection — and is what people already know:

  - **Sections follow the selection.** Figma shows the properties of whatever
    kind of layer is selected and page-level settings when nothing is. Here the
    same three scopes (deck, slide, element) decide what the sections write to:
    Typography and Fill write to the narrowest thing selected. Layout and adding
    content live in the floating toolbar, not here.
  - **A fixed order, top to bottom:** Typography → Fill → Theme. Figma's own
    is Alignment → Layout → Text → Fill → Stroke → Effects → Export; structure first, then type, then colour, then the ambient settings.
  - **Section chrome:** a short sentence-case title on the left, and on the right
    either muted context ("Selected element") or a small action button (the "−"
    on Fill), separated from the next section by a hairline.
  - **Typography in Figma's order:** font (full width), then size, then the
    style and alignment icon groups; Figma's "Fill" is where a text layer's colour
    lives, so it is called Fill here too.
  - **Controls:** filled inputs with no border until hover or focus, icon-led
    segmented groups where the selected option is a raised chip, and a short
    caption above each field. Every icon-only control carries a tooltip naming
    it, with its shortcut where it has one.
  - **What is not a property lives outside the panel:** history, zoom and
    Present in the editor's top bar, and the Edit / Narrate modes that pick this
    panel's tab in a row of their own above it (`ModeTabs`).

  Deliberately app chrome, not deck theme: it follows the light/dark toggle and
  uses `app-*` tokens, because it is a tool sitting beside the deck rather than
  part of it. (The theme wireframes inside it are in each theme's own colours on purpose — they
  are pictures of slides.)

  Every button refuses focus on mousedown. Formatting applies to the *character
  selection* inside a contentEditable run, and a button that took focus would
  collapse it and blur the run before the click landed. The inputs (size, zoom
  and the custom colour swatch) are the exceptions, since they have to take focus to be
  used; the run's last reported selection survives that, which is how a size
  typed for three selected letters still reaches those three.
*/

export type ToolbarLevel = 1 | 2 | 3

/** Which body of the panel is showing. View state: not stored, not undoable. */
export type PanelTab = 'design' | 'narration'

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent'

export function ToolsPanel({
  level,
  scopeLabel,
  textStyle,
  onTextStyleChange,
  onFontPreview,
  markState,
  onToggleMark,
  runValues,
  onRunValue,
  hasTextSelection,
  activeAlign,
  theme,
  onThemeChange,
  tab = 'design',
  narrationTab,
}: {
  level: ToolbarLevel
  /** Plain words for what the text tools are writing to right now. */
  scopeLabel: string
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
  theme: ThemeTokens
  onThemeChange: (theme: ThemeTokens) => void
  /** Which tab is showing, picked by the Edit / Narrate modes above the panel. Defaults to Design. */
  tab?: PanelTab
  /**
   * The Narration tab's body. Supplied by the page so this panel knows nothing about
   * narration, and mounted even while hidden: unmounting it on a tab switch would
   * abort a generation in flight. With none, there is no Narration tab.
   */
  narrationTab?: ReactNode
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
      aria-label="Tools"
      className="flex h-full flex-col overflow-hidden rounded-app border border-app-border bg-app-background"
    >
      {/* No `display` utility on this element: it would override `hidden`. */}
      <div
        role="tabpanel"
        id="tools-panel-design"
        aria-labelledby="tools-tab-design"
        hidden={tab !== 'design'}
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto"
      >
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
          <ThemeGrid theme={theme} onSelect={onThemeChange} />
        </Section>
      </div>

      {narrationTab && (
        <div
          role="tabpanel"
          id="tools-panel-narration"
          aria-labelledby="tools-tab-narration"
          hidden={tab !== 'narration'}
          className="min-h-0 flex-1 overflow-hidden"
        >
          {narrationTab}
        </div>
      )}
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
          ? 'bg-app-background text-app-foreground ring-1 ring-app-border'
          : 'text-app-foreground/70 hover:text-app-foreground'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * The font list: a dropdown floating over the panel, portalled out of it so the
 * panel's scroll area cannot clip it. Each row is set in its own typeface, so the list is a specimen, and
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
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
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

  function close() {
    setOpen(false)
    stop.current(undefined)
  }

  // The list floats over the panel rather than pushing the sections below it down.
  const place = useFloatingMenu(open, close, trigger, menu)

  function pick(fontFamily: string | null) {
    onChange(fontFamily)
    close()
  }

  return (
    <div>
      <button
        ref={trigger}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) close()
          else setOpen(true)
          onPreview(undefined)
        }}
        aria-haspopup="menu"
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

      {open &&
        place &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label="Font"
            onPointerLeave={() => onPreview(undefined)}
            style={{
              left: place.left,
              width: place.width,
              maxHeight: place.maxHeight,
              ...(place.above ? { bottom: place.bottom } : { top: place.top }),
            }}
            className="scrollbar-none fixed z-50 overflow-y-auto rounded-[5px] border border-app-border bg-app-background p-1 shadow-app"
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
          </div>,
          document.body,
        )}
    </div>
  )
}

type MenuPlace = { left: number; width: number; maxHeight: number; above: boolean; top: number; bottom: number }

/** Room kept between a floating menu and the window edge, and between it and its trigger. */
const MENU_GAP = 4
const MENU_MARGIN = 12

/** Where a menu floats for a trigger at `rect`: below it, or above when there is more room there. */
function menuPlace(rect: DOMRect, viewportHeight: number): MenuPlace {
  const below = viewportHeight - rect.bottom - MENU_GAP - MENU_MARGIN
  const aboveRoom = rect.top - MENU_GAP - MENU_MARGIN
  const above = below < 240 && aboveRoom > below
  return {
    left: rect.left,
    width: rect.width,
    maxHeight: Math.max(120, above ? aboveRoom : below),
    above,
    top: rect.bottom + MENU_GAP,
    bottom: viewportHeight - rect.top + MENU_GAP,
  }
}

/**
 * Where a floating menu sits while `open`, and what closes it.
 *
 * A menu here is portalled to <body> with fixed coordinates taken from its
 * trigger, because anything inside the panel would be clipped by its scroll area.
 * It opens below the trigger, or above when there is more room there, and scrolls
 * within whatever height it gets. An outside press, Escape, or a scroll of
 * anything but the menu itself closes it.
 */
function useFloatingMenu(
  open: boolean,
  close: () => void,
  trigger: RefObject<HTMLElement | null>,
  menu: RefObject<HTMLElement | null>,
): MenuPlace | null {
  const [place, setPlace] = useState<MenuPlace | null>(null)
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  useLayoutEffect(() => {
    if (!open) return
    function measure() {
      const rect = trigger.current?.getBoundingClientRect()
      if (rect) setPlace(menuPlace(rect, window.innerHeight))
    }
    measure()
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) closeRef.current()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // The editor's own Escape stands down for a key a dropdown already used.
      e.preventDefault()
      closeRef.current()
    }
    function onScroll(e: Event) {
      // Scrolling the menu itself is fine; scrolling what it hangs off would leave it floating.
      if (!menu.current?.contains(e.target as Node)) closeRef.current()
    }
    // Capture phase, like the toolbar's menus: the canvas's pan hook stops presses
    // in its own capture phase, which a bubble listener would never hear.
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', measure)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, trigger, menu])

  return open ? place : null
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
 * The text colour, in Figma's Fill form: one bar of [swatch] [value] and, once a
 * colour is set, a remove button in the section header. The colours themselves
 * stay out of the panel until asked for: pressing the bar opens a small popover
 * with the twelve presets and a Custom swatch, which is the native colour input
 * (invisible over a painted square), so it opens the system picker.
 *
 * With no colour set the bar says "Theme colour" and the swatch is struck through:
 * a text layer with no fill *is* the theme's. The presets are fixed hexes, so a
 * colour somebody picked stays that colour across a theme switch.
 *
 * A preset closes the popover; the system picker does not, because it reports
 * every colour it passes over on the way to the one that is wanted.
 */
function FillPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const place = useFloatingMenu(open, () => setOpen(false), trigger, menu)
  const named = COLOR_CHOICES.find((c) => c.value === value)?.label
  const label = value === '' ? 'Theme colour' : (named ?? value)
  return (
    <div>
      <button
        ref={trigger}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Fill colour — ${label}`}
        title={`Fill colour — ${label}`}
        className={`${FIELD} w-full cursor-pointer gap-2 px-1.5 ${FOCUS_RING} ${
          open ? 'bg-app-background ring-1 ring-app-accent' : ''
        }`}
      >
        <FillSwatch value={value} />
        <span className="truncate uppercase tabular-nums">
          {value === '' ? <span className="normal-case">Theme colour</span> : value}
        </span>
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          {named && <span className="truncate text-app-muted">{named}</span>}
          <ChevronIcon open={open} />
        </span>
      </button>

      {open &&
        place &&
        createPortal(
          <div
            ref={menu}
            role="dialog"
            aria-label="Fill colour"
            style={{
              left: place.left,
              width: place.width,
              ...(place.above ? { bottom: place.bottom } : { top: place.top }),
            }}
            className="fixed z-50 rounded-[5px] border border-app-border bg-app-background p-2 shadow-app"
          >
            <div className="grid grid-cols-6 gap-1.5">
              {COLOR_CHOICES.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  aria-label={color.label}
                  aria-pressed={value === color.value}
                  title={color.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(color.value)
                    setOpen(false)
                  }}
                  className={`aspect-square cursor-pointer rounded-[4px] border transition-transform hover:scale-110 ${FOCUS_RING} ${
                    value === color.value ? 'border-app-accent ring-2 ring-app-accent/40' : 'border-app-border'
                  }`}
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </div>
            <label className="relative mt-2 flex h-7 cursor-pointer items-center gap-2 rounded-[4px] px-1 text-[11px] text-app-foreground hover:bg-app-foreground/[0.06]">
              <FillSwatch value={named ? '' : value} custom />
              Custom…
              <input
                type="color"
                aria-label="Pick a custom fill colour"
                value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#3b82f6'}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </div>,
          document.body,
        )}
    </div>
  )
}

/** A painted square of `value`. With none: struck through (no fill), or a spectrum for the Custom swatch. */
function FillSwatch({ value, custom }: { value: string; custom?: boolean }) {
  const empty = custom
    ? 'conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)'
    : 'linear-gradient(135deg, transparent 46%, rgb(239 68 68) 46%, rgb(239 68 68) 54%, transparent 54%)'
  return (
    <span
      aria-hidden="true"
      className="block size-5 shrink-0 rounded-[4px] border border-app-border"
      style={{ background: value || empty }}
    />
  )
}

/* ---------------------------------------------------------------- atoms --- */

/**
 * One icon button: a section's action.
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
