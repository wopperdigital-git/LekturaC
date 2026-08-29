import type { ReactNode } from 'react'
import type { ContentBlock } from '@/engine/contentBlocks'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { blockIndexOf } from './adjustContext'

/**
 * Generic single-block renderer, used by layouts that just need to stack
 * whatever blocks remain.
 *
 * `index` is the block's position in its card and is what every text run's
 * address is built from — see `textRef`. Layouts that render blocks themselves
 * must pass the same index they iterate with, or Level 3 would store a run's
 * formatting against the wrong block.
 */
export function BlockRenderer({ block, index }: { block: ContentBlock; index: number }) {
  return (
    <Adjustable index={index}>
      <BlockBody block={block} index={index} />
    </Adjustable>
  )
}

/*
  The block itself, wrapped by `BlockRenderer` above.

  Split so the `Adjustable` holder wraps exactly one element per block, whatever
  the block type: `display: contents` needs a single child to hand its layout
  duties to, and a switch returning eight different roots inside the holder is
  the simplest way to guarantee it gets one.
*/
function BlockBody({ block, index }: { block: ContentBlock; index: number }) {
  switch (block.type) {
    case 'heading':
      return <Heading text={block.text} textRef={textRef(index, 'text')} />
    case 'paragraph':
      return (
        <p
          className="max-w-prose text-[length:var(--slide-size-body)] leading-[var(--slide-line-height)] text-slide-foreground/90"
          style={{ fontFamily: 'var(--font-slide-body)' }}
        >
          <EditableText textRef={textRef(index, 'text')} value={block.text} />
        </p>
      )
    case 'bulletList':
      return (
        <ul className="flex max-w-prose flex-col gap-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[length:var(--slide-size-body)]">
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
      return (
        <img
          src={block.url}
          alt={block.alt ?? ''}
          className="w-full rounded-slide-sm border border-slide-border object-cover"
        />
      )
    case 'quote':
      return (
        <blockquote className="max-w-prose border-l-4 border-slide-accent pl-4 italic text-slide-foreground/90">
          "<EditableText textRef={textRef(index, 'text')} value={block.text} />"
          {block.attribution && (
            <footer className="mt-2 text-sm not-italic text-slide-muted">
              — <EditableText textRef={textRef(index, 'attribution')} value={block.attribution} />
            </footer>
          )}
        </blockquote>
      )
    case 'timelineStep':
      return (
        <div>
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
        <div>
          <div className="mb-2 font-semibold text-slide-foreground">
            <EditableText textRef={textRef(index, 'heading')} value={block.heading} />
          </div>
          <ul className="flex flex-col gap-1">
            {block.items.map((item, i) => (
              <li key={i} className="text-sm text-slide-foreground/90">
                <EditableText textRef={textRef(index, 'items', i)} value={item} />
              </li>
            ))}
          </ul>
        </div>
      )
  }
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
}: {
  text: string
  textRef: string
  size?: 'h1' | 'h2' | 'h3'
}) {
  const sizeVar = `var(--slide-size-${size})`
  return (
    <MaybeAdjustable forRef={ref}>
      <h2
        className="font-semibold tracking-[var(--slide-letter-spacing)] text-slide-foreground"
        style={{ fontFamily: 'var(--font-slide-heading)', fontSize: sizeVar, lineHeight: 1.15 }}
      >
        <EditableText textRef={ref} value={text} />
      </h2>
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
}: {
  value: string
  label: string
  valueRef: string
  labelRef: string
}) {
  return (
    <MaybeAdjustable forRef={valueRef}>
      <div>
        <div
          className="font-bold text-slide-accent"
          style={{ fontFamily: 'var(--font-slide-heading)', fontSize: 'var(--slide-size-h1)', lineHeight: 1 }}
        >
          <EditableText textRef={valueRef} value={value} />
        </div>
        <div className="mt-2 text-slide-muted">
          <EditableText textRef={labelRef} value={label} />
        </div>
      </div>
    </MaybeAdjustable>
  )
}
