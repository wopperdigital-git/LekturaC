import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * Runs a drag gesture from one `pointerdown` to the matching release.
 *
 * `onMove` receives the total offset from where the press started, in **screen
 * pixels** — never the per-event increment. Callers resize and move from the
 * frame the gesture *started* with, so an absolute offset is what they need,
 * and it means a dropped or coalesced pointer event cannot leave the element
 * drifting away from the cursor.
 *
 * The live `PointerEvent` is passed along too, so a gesture can read modifier
 * keys as they are *now* — the press event's `shiftKey` is a snapshot of when
 * the drag started, which would make shift-to-snap only work if the key was
 * already down before the press.
 *
 * Listeners go on `window` rather than using `setPointerCapture`. Capture would
 * be the obvious choice, but it retargets the `click` that ends the gesture to
 * the capturing element — and the selection box sits over the element's own
 * text, so capturing would break the click that puts a caret in a run. The
 * window listeners still survive the pointer leaving the element, which is the
 * only thing capture was wanted for.
 */
export function startPointerDrag(
  event: ReactPointerEvent,
  onMove: (dx: number, dy: number, event: PointerEvent) => void,
  onEnd?: () => void,
): void {
  const startX = event.clientX
  const startY = event.clientY

  function handleMove(e: PointerEvent) {
    onMove(e.clientX - startX, e.clientY - startY, e)
  }

  function handleEnd() {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleEnd)
    // A cancelled pointer (the browser taking over for a scroll or a gesture)
    // has to tear down too, or the drag outlives the press it belongs to.
    window.removeEventListener('pointercancel', handleEnd)
    onEnd?.()
  }

  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleEnd)
  window.addEventListener('pointercancel', handleEnd)
}

/** How far the pointer travels before a press on an element becomes a move rather than a click. */
export const DRAG_THRESHOLD_PX = 4

/** Whether a press has travelled far enough, in screen pixels, to be a drag. */
export function exceedsDragThreshold(dx: number, dy: number, threshold: number = DRAG_THRESHOLD_PX): boolean {
  return Math.hypot(dx, dy) >= threshold
}

/**
 * A press that becomes a drag only once it has moved `DRAG_THRESHOLD_PX`, and is
 * otherwise a tap.
 *
 * For grabbing a selected element anywhere on its body: the same press has to
 * stay a click when it does not move, because a click on a selected element is
 * how its text is opened for editing. So nothing is prevented at the press — the
 * click still happens for a tap — and once the pointer has travelled far enough
 * the gesture takes over: text selection is switched off and cleared (a drag over
 * text would otherwise paint one), and the click that ends the drag is swallowed
 * so dropping an element does not also open it for editing.
 *
 * `onMove` gets the total offset from the press, in screen pixels, like
 * `startPointerDrag`; `onEnd` runs after a drag, `onTap` after a press that never
 * became one.
 */
export function startPendingDrag(
  event: ReactPointerEvent,
  handlers: {
    onMove: (dx: number, dy: number, event: PointerEvent) => void
    onEnd?: () => void
    onTap?: () => void
  },
): void {
  const startX = event.clientX
  const startY = event.clientY
  let dragging = false

  function handleMove(e: PointerEvent) {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!dragging) {
      if (!exceedsDragThreshold(dx, dy)) return
      dragging = true
      document.body.style.userSelect = 'none'
    }
    window.getSelection()?.removeAllRanges()
    handlers.onMove(dx, dy, e)
  }

  function handleEnd() {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleEnd)
    window.removeEventListener('pointercancel', handleEnd)
    if (dragging) {
      document.body.style.userSelect = ''
      swallowNextClick()
      handlers.onEnd?.()
    } else {
      handlers.onTap?.()
    }
  }

  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleEnd)
  window.addEventListener('pointercancel', handleEnd)
}

/**
 * Stops the click that follows a drag's release. The browser dispatches it in the
 * same task as the release, so the listener is taken down again on the next one
 * in case no click comes (a release outside the window, a cancelled pointer).
 */
function swallowNextClick() {
  function stop(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
}
