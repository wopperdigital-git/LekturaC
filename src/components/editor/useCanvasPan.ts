import { useEffect, type RefObject } from 'react'
import { hasPanned, panScroll } from '@/lib/pan'
import { RIGHT_BUTTON, isPanPress, type EditorTool } from '@/engine/editorTool'

/** Set on the canvas while Ctrl is held (a drag would pan) and while one is under way. */
export const PAN_READY_ATTR = 'data-pan-ready'
export const PANNING_ATTR = 'data-panning'

/**
 * Ctrl + left-drag pans the canvas: grab the view and move it, which is how a
 * zoomed-in deck is got around without the scrollbars. Holding the right button
 * and dragging pans in every tool too. In the Move screen tool (`tool === 'pan'`)
 * a plain left-drag pans as well, and the grab cursor stays on whether or not
 * Ctrl is held.
 *
 * Wired to the DOM directly, in the *capture* phase, and that is the point.
 * Everything inside the canvas listens for the same press — an element selects
 * itself, a card selects itself, a selection box starts a move — and a pan must
 * beat all of them. React's handlers sit on the root and run after a capturing
 * listener on this node, so stopping the press here means none of them ever hears
 * about it: panning never changes what is selected or starts a drag of its own.
 *
 * Two things follow from taking over a press:
 * - The `click` the release produces is swallowed, or panning would end with the
 *   card underneath being selected — the very thing a pan must not do.
 * - Ctrl+click is a context-menu gesture on a Mac, so that is suppressed too
 *   while it is a pan. So is the menu a right-drag would open on release; a
 *   right-click that did not move still opens it (paste and spelling in a run).
 *
 * The cursor is CSS, keyed off two attributes set here (`index.css`), so holding
 * Ctrl shows a grab hand over the whole canvas without a render per key.
 */
export function useCanvasPan(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  tool: EditorTool = 'select',
) {
  useEffect(() => {
    const node = ref.current
    if (!node || !enabled) return
    const canvas: HTMLElement = node

    let start: { pointer: { x: number; y: number }; scroll: { x: number; y: number } } | null = null
    let moved = false
    let swallowClick = false
    // A right-drag that panned: the context menu its release brings up is eaten.
    let swallowMenu = false
    let rightPress = false

    // Move screen keeps the hand showing; otherwise it is only there while Ctrl is.
    const alwaysReady = tool === 'pan'

    function setReady(ready: boolean) {
      canvas.toggleAttribute(PAN_READY_ATTR, ready || alwaysReady)
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Control') setReady(e.type === 'keydown')
    }
    // Focus leaving the window while Ctrl is down would never see the key come
    // up, leaving the hand cursor stuck on.
    function onBlur() {
      setReady(false)
    }

    function onPointerDown(e: PointerEvent) {
      if (!isPanPress(e, tool)) return

      e.preventDefault()
      e.stopPropagation()
      start = {
        pointer: { x: e.clientX, y: e.clientY },
        scroll: { x: canvas.scrollLeft, y: canvas.scrollTop },
      }
      moved = false
      swallowClick = true
      rightPress = e.button === RIGHT_BUTTON
      canvas.setAttribute(PANNING_ATTR, '')
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
    }

    function onPointerMove(e: PointerEvent) {
      if (!start) return
      const pointer = { x: e.clientX, y: e.clientY }
      if (!moved && !hasPanned(start.pointer, pointer)) return
      moved = true
      const next = panScroll(start.scroll, start.pointer, pointer)
      canvas.scrollLeft = next.x
      canvas.scrollTop = next.y
    }

    function end() {
      swallowMenu = rightPress && moved
      start = null
      canvas.removeAttribute(PANNING_ATTR)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      // The click for this press arrives right after the release; if none does
      // (the pointer left the canvas first) the flag must not outlive it and eat
      // an ordinary click later.
      setTimeout(() => {
        swallowClick = false
        swallowMenu = false
      }, 0)
    }

    function onClick(e: MouseEvent) {
      if (!swallowClick) return
      swallowClick = false
      e.preventDefault()
      e.stopPropagation()
    }

    function onContextMenu(e: MouseEvent) {
      // `start && rightPress`: where the menu comes on the press rather than the
      // release (macOS), the button is still held and a pan may follow, so the
      // menu cannot be let through there.
      if (swallowMenu || e.ctrlKey || (start && rightPress)) e.preventDefault()
    }

    setReady(false)
    canvas.addEventListener('pointerdown', onPointerDown, true)
    canvas.addEventListener('click', onClick, true)
    canvas.addEventListener('contextmenu', onContextMenu, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown, true)
      canvas.removeEventListener('click', onClick, true)
      canvas.removeEventListener('contextmenu', onContextMenu, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      // Cleared outright (not via setReady): a tool change or unmount must not
      // leave the hand cursor behind.
      canvas.removeAttribute(PAN_READY_ATTR)
      canvas.removeAttribute(PANNING_ATTR)
    }
  }, [ref, enabled, tool])
}
