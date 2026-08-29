import { normalizeAdjust, type BlockAdjust } from '@/engine/blockAdjust'
import type { Frame } from '@/engine/frame'
import type { Container } from '@/engine/frameGeometry'
import type { TextAlign } from '@/engine/textStyle'
import { BLOCK_INDEX_ATTR, measurableNode } from '@/components/layouts/adjustContext'

/*
  Turning what the browser laid out into what gets stored, and back.

  In its own module rather than beside `SelectionLayer` for two reasons: the
  toolbar's align buttons act on an element nobody is drawing a box around and
  need the same measurements, and a component file that also exports helpers
  loses fast refresh — the same split `slideThemeContext.ts` exists for.
*/

export interface Measured {
  /** Where the layout puts this element **at its current size**. */
  natural: Frame
  card: Container
  /** The laid-out node, kept so a gesture can re-measure it mid-drag. */
  node: HTMLElement
  cardNode: HTMLElement
}

/**
 * Where the layout puts an element, with the displacement taken off but its
 * size left on.
 *
 * "Size left on" is the subtle half, and getting it wrong is a real bug rather
 * than a rounding difference. Most of the twelve layouts centre or otherwise
 * align their children, so an element's position is a *function of its size*:
 * widen a heading inside `items-center` and the layout immediately re-centres
 * it, moving both edges. Measuring at the size the element actually has is what
 * keeps the stored displacement meaning "how far the user dragged it" rather
 * than silently absorbing the layout's own re-centring.
 *
 * The transform does come off, for two reasons: the displacement is exactly
 * what we are solving for, and `getBoundingClientRect` on a rotated element
 * returns its axis-aligned bounds rather than its own rectangle.
 *
 * `size` overrides the element's size for the duration of the measurement, so a
 * resize gesture can ask "where would the layout put this if it were this
 * big?" — the question that has to be answered *before* the new displacement
 * can be computed.
 *
 * Everything happens synchronously inside one layout pass, so nothing is ever
 * painted in the probed state.
 */
export function measureAt(
  node: HTMLElement,
  card: HTMLElement,
  size?: { w: number; h: number },
): Frame {
  const { transform, width, height, maxWidth, maxHeight } = node.style

  node.style.transform = ''
  if (size) {
    node.style.width = `${size.w}px`
    node.style.height = `${size.h}px`
    // The layouts' readability caps would otherwise clamp the probe and report
    // a position for a width the element was never going to have.
    node.style.maxWidth = 'none'
    node.style.maxHeight = 'none'
  }

  const rect = node.getBoundingClientRect()
  const base = card.getBoundingClientRect()

  node.style.transform = transform
  node.style.width = width
  node.style.height = height
  node.style.maxWidth = maxWidth
  node.style.maxHeight = maxHeight

  return {
    x: rect.left - base.left,
    y: rect.top - base.top,
    w: rect.width,
    h: rect.height,
    rotation: 0,
  }
}

/** Finds one adjustable element inside a card and measures it. */
export function measureBlock(cardNode: HTMLElement, index: number): Measured | null {
  const holder = cardNode.querySelector(`[${BLOCK_INDEX_ATTR}="${index}"]`)
  const node = holder && measurableNode(holder)
  if (!node) return null
  return {
    natural: measureAt(node, cardNode),
    card: { w: cardNode.clientWidth, h: cardNode.clientHeight },
    node,
    cardNode,
  }
}

/**
 * Where an element currently sits.
 *
 * Just the natural rect plus the displacement — the size is already in
 * `natural`, because `measureAt` measures with it applied. Reapplying
 * `adjust.w` here would be counting it twice.
 */
export function currentFrame(
  natural: Frame,
  adjust: BlockAdjust | undefined,
  card: Container,
): Frame {
  return {
    x: natural.x + (adjust?.dx ?? 0) * card.w,
    y: natural.y + (adjust?.dy ?? 0) * card.w,
    w: natural.w,
    h: natural.h,
    rotation: adjust?.rotation ?? 0,
  }
}

/**
 * Folds a gesture's resulting rect back into a stored adjustment.
 *
 * `base` must be the layout's position for the element **at the size `next`
 * gives it** — see `measureAt`. For a move or a rotate that is the element's
 * current natural rect; for a resize the caller has to probe the new size
 * first, or the layout's own re-centring lands in `dx` and the anchored edge
 * drifts.
 *
 * `sized` is why the size fields are not simply always written: an element that
 * was moved but never resized keeps sizing to its own content, so its text still
 * reflows when it is edited. Recording the measured size on every move would
 * freeze that silently, and the user would never know why editing the text
 * stopped changing the box.
 */
export function toAdjust(
  next: Frame,
  base: Frame,
  card: Container,
  previous: BlockAdjust,
  sized: boolean,
): BlockAdjust {
  return normalizeAdjust({
    dx: (next.x - base.x) / card.w,
    dy: (next.y - base.y) / card.w,
    w: sized ? next.w / card.w : previous.w,
    h: sized ? next.h / card.w : previous.h,
    rotation: next.rotation,
  })
}

/**
 * One of the toolbar's three alignments, out of a CSS `text-align` value.
 *
 * `start`/`end` are what the computed value reports when nothing has set an
 * explicit side, and they mean left/right in a left-to-right document — which
 * every deck here is. `justify` and anything else map to nothing, because the
 * toolbar has no button that could honestly be lit for them.
 *
 * Pure, and separate from the DOM read below, so the mapping is unit-testable.
 */
export function normalizeAlign(computed: string): TextAlign | null {
  switch (computed) {
    case 'left':
    case 'start':
      return 'left'
    case 'center':
      return 'center'
    case 'right':
    case 'end':
      return 'right'
    default:
      return null
  }
}

/**
 * The alignment an element is *actually rendering with*, whatever set it.
 *
 * Read off the DOM rather than resolved from stored style, and that is the
 * whole point: several layouts centre their text with a CSS class rather than a
 * value anybody stored — `HeroLayout`, `QuoteLayout` and `StatHeroLayout` all
 * apply `text-center`. Walking the stored chain instead would confidently light
 * the "left" button on a hero title that is plainly centred on screen.
 */
export function renderedAlign(cardNode: HTMLElement | null, index: number): TextAlign | null {
  if (!cardNode) return null
  const holder = cardNode.querySelector(`[${BLOCK_INDEX_ATTR}="${index}"]`)
  const node = holder && measurableNode(holder)
  return node ? normalizeAlign(getComputedStyle(node).textAlign) : null
}
