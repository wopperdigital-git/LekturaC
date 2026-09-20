import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react'
import { adjustStyle } from '@/engine/blockAdjust'
import type { TextStyle } from '@/engine/textStyle'
import { SLIDE_FONT_VARS, type ThemeTokens } from '@/lib/theme-tokens'
import { useSlideTheme } from '@/components/theme/slideThemeContext'
import {
  AdjustedIndexContext,
  BLOCK_INDEX_ATTR,
  BlockAdjustContext,
  BlockDataContext,
  CardBoxContext,
  blockStyleKey,
  measurableNode,
} from './adjustContext'

/*
  Wraps one element of a card so it can be nudged, resized, styled and selected.

  The wrapper is `display: contents`, which is the whole reason this can be
  dropped into every hand-designed layout and arrangement without touching how any of them
  look. A `display: contents` box is not laid out at all — its child is treated
  as a direct child of the grandparent — so an element nobody has touched
  renders byte-identically to how it did before this component existed. A real
  wrapper `<div>` would not: it becomes the flex child in `HeroLayout` and
  stretches where the `h1` used to centre, becomes the grid cell in
  `GroupRenderer`'s `boxes`, and sits illegally between `<ol>` and `<li>` in
  its `timeline`.

  The consequence is that there is no box of our own to style, so everything is
  applied imperatively to the child node itself. React never sets these
  properties on those nodes, so there is nothing to fight over — and applying to
  the real element rather than to a wrapper is also why a first drag cannot make
  anything jump: it is the same node, in the same place in the same layout, with
  a transform added.

  It still receives pointer events. `display: contents` means the holder can
  never be an event *target*, but events on its child bubble straight through
  it, which is all the selection handler needs.
*/

export function Adjustable({ index, children }: { index: number; children: ReactNode }) {
  const data = useContext(BlockDataContext)
  const adjusting = useContext(BlockAdjustContext)
  const cardBox = useContext(CardBoxContext)
  const wrappedAbove = useContext(AdjustedIndexContext)
  const theme = useSlideTheme()
  const holder = useRef<HTMLDivElement>(null)

  const adjust = data?.adjusts?.[String(index)]
  const style = data?.inline?.[blockStyleKey(index)]?.style
  const width = cardBox?.width ?? 0

  /*
    Already wrapped by an ancestor for this same block — `BlockRenderer` around a
    `Heading`, say — so this one steps aside. Two nested holders would leave the
    outer one's first element child boxless, and every measurement of it zero.
  */
  const nested = wrappedAbove === index

  /*
    No dependency array: the styles have to be reapplied after any render that
    could have replaced the child node or changed the card's width, and a
    dependency list that tried to enumerate those would be one entry away from a
    stale transform on screen.
  */
  useLayoutEffect(() => {
    if (nested) return
    const node = holder.current && measurableNode(holder.current)
    if (!node) return

    /*
      Cleared and reapplied together rather than only set. An element that was
      dragged and then undone has to lose its transform, and React cannot remove
      properties it does not know were set.
    */
    const geometry = adjust && width > 0 ? adjustStyle(adjust, width) : {}
    node.style.transform = geometry.transform ?? ''
    node.style.width = geometry.width ?? ''
    node.style.height = geometry.height ?? ''
    node.style.maxWidth = geometry.maxWidth ?? ''
    node.style.maxHeight = geometry.maxHeight ?? ''

    applyTextStyle(node, style, theme)
  })

  if (nested) return <>{children}</>

  return (
    <div
      ref={holder}
      style={{ display: 'contents' }}
      {...{ [BLOCK_INDEX_ATTR]: index }}
      onPointerDown={
        adjusting
          ? (event) => {
              /*
                Selecting only — the move drag lives on the selection box's
                border. Starting a move from anywhere on the element would fight
                the click that puts a caret in its text, and would mean a stray
                pixel of travel while clicking nudged the slide.
              */
              event.stopPropagation()
              adjusting.select(index)
            }
          : undefined
      }
      onClick={
        // The card underneath reads a click as "nothing in particular was
        // pressed" and clears the selection. This one was very particular.
        adjusting ? (event) => event.stopPropagation() : undefined
      }
    >
      <AdjustedIndexContext.Provider value={index}>{children}</AdjustedIndexContext.Provider>
    </div>
  )
}

/*
  One element's own typography.

  This is the scope the toolbar writes to while an element is selected, and it
  has to be applied *here* rather than through `TextStyleScope`: that component
  styles a whole card through data attributes and inherited custom properties,
  which cannot say "this heading, not the rest of the slide". Alignment above
  all — the complaint that started this was align moving every line on the card
  instead of the one element that was selected.

  Sizes ride as the `--slide-size-*` custom properties rather than a `font-size`,
  so a card's h1/h2/h3/body hierarchy survives being scaled: the theme's ratios
  are preserved and only the multiplier changes, exactly as `TextStyleScope`
  does it one level up.
*/
function applyTextStyle(node: HTMLElement, style: TextStyle | undefined, theme: ThemeTokens) {
  node.style.textAlign = style?.align ?? ''
  // Room to align *in* — see `stretchesInFlexColumn`. Only for an element
  // somebody has explicitly aligned, so an untouched one keeps the exact size
  // its layout gave it.
  node.style.alignSelf = style?.align && stretchesInFlexColumn(node) ? 'stretch' : ''
  // Empty string rather than 'normal': these have to fall back to whatever the
  // layout's own classes say, not override them with a neutral value.
  node.style.fontWeight = style?.bold ? '700' : ''
  node.style.fontStyle = style?.italic ? 'italic' : ''
  node.style.textDecoration = style?.underline ? 'underline' : ''

  /*
    Colour needs both halves. The inline `color` covers the element's own text;
    the attribute switches on the `[data-deck-color]` rule in `index.css`, which
    reaches the descendants — a layout colours a stat's label or a list item with
    its own utility class, and an inherited colour loses to that.
  */
  node.style.color = style?.color ?? ''
  if (style?.color) {
    node.setAttribute('data-deck-color', 'true')
    node.style.setProperty('--slide-user-color', style.color)
  } else {
    node.removeAttribute('data-deck-color')
    node.style.removeProperty('--slide-user-color')
  }

  if (style?.fontFamily) {
    node.style.setProperty(SLIDE_FONT_VARS.heading, style.fontFamily)
    node.style.setProperty(SLIDE_FONT_VARS.body, style.fontFamily)
  } else {
    node.style.removeProperty(SLIDE_FONT_VARS.heading)
    node.style.removeProperty(SLIDE_FONT_VARS.body)
  }

  const scale = style?.fontScale
  const steps = ['h1', 'h2', 'h3', 'body'] as const
  steps.forEach((step, i) => {
    const property = `--slide-size-${step}`
    if (scale && scale !== 1) node.style.setProperty(property, `${theme.typography.scale[i] * scale}rem`)
    else node.style.removeProperty(property)
  })
}

/**
 * Whether stretching this element would give its text somewhere to go.
 *
 * `text-align` positions a run *inside* its element's box, so an element whose
 * box hugs its text has nothing to move. That is the normal case in the layouts
 * that centre with `items-center` — structured `HeroLayout`, `QuoteLayout` and
 * `StatHeroLayout` — where a flex child is sized to its content: clicking
 * "left" stored the value, lit the button via `renderedAlign`, and moved
 * nothing. A toolbar reporting a change that did not happen is worse than one
 * that does nothing, so an explicit alignment now widens the box it aligns in.
 *
 * Restricted to a **column** flex parent deliberately. In a row flex container
 * `align-self` runs down the *vertical* axis, so stretching there would make the
 * stat in expressive `StatHeroLayout` full-height rather than giving it width.
 * Grid children already stretch along the inline axis by default, and block
 * elements are already full-width, so neither needs anything.
 */
function stretchesInFlexColumn(node: HTMLElement): boolean {
  const parent = layoutParent(node)
  if (!parent) return false
  const { display, flexDirection } = getComputedStyle(parent)
  if (display !== 'flex' && display !== 'inline-flex') return false
  return flexDirection === 'column' || flexDirection === 'column-reverse'
}

/**
 * The element that actually lays this one out.
 *
 * Not `parentElement`: that is the `Adjustable` holder, which is
 * `display: contents` and generates no box, so it is never the flex container
 * this element belongs to. Any other boxless ancestor is skipped for the same
 * reason.
 */
function layoutParent(node: HTMLElement): HTMLElement | null {
  let parent = node.parentElement
  while (parent && getComputedStyle(parent).display === 'contents') parent = parent.parentElement
  return parent
}
