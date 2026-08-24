import { useEffect, useRef, type CSSProperties } from 'react'
import { textSegments } from '@/engine/marks'
import { useTextEditing } from './textEditingContext'

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
  const ref = useRef<HTMLSpanElement>(null)
  const isActive = editing?.activeRef === textRef
  const marks = editing?.inline?.[textRef]?.marks

  /*
    While a run is active, React must stop rendering into it.

    contentEditable puts the DOM under the browser's control: re-rendering the
    children on every keystroke would blow away the caret and reverse the typed
    text. So the editable branch renders the text once as the initial content
    and React never touches it again until the run is deactivated — the standard
    contentEditable escape hatch.
  */
  useEffect(() => {
    if (!isActive || !ref.current) return
    // Plain text, not the marked-up spans: mixing contentEditable with our own
    // span structure would let the browser's own formatting commands rewrite it.
    if (ref.current.textContent !== value) ref.current.textContent = value
    ref.current.focus()

    // Put the caret at the end rather than leaving it wherever focus landed.
    const selection = window.getSelection()
    if (selection) {
      const range = document.createRange()
      range.selectNodeContents(ref.current)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    // `value` is deliberately not a dependency: re-running on every keystroke is
    // exactly what this effect exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

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
        className={`outline-none ring-2 ring-app-accent/70 ring-offset-2 ring-offset-transparent ${className ?? ''}`}
        style={style}
        onInput={(e) => editing?.onChangeText(textRef, e.currentTarget.textContent ?? '')}
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
        onBlur={reportSelection}
        // A slide run is a single line of text; Enter would insert a <div> the
        // plain-text model has no way to represent.
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault()
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
      style={style}
      onClick={
        editing
          ? (e) => {
              // The card underneath also listens; without this the click would
              // select the card and immediately drop back to Level 2.
              e.stopPropagation()
              editing.onSelectText(textRef)
            }
          : undefined
      }
    >
      {segments.map((segment, i) => (
        <span
          key={i}
          style={{
            fontWeight: segment.bold ? 700 : undefined,
            fontStyle: segment.italic ? 'italic' : undefined,
          }}
        >
          {segment.text}
        </span>
      ))}
    </span>
  )
}
