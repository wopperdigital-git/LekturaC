import type { ContentBlock } from '@/engine/contentBlocks'

/** Generic single-block renderer, used by layouts that just need to stack whatever blocks remain. */
export function BlockRenderer({ block, index }: { block: ContentBlock; index?: number }) {
  switch (block.type) {
    case 'heading':
      return <Heading text={block.text} blockIndex={index} path="text" />
    case 'paragraph':
      return (
        <p
          data-block-index={index}
          data-text-path="text"
          className="max-w-prose text-[length:var(--slide-size-body)] leading-[var(--slide-line-height)] text-slide-foreground/90"
          style={{ fontFamily: 'var(--font-slide-body)' }}
        >
          {block.text}
        </p>
      )
    case 'bulletList':
      return (
        <ul data-block-index={index} className="flex max-w-prose flex-col gap-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[length:var(--slide-size-body)]">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slide-accent" />
              <span data-block-index={index} data-text-path={`items.${i}`}>
                {item}
              </span>
            </li>
          ))}
        </ul>
      )
    case 'stat':
      return <StatBlockView value={block.value} label={block.label} blockIndex={index} />
    case 'image':
      return (
        <img
          data-block-index={index}
          src={block.url}
          alt={block.alt ?? ''}
          className="w-full rounded-slide-sm border border-slide-border object-cover"
        />
      )
    case 'quote':
      return (
        <blockquote
          data-block-index={index}
          className="max-w-prose border-l-4 border-slide-accent pl-4 italic text-slide-foreground/90"
        >
          "<span data-block-index={index} data-text-path="text">{block.text}</span>"
          {block.attribution && (
            <footer className="mt-2 text-sm not-italic text-slide-muted">
              — <span data-block-index={index} data-text-path="attribution">{block.attribution}</span>
            </footer>
          )}
        </blockquote>
      )
    case 'timelineStep':
      return (
        <div data-block-index={index}>
          <div data-block-index={index} data-text-path="label" className="font-semibold text-slide-accent">
            {block.label}
          </div>
          <div data-block-index={index} data-text-path="text" className="text-slide-foreground/90">
            {block.text}
          </div>
        </div>
      )
    case 'comparisonGroup':
      return (
        <div data-block-index={index}>
          <div
            data-block-index={index}
            data-text-path="heading"
            className="mb-2 font-semibold text-slide-foreground"
          >
            {block.heading}
          </div>
          <ul className="flex flex-col gap-1">
            {block.items.map((item, i) => (
              <li key={i} className="text-sm text-slide-foreground/90">
                <span data-block-index={index} data-text-path={`items.${i}`}>
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )
  }
}

export function Heading({
  text,
  size = 'h2',
  blockIndex,
  path,
}: {
  text: string
  size?: 'h1' | 'h2' | 'h3'
  blockIndex?: number
  path?: string
}) {
  const sizeVar = `var(--slide-size-${size})`
  return (
    <h2
      data-block-index={blockIndex}
      data-text-path={path}
      className="font-semibold tracking-[var(--slide-letter-spacing)] text-slide-foreground"
      style={{ fontFamily: 'var(--font-slide-heading)', fontSize: sizeVar, lineHeight: 1.15 }}
    >
      {text}
    </h2>
  )
}

export function StatBlockView({
  value,
  label,
  blockIndex,
}: {
  value: string
  label: string
  blockIndex?: number
}) {
  return (
    <div data-block-index={blockIndex}>
      <div
        data-block-index={blockIndex}
        data-text-path="value"
        className="font-bold text-slide-accent"
        style={{ fontFamily: 'var(--font-slide-heading)', fontSize: 'var(--slide-size-h1)', lineHeight: 1 }}
      >
        {value}
      </div>
      <div data-block-index={blockIndex} data-text-path="label" className="mt-2 text-slide-muted">
        {label}
      </div>
    </div>
  )
}
