import gsap from 'gsap'
import { useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react'

/**
 * The chrome's motion vocabulary (DESIGN.md: the lanyard tab's
 * `cubic-bezier(0.16, 1, 0.3, 1)`), on GSAP so entrances can be sequenced and
 * interrupted. Every preset starts from content that is already in the DOM and
 * visible by default: `gsap.from` inside a layout effect sets the start state
 * before the first paint, and `clearProps` hands the element back to its CSS
 * when the tween ends (a deck card's hover lift is a CSS transform that an
 * inline one left behind would override for good).
 *
 * Scope: app chrome only. Nothing here may touch a slide surface, the editor
 * canvas or anything the selection layer measures; a transform left on those
 * would skew `getBoundingClientRect` and every gesture computed from it.
 */
export const EASE = 'expo.out'
const CLEAR = 'transform,opacity,visibility'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

type Targets = gsap.TweenTarget
export interface MotionScope {
  reduce: boolean
  root: HTMLElement
}

/**
 * Runs `setup` inside a `gsap.context` scoped to `ref` once it has mounted, and
 * reverts it on unmount or when `deps` change (so StrictMode's double mount and
 * a fast route change leave no inline styles behind). Selector strings passed
 * to the presets resolve inside the root.
 */
export function useMotion<T extends HTMLElement>(
  setup: (scope: MotionScope) => void,
  deps: DependencyList = [],
): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const reduce = prefersReducedMotion()
    const ctx = gsap.context(() => setup({ reduce, root }), root)
    return () => ctx.revert()
    // The caller's `deps` alone decide when it replays (like GSAP's own useGSAP).
  }, deps)
  return ref
}

/** Anything arriving in place: a page head, a step, a panel. */
export function rise(
  targets: Targets,
  reduce: boolean,
  { delay = 0, y = 8, duration = 0.34, stagger = 0 }: { delay?: number; y?: number; duration?: number; stagger?: number } = {},
) {
  if (reduce) return gsap.from(targets, { autoAlpha: 0, duration: 0.16, delay, clearProps: CLEAR })
  return gsap.from(targets, { autoAlpha: 0, y, duration, delay, ease: EASE, stagger, clearProps: CLEAR })
}

/** A list arriving as a list: each item a beat after the last, the whole run capped at ~0.3 s. */
export function riseList(targets: Element[] | NodeListOf<Element>, reduce: boolean, { delay = 0 } = {}) {
  const items = Array.from(targets)
  if (items.length === 0) return null
  // Past the first dozen nothing more is on screen to watch arrive.
  const shown = items.slice(0, 12)
  const rest = items.slice(12)
  if (rest.length) gsap.from(rest, { autoAlpha: 0, duration: 0.2, delay, clearProps: CLEAR })
  return rise(shown, reduce, { delay, y: 12, duration: 0.42, stagger: Math.min(0.045, 0.3 / shown.length) })
}

/** A dialog: the room dims, the sheet is set down. */
export function popDialog(backdrop: Element, panel: Element, reduce: boolean) {
  const tl = gsap.timeline()
  tl.from(backdrop, { autoAlpha: 0, duration: reduce ? 0.12 : 0.2, ease: 'power1.out', clearProps: CLEAR })
  if (reduce) tl.from(panel, { autoAlpha: 0, duration: 0.14, clearProps: CLEAR }, 0)
  else
    tl.from(
      panel,
      { autoAlpha: 0, y: 14, scale: 0.97, duration: 0.38, ease: EASE, clearProps: CLEAR },
      0.03,
    )
  return tl
}

/** A menu or popover dropping from its trigger. `from` is the edge it hangs off. */
export function dropMenu(panel: Element, reduce: boolean, from: 'top' | 'bottom' = 'top') {
  if (reduce) return gsap.from(panel, { autoAlpha: 0, duration: 0.1, clearProps: CLEAR })
  return gsap.from(panel, {
    autoAlpha: 0,
    y: from === 'top' ? -6 : 6,
    scale: 0.98,
    transformOrigin: from === 'top' ? '50% 0%' : '50% 100%',
    duration: 0.2,
    ease: 'power3.out',
    clearProps: CLEAR,
  })
}

/**
 * The programme's signature: the four-track band printed onto the page, left to
 * right, before the title. Under reduced motion it is simply there.
 */
export function printBand(segments: Targets, reduce: boolean) {
  if (reduce) return null
  return gsap.from(segments, {
    scaleX: 0,
    transformOrigin: '0% 50%',
    duration: 0.5,
    ease: EASE,
    stagger: 0.06,
    clearProps: 'transform',
  })
}

/**
 * Stable ref callbacks for panels that mount when opened (`{open && <div …>}`):
 * they run in the commit phase, before paint, and must keep one identity or
 * every re-render would replay the drop.
 */
export const dropFromTop = (el: HTMLElement | null) => {
  if (!el) return
  const tween = dropMenu(el, prefersReducedMotion(), 'top')
  return () => {
    tween.kill()
  }
}

/** Same idea for a field or note that appears in place (a revealed input, a status line). */
export const riseInRef = (el: HTMLElement | null) => {
  if (!el) return
  const tween = rise(el, prefersReducedMotion(), { y: 6, duration: 0.28 })
  return () => {
    tween.kill()
  }
}

/**
 * `/new`'s send-off: the brief's badge lifts away towards the dashboard, then
 * `done` runs (the navigation). Under reduced motion it runs at once.
 */
export function sendOff(el: Element | null, reduce: boolean, done: () => void) {
  if (!el || reduce) {
    done()
    return null
  }
  return gsap.to(el, { y: -32, rotate: -1.5, autoAlpha: 0, duration: 0.42, ease: 'power2.in', onComplete: done })
}
