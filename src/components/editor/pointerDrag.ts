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
