import { useContext, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { textSegments, type FlagMarkType, type Mark, type TextSegment } from '@/engine/marks'
import { NEW_ITEM_TEXT } from '@/engine/listItems'
import { parseTextRef } from '@/engine/blockText'
import { useTextEditing } from './textEditingContext'
import { BlockDataContext, blockIndexOf, useBlockAdjusting } from './adjustContext'

/**
 * One run of slide text: styled spans when read-only, a live editing surface
 * when its card is selected and it is the active run.
 *
 * Every text site in every layout renders through this, which is what makes
 * Level 3 work uniformly instead of layout by layout.
 *
 * Read-only is the default and costs nothing: with no `TextEditingContext`
 * above it — the presenter view, the outline thumbnails, the theme previews —
 * this emits marked-up spans and no handlers at all.
 */
export function EditableText({
  textRef,
  value,
  className,
  style,
}: {
  /** Identifies this run within its card; see `textRef` in engine/marks.ts. */
  textRef: string
  value: string
  className?: string
  style?: CSSProperties
}) {
  const editing = useTextEditing()
  const adjusting = useBlockAdjusting()
  const data = useContext(BlockDataContext)
  const ref = useRef<HTMLSpanElement>(null)
  const isActive = editing?.activeRef === textRef

  /*
    Marks come from the card's own data, not from the editing context.

    The same split `Adjustable` depends on, and for the same reason: the editing
    context is provided only to the *selected* card, so reading marks off it
    meant bold rendered while a card was selected and silently vanished the
    moment it wasn't — and never appeared at all in the presenter or the outline
    thumbnails, which provide no editing context by design. `SlideBody` supplies
    the block data on every surface that draws a slide, so this renders the same
    everywhere. It is the same `card.inline` either way, so nothing is lost
    mid-edit.
  */
  const marks = data?.inline?.[textRef]?.marks

  /*
    Whether this run's element already has a selection box around it.

    When it does, the ring below is not just redundant — it is misleading. It
    hugs the *text*, while the box it sits inside is the *element*, and the two
    being different sizes reads as the text being a fixed object that alignment
    cannot move. It can: `text-align` positions the run inside the element, and
    the ring drawn tight around the run is exactly what disguises that.

    So the ring survives only where no box is drawn — the caret alone is a thin
    focus indicator, and somewhere without an element selection there would be
    nothing else to say which run is live.
  */
  const index = blockIndexOf(textRef)
  const boxed = index !== null && adjusting?.selected === index && adjusting.selectedItem === null

  /*
    Whether *this run's* element is the picked-out one, decided at the moment of
    the press and not after it.

    A press selects and a click edits, and the click fires after the selection
    has already changed — so by then every run looks selected and the two cannot
    be told apart. The press handler below runs before the `Adjustable` or item
    container above it (events bubble outward), so it still sees the selection as
    it stood before the press. That is what makes "click to select, click again
    to type" possible: the first press finds nothing selected and only selects;
    the second finds it selected and goes on to edit.
  */
  const parsed = parseTextRef(textRef)
  const runSelected =
    parsed !== null &&
    adjusting?.selected === parsed.blockIndex &&
    adjusting.selectedItem === (parsed.itemIndex ?? null)
  // An item that is picked out is outlined by its own container; the ring around
  // its text as well would be a second box saying the same thing.
  const itemLit = runSelected && parsed?.itemIndex !== undefined
  const selectedAtPress = useRef(false)

  /*
    While a run is active, React must stop rendering into it.

    contentEditable puts the DOM under the browser's control: re-rendering the
    children on every keystroke would blow away the caret and reverse the typed
    text. So React hands the node over on activation and never touches it again
    until the run is deactivated — the standard contentEditable escape hatch.

    What we paint into it *is* the marked-up spans, though, not plain text.
    Flattening them was why bold vanished the instant a run was clicked into,
    and it is safe because both ways back out of this node already walk whatever
    structure they find: `onInput` reads `textContent`, which concatenates
    descendants, and `reportSelection` measures through a Range over the node's
    whole contents. Neither cares how many spans are in there.
  */
  const painted = useRef<{ value: string; marks: string } | null>(null)
  const marksKey = JSON.stringify(marks ?? [])

  useLayoutEffect(() => {
    const node = ref.current
    if (!isActive || !node) return
    paintRun(node, value, marks)
    painted.current = { value, marks: marksKey }
    node.focus()
    // A just-added list item is still its placeholder: select it so the first
    // keystroke replaces it instead of appending to "New item".
    if (value === NEW_ITEM_TEXT) selectWholeRun(node)
    else placeCaretAtEnd(node)
    // `value` and `marks` are deliberately not dependencies: repainting on every
    // keystroke is exactly what this effect exists to avoid. The one case that
    // does need a repaint is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  /*
    A mark applied from the toolbar (or ⌘B) while the run is live.

    Formatting has to show the moment it is applied, but repainting on every
    keystroke would be a DOM rewrite per character — it pollutes the browser's
    undo stack, which ⌘Z now depends on, and it drops in-flight IME composition.

    The two are told apart by the text: typing changes `value`, formatting does
    not. So a change in the marks *while the text stands still* is the only
    thing that repaints, and typing leaves the node entirely alone.
  */
  useLayoutEffect(() => {
    const node = ref.current
    if (!isActive || !node || !painted.current) return

    const typing = painted.current.value !== value
    const reformatted = painted.current.marks !== marksKey
    painted.current = { value, marks: marksKey }
    if (typing || !reformatted) return

    const at = readOffsets(node)
    paintRun(node, value, marks)
    // The selection survives the repaint, so the user can keep formatting the
    // same words instead of re-selecting them after every click.
    if (at) applyOffsets(node, at)
  })

  function reportSelection() {
    if (!editing || !ref.current) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return editing.onSelectionChange(textRef, null)

    const range = selection.getRangeAt(0)
    if (!ref.current.contains(range.commonAncestorContainer)) {
      return editing.onSelectionChange(textRef, null)
    }
    // Offsets relative to the run's own text, which is what marks are indexed by.
    const before = document.createRange()
    before.selectNodeContents(ref.current)
    before.setEnd(range.startContainer, range.startOffset)
    const start = before.toString().length
    editing.onSelectionChange(textRef, { start, end: start + range.toString().length })
  }

  if (isActive) {
    return (
      <span
        /*
          `key` is load-bearing, not cosmetic. Both branches render a <span> in
          the same position, so without distinct keys React reconciles them onto
          the *same* DOM element. This branch's text is set imperatively via
          `textContent` (contentEditable demands React keep its hands off), so
          React has no record of that text node — on the way back to the
          read-only branch it appends its own spans and leaves the stray node in
          place, rendering the text twice. Distinct keys make React unmount this
          element outright, taking the untracked node with it.
        */
        key="editing"
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Edit text"
        className={`outline-none ${
          boxed || itemLit ? '' : 'ring-2 ring-app-accent/70 ring-offset-2 ring-offset-transparent'
        } ${className ?? ''}`}
        style={{ whiteSpace: 'pre-wrap', ...style }}
        onInput={(e) => editing?.onChangeText(textRef, e.currentTarget.textContent ?? '')}
        onPaste={(e) => {
          // Plain text only. A rich paste would drop elements into a node whose
          // contents are read back as `textContent`, losing every line break it
          // carried and letting foreign markup into the slide.
          const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')
          e.preventDefault()
          if (!text || !ref.current) return
          insertTextAtCaret(ref.current, text)
          editing?.onChangeText(textRef, ref.current.textContent ?? '')
        }}
        onKeyUp={reportSelection}
        // Clicking inside the run must not bubble to the card, whose handler
        // clears the active run and would kick the user out of editing on the
        // first click they make to position the caret.
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => {
          e.stopPropagation()
          reportSelection()
        }}
        /*
          No `onBlur` report. Blur used to clear the reported range, which was
          harmless while the only thing that needed the selection was a button
          that refused focus. The colour input has to take focus to open its
          picker, and clearing the range at that moment sent a colour meant for
          three selected letters to the whole element instead. The last reported
          range stays until something else selects: leaving the run ends the edit
          and resets it anyway.
        */
        onKeyDown={(e) => {
          /*
            Enter is a line break inside the run, stored as a newline character
            in its text.

            Left to the browser it would insert a <div> or <br>, neither of which
            survives being read back through `textContent` — the break would
            vanish on the next render. So the key is taken and a real newline
            character is written instead, which the plain-text model, the marks,
            the export and the narration all already understand. Shift+Enter is
            the same thing; IME composition is left alone, since its Enter
            confirms a candidate rather than typing a break.
          */
          if (e.key === 'Enter') {
            if (e.nativeEvent.isComposing) return
            e.preventDefault()
            if (!ref.current) return
            insertTextAtCaret(ref.current, '\n')
            editing?.onChangeText(textRef, ref.current.textContent ?? '')
            reportSelection()
            return
          }
          /*
            ⌘B / ⌘I / ⌘U, routed to our own marks.

            Left alone, the browser runs its native bold and injects a `<b>` the
            store never hears about — `onInput` only reads `textContent`, so the
            formatting is invisible to the model and disappears on blur. Taking
            the key means one representation of bold instead of two.
          */
          const mark = (e.metaKey || e.ctrlKey) && MARK_KEYS[e.key.toLowerCase()]
          if (!mark || !editing || !ref.current) return
          e.preventDefault()
          const at = readOffsets(ref.current)
          if (at && at.end > at.start) editing.onToggleMark(textRef, at, mark)
        }}
      />
    )
  }

  const segments = textSegments(value, marks)
  const selectable = Boolean(editing)

  return (
    <span
      key="reading"
      className={`${selectable ? 'cursor-text rounded-sm hover:bg-app-accent/10' : ''} ${className ?? ''}`}
      // `pre-wrap` so a line break typed in the editor shows on every surface —
      // the presenter and the thumbnails included — rather than collapsing to a
      // space the moment the run is no longer live.
      style={{ whiteSpace: 'pre-wrap', ...style }}
      onPointerDown={
        editing
          ? () => {
              selectedAtPress.current = runSelected
            }
          : undefined
      }
      onClick={
        editing
          ? (e) => {
              // The card underneath also listens; without this the click would
              // select the card and immediately drop back to Level 2.
              e.stopPropagation()
              // A click on something that was already picked out goes on to
              // edit it. The click that *picked* it only selected, which is what
              // leaves Backspace free to remove the element rather than a
              // character of it.
              if (selectedAtPress.current) editing.onSelectText(textRef)
            }
          : undefined
      }
      // The direct route in, for someone who knows it: edits whether or not the
      // run was selected first.
      onDoubleClick={editing ? () => editing.onSelectText(textRef) : undefined}
    >
      {segments.map((segment, i) => (
        <span
          key={i}
          style={{
            fontWeight: segment.bold ? 700 : undefined,
            fontStyle: segment.italic ? 'italic' : undefined,
            textDecoration: segment.underline ? 'underline' : undefined,
            ...valueStyle(segment),
          }}
        >
          {segment.text}
        </span>
      ))}
    </span>
  )
}

/* ------------------------------------------------ the live run's DOM --- */

/*
  Everything below drives the contentEditable node directly, because React is
  deliberately not allowed to. They are DOM-shaped rather than pure, and so are
  not unit-tested — this project runs its tests in `node` with no jsdom. What
  they do is kept small enough to read instead.
*/

const MARK_KEYS: Record<string, FlagMarkType | undefined> = { b: 'bold', i: 'italic', u: 'underline' }

/**
 * The inline style a segment's value marks ask for.
 *
 * Inline, and that is what makes them win: an element's own colour and font are
 * applied by rules and custom properties higher up, and an inline declaration on
 * the span beats every one of them. Size is in `em`, a multiple of the text
 * around the span, which is exactly what a value mark of that kind means.
 */
function valueStyle(segment: TextSegment): CSSProperties {
  const style: CSSProperties = {}
  if (segment.color) style.color = segment.color
  if (segment.fontFamily) style.fontFamily = segment.fontFamily
  if (segment.fontScale && segment.fontScale !== 1) style.fontSize = `${segment.fontScale}em`
  return style
}

/**
 * Rewrites the run's contents as one span per formatted stretch.
 *
 * Built with `createTextNode` / `textContent` rather than an `innerHTML`
 * string, and that is a rule not a preference: this text comes from a model and
 * is edited by hand, so assembling markup out of it would let a slide's own
 * words become elements.
 */
function paintRun(node: HTMLElement, value: string, marks: Mark[] | undefined) {
  node.textContent = ''
  for (const segment of textSegments(value, marks)) {
    const values = valueStyle(segment)
    if (!segment.bold && !segment.italic && !segment.underline && Object.keys(values).length === 0) {
      node.appendChild(document.createTextNode(segment.text))
      continue
    }
    const span = document.createElement('span')
    if (segment.bold) span.style.fontWeight = '700'
    if (segment.italic) span.style.fontStyle = 'italic'
    if (segment.underline) span.style.textDecoration = 'underline'
    Object.assign(span.style, values)
    span.textContent = segment.text
    node.appendChild(span)
  }
  keepTrailingBreakVisible(node)
}

/**
 * Makes a run that ends in a newline show its last, empty line.
 *
 * A trailing newline alone renders nothing after it, so the caret would have
 * nowhere to sit and Enter at the end of a run would look like it did nothing. A
 * `<br>` after it supplies the line box. It has no text, so `textContent` — all
 * the model ever reads back — is unaffected.
 */
function keepTrailingBreakVisible(node: HTMLElement) {
  node.querySelector('br[data-run-end]')?.remove()
  if (!(node.textContent ?? '').endsWith('\n')) return
  const br = document.createElement('br')
  br.setAttribute('data-run-end', '')
  node.appendChild(br)
}

/** Replaces the selection with `text`, as a text node, and leaves the caret after it. */
function insertTextAtCaret(node: HTMLElement, text: string) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (!node.contains(range.commonAncestorContainer)) return

  range.deleteContents()
  const inserted = document.createTextNode(text)
  range.insertNode(inserted)
  range.setStartAfter(inserted)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  keepTrailingBreakVisible(node)
}

/** The whole run selected, so typing replaces it. */
function selectWholeRun(node: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** The caret at the end of the run, wherever focus happened to land it. */
function placeCaretAtEnd(node: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * The current selection as character offsets into the run's own text.
 *
 * Measured with a Range over the whole node rather than by reading a text
 * node's own offset, so it is indifferent to how many spans the run is split
 * into — which is what lets the repaint change that structure underneath it.
 */
function readOffsets(node: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!node.contains(range.commonAncestorContainer)) return null

  const before = document.createRange()
  before.selectNodeContents(node)
  before.setEnd(range.startContainer, range.startOffset)
  const start = before.toString().length
  return { start, end: start + range.toString().length }
}

/** Puts a selection back at the offsets `readOffsets` reported, after a repaint. */
function applyOffsets(node: HTMLElement, at: { start: number; end: number }) {
  const from = pointAt(node, at.start)
  const to = pointAt(node, at.end)
  const selection = window.getSelection()
  if (!from || !to || !selection) return

  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** The text node and local offset a character position falls in. */
function pointAt(root: HTMLElement, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let seen = 0
  let last: Text | null = null

  while (walker.nextNode()) {
    const text = walker.currentNode as Text
    if (offset <= seen + text.data.length) return { node: text, offset: offset - seen }
    seen += text.data.length
    last = text
  }
  // Past the end (the run shrank under it): clamp to the last character there is.
  return last ? { node: last, offset: last.data.length } : null
}
