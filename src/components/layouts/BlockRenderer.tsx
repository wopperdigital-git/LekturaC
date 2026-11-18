import type { CSSProperties, ReactNode } from 'react'
import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { leftoverBlocks } from '@/engine/blockPartition'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { PhotoCredit } from './PhotoCredit'
import { WithKicker } from './Kicker'
import { TermRow } from './TermRow'
import { termTextSize } from './termRowSize'
import { blockIndexOf, useItemProps } from './adjustContext'
import { SLIDE_BODY_FONT, SLIDE_HEADING_FONT, SLIDE_SIZE } from '@/lib/theme-tokens'

/**
 * Generic single-block renderer, used by layouts that just need to stack
 * whatever blocks remain.
 *
 * `index` is the block's position in its card and is what every text run's
 * address is built from — see `textRef`. Layouts that render blocks themselves
 * must pass the same index they iterate with, or Level 3 would store a run's
 * formatting against the wrong block.
 */
export function BlockRenderer({
  block,
  index,
  variant,
  photoClass,
  bleed,
  lead,
}: {
  block: ContentBlock
  index: number
  /** Only a heading reads it: the expressive treatment sets it heavier. */
  variant?: VisualStyle
  /** Only a photo reads it: how it is cropped and framed (an aspect ratio, a ring). */
  photoClass?: string
  /**
   * Only a photo reads it: it fills the cell it is drawn in from the slide's 640px width
   * up, square, with no border and no aspect ratio (`SlideFrame`'s bled aside). Below 640px
   * it is drawn as ever.
   */
  bleed?: boolean
  /**
   * Only a paragraph reads it: the sentence right after the slide's claim, drawn larger and
   * a little softer than body text, with no measure cap (the head zone caps its width).
   */
  lead?: boolean
}) {
  return (
    <Adjustable index={index}>
      <BlockBody
        block={block}
        index={index}
        variant={variant}
        photoClass={photoClass}
        bleed={bleed}
        lead={lead}
      />
    </Adjustable>
  )
}

/**
 * Whatever a layout did not draw itself, stacked below what it did.
 *
 * Three frame layouts (`HeroLayout`, `StatHeroLayout`, `QuoteLayout`) pick out the
 * block types they understand and render only those, so anything else on the card
 * used to be drawn nowhere — while the .pptx export and the narration script both
 * carried it (see `engine/blockPartition.ts`). The layouts that draw every block
 * through `SlideFrame` (`FlowLayout` with `GroupRenderer`, `StandardLayout`,
 * `TextFocusLayout`, `StandardSplitLayout`, `ImageFocusLayout`) are handed every
 * index not in the head by `slotsOf`, so they need none, and must never use this
 * component — doing so would draw blocks twice. Each frame layout that picks by type
 * names the indices it drew and ends with this, so a card cannot hold text that never
 * reaches the screen.
 *
 * It renders nothing at all in the normal case, where the layout's own content
 * *is* the whole card — so a well-matched card looks exactly as it did before
 * this existed, with no stray empty box in its markup.
 */
export function Leftovers({
  blocks,
  consumed,
}: {
  blocks: ContentBlock[]
  consumed: number[]
}) {
  const rest = leftoverBlocks(blocks, consumed)
  if (rest.length === 0) return null
  return (
    <div className="flex flex-col gap-4">
      {rest.map(({ block, index }) => (
        <BlockRenderer key={index} block={block} index={index} />
      ))}
    </div>
  )
}

/*
  The block itself, wrapped by `BlockRenderer` above.

  Split so the `Adjustable` holder wraps exactly one element per block, whatever
  the block type: `display: contents` needs a single child to hand its layout
  duties to, and a switch returning eight different roots inside the holder is
  the simplest way to guarantee it gets one.
*/
function BlockBody({
  block,
  index,
  variant,
  photoClass,
  bleed,
  lead,
}: {
  block: ContentBlock
  index: number
  variant?: VisualStyle
  photoClass?: string
  bleed?: boolean
  lead?: boolean
}) {
  const itemProps = useItemProps()
  switch (block.type) {
    case 'heading':
      return (
        <Heading
          text={block.text}
          textRef={textRef(index, 'text')}
          size={block.size}
          variant={variant}
          kicker={block.kicker}
        />
      )
    case 'paragraph':
      if (lead) {
        return (
          <p
            data-lead=""
            className="text-slide-foreground/85"
            style={{ fontFamily: SLIDE_BODY_FONT, fontSize: SLIDE_SIZE.lead, lineHeight: 1.35 }}
          >
            <EditableText textRef={textRef(index, 'text')} value={block.text} />
          </p>
        )
      }
      return (
        <p
          className="max-w-prose text-[length:var(--slide-size-body)] leading-[var(--slide-line-height)] text-slide-foreground/90"
          style={{ fontFamily: SLIDE_BODY_FONT }}
        >
          <EditableText textRef={textRef(index, 'text')} value={block.text} />
        </p>
      )
    case 'bulletList':
      return (
        <ul className="flex max-w-prose flex-col gap-2 text-slide-foreground" style={{ fontFamily: SLIDE_BODY_FONT }}>
          {block.items.map((item, i) => (
            <li key={i} {...itemProps(index, i)} className="flex items-start gap-2 text-[length:var(--slide-size-body)]">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slide-accent" />
              <EditableText textRef={textRef(index, 'items', i)} value={item} />
            </li>
          ))}
        </ul>
      )
    case 'stat':
      return (
        <StatBlockView
          value={block.value}
          label={block.label}
          valueRef={textRef(index, 'value')}
          labelRef={textRef(index, 'label')}
        />
      )
    case 'image':
      return <PhotoFigure block={block} className={photoClass} bleed={bleed} />
    case 'quote':
      return (
        <blockquote
          className="max-w-prose border-l-4 border-slide-accent pl-4 italic text-slide-foreground/90"
          style={{ fontFamily: SLIDE_BODY_FONT, fontSize: 'var(--slide-size-body)' }}
        >
          "<EditableText textRef={textRef(index, 'text')} value={block.text} />"
          {block.attribution && (
            <footer className="mt-2 text-[length:0.85em] not-italic text-slide-muted">
              — <EditableText textRef={textRef(index, 'attribution')} value={block.attribution} />
            </footer>
          )}
        </blockquote>
      )
    case 'timelineStep':
      return (
        <div style={{ fontFamily: SLIDE_BODY_FONT, fontSize: 'var(--slide-size-body)' }}>
          <div className="font-semibold text-slide-accent">
            <EditableText textRef={textRef(index, 'label')} value={block.label} />
          </div>
          <div className="text-slide-foreground/90">
            <EditableText textRef={textRef(index, 'text')} value={block.text} />
          </div>
        </div>
      )
    case 'comparisonGroup':
      return (
        <div style={{ fontFamily: SLIDE_BODY_FONT, fontSize: 'var(--slide-size-body)' }}>
          <div className="mb-2 font-semibold text-slide-foreground">
            <EditableText textRef={textRef(index, 'heading')} value={block.heading} />
          </div>
          <ul className="flex flex-col gap-1">
            {block.items.map((item, i) => (
              <li key={i} {...itemProps(index, i)} className="text-slide-foreground/90">
                <EditableText textRef={textRef(index, 'items', i)} value={item} />
              </li>
            ))}
          </ul>
        </div>
      )
    case 'point':
      // A lone point (a run of two or more is the `rows` arrangement): one row of the same table, closed by a hairline below.
      return (
        <TermRow
          index={index}
          label={block.label}
          text={block.text}
          textSize={termTextSize([block.text])}
          expressive={variant === 'expressive'}
          last
        />
      )
    /*
      Stand-ins until the accent callout and the code panel are drawn: every field
      is drawn once under its own address, so nothing on the card is hidden and
      every nudge, mark and selection already works on it.
    */
    case 'callout':
      return (
        <p
          className="max-w-prose text-[length:var(--slide-size-body)] leading-[var(--slide-line-height)] text-slide-foreground/90"
          style={{ fontFamily: SLIDE_BODY_FONT }}
        >
          {block.label && (
            <>
              <span className="font-semibold">
                <EditableText textRef={textRef(index, 'label')} value={block.label} />
              </span>
              {' — '}
            </>
          )}
          <EditableText textRef={textRef(index, 'text')} value={block.text} />
        </p>
      )
    case 'code':
      return (
        <div style={{ fontFamily: SLIDE_BODY_FONT, fontSize: 'var(--slide-size-body)' }}>
          {block.label && (
            <p className="text-slide-muted">
              <EditableText textRef={textRef(index, 'label')} value={block.label} />
            </p>
          )}
          <pre className="whitespace-pre text-slide-foreground" style={{ fontFamily: 'ui-monospace, monospace' }}>
            <EditableText textRef={textRef(index, 'code')} value={block.code} />
          </pre>
          {block.caption && (
            <p className="text-slide-muted">
              <EditableText textRef={textRef(index, 'caption')} value={block.caption} />
            </p>
          )}
        </div>
      )
  }
}

/**
 * A photo with its credit on its bottom edge. The figure is the one box the
 * `Adjustable` around it measures, so the credit travels with the picture and is
 * not an element of its own. `className` crops and frames the picture (the
 * default keeps its own shape).
 *
 * `bleed` (the frame's bled aside) makes it the cell's own height from the slide's 640px
 * width up: the figure is `h-full`, square and unbordered (the surface's own corner radius
 * trims the outer corners), and the picture is taken out of flow (`absolute inset-0`) with
 * no aspect ratio, so it fills the cell without its natural height ever setting the row's;
 * the slide can still grow past 16:9 and the photo grows with it. The aspect ratio the
 * caller passes still shapes the stacked photo below 640px.
 */
function PhotoFigure({
  block,
  className = '',
  bleed = false,
}: {
  block: Extract<ContentBlock, { type: 'image' }>
  className?: string
  bleed?: boolean
}) {
  const figure = bleed
    ? ' @min-[640px]:h-full @min-[640px]:rounded-none @min-[640px]:border-0'
    : ''
  const picture = bleed
    ? ' @min-[640px]:absolute @min-[640px]:inset-0 @min-[640px]:h-full @min-[640px]:aspect-auto'
    : ''
  return (
    <figure
      className={`relative w-full overflow-hidden rounded-slide-sm border border-slide-border${figure}`}
    >
      <img
        src={block.url}
        alt={block.alt ?? ''}
        className={`block w-full object-cover ${className}${picture}`}
      />
      <PhotoCredit credit={block.credit} />
    </figure>
  )
}

/**
 * A card heading, adjustable in its own right.
 *
 * Several layouts render this directly rather than going through
 * `BlockRenderer`, so it wraps itself. The block index comes from the `textRef`
 * it is already given — `blockIndexOf` — rather than being threaded through
 * twelve layouts as a second prop that says the same thing twice.
 */
export function Heading({
  text,
  textRef: ref,
  size = 'h2',
  variant,
  kicker,
}: {
  text: string
  textRef: string
  size?: 'h1' | 'h2' | 'h3'
  /** Expressive sets the heading heavier. Never a fill: importance is contrast. */
  variant?: VisualStyle
  /** The small heading over it, drawn inside the heading's own holder (see `WithKicker`). */
  kicker?: string
}) {
  const index = blockIndexOf(ref)
  const sizeVar = `var(--slide-size-${size})`
  const weight = variant === 'expressive' ? 'font-extrabold' : 'font-semibold'
  // h1 and h2 are tight; the smaller h3 keeps a little more air.
  const lineHeight = size === 'h3' ? 1.15 : 1.08
  return (
    <MaybeAdjustable forRef={ref}>
      <WithKicker
        kicker={index === null ? undefined : kicker}
        kickerRef={index === null ? '' : textRef(index, 'kicker')}
        variant={variant}
      >
        <h2
          className={`${weight} tracking-[var(--slide-letter-spacing)] text-slide-foreground`}
          style={{ fontFamily: SLIDE_HEADING_FONT, fontSize: sizeVar, lineHeight }}
        >
          <EditableText textRef={ref} value={text} />
        </h2>
      </WithKicker>
    </MaybeAdjustable>
  )
}

/**
 * Wraps a self-wrapping element in its holder, given the `textRef` it already
 * has rather than a second prop repeating the same number.
 *
 * A ref that does not parse gets no holder at all. Wrapping it under a guessed
 * index would collide with the block that really has that index — see
 * `blockIndexOf`.
 */
function MaybeAdjustable({ forRef, children }: { forRef: string; children: ReactNode }) {
  const index = blockIndexOf(forRef)
  if (index === null) return <>{children}</>
  return <Adjustable index={index}>{children}</Adjustable>
}

export function StatBlockView({
  value,
  label,
  valueRef,
  labelRef,
  valueSize = 'var(--slide-size-h1)',
  labelSize = 'var(--slide-size-body)',
  lineHeight = 1,
  gap,
  panel,
  panelStyle,
  accentOwner = false,
}: {
  value: string
  label: string
  valueRef: string
  labelRef: string
  /** CSS font-size of the figure. The default is the theme's h1 step. */
  valueSize?: string
  /** CSS font-size of the label. The default is the theme's body step. */
  labelSize?: string
  /** Line height of the figure. */
  lineHeight?: number
  /** The space between the figure and its label, a `SLIDE_GAP` step. The default is a small fixed one. */
  gap?: string
  /**
   * Classes that make the figure's own box an accent-filled panel (the
   * expressive treatment). They must carry `bg-slide-accent` and
   * `text-slide-accent-foreground`; the ink switches from accent/muted to
   * accent-foreground. The panel being the adjusted node, a nudge moves both.
   */
  panel?: string
  /** Inline style for the panel's own box (its padding), merged over the font settings. */
  panelStyle?: CSSProperties
  /**
   * Marks the panel as the slide's one accent-filled box (`data-accent-owner`). Only
   * meaningful with `panel`: the attribute sits on the panel's own element, so no
   * wrapper comes between the `Adjustable` and the box it moves.
   */
  accentOwner?: boolean
}) {
  return (
    <MaybeAdjustable forRef={valueRef}>
      {/* The label inherits this; the value below overrides it with the heading
          font, the way the two read on screen. */}
      <div
        className={panel}
        data-accent-owner={panel && accentOwner ? '' : undefined}
        style={{ fontFamily: SLIDE_BODY_FONT, fontSize: 'var(--slide-size-body)', ...panelStyle }}
      >
        <div
          data-stat-figure=""
          className={`font-bold ${panel ? 'text-slide-accent-foreground' : 'text-slide-accent'}`}
          style={{ fontFamily: SLIDE_HEADING_FONT, fontSize: valueSize, lineHeight }}
        >
          <EditableText textRef={valueRef} value={value} />
        </div>
        <div
          data-stat-label=""
          className={`${gap ? '' : 'mt-2 '}${panel ? 'text-slide-accent-foreground/85' : 'text-slide-muted'}`}
          style={{ fontSize: labelSize, ...(gap ? { marginTop: gap } : {}) }}
        >
          <EditableText textRef={labelRef} value={label} />
        </div>
      </div>
    </MaybeAdjustable>
  )
}
