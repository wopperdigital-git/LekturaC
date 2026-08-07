import type { ContentBlock } from '@/engine/contentBlocks'

/** Generic single-block renderer, used by layouts that just need to stack whatever blocks remain. */
export function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'heading':
      return <Heading text={block.text} />
    case 'paragraph':
      return (
        <p
          className="max-w-prose text-[length:var(--slide-size-body)] leading-[var(--slide-line-height)] text-slide-foreground/90"
          style={{ fontFamily: 'var(--font-slide-body)' }}
        >
          {block.text}
        </p>
      )
    case 'bulletList':
      return (
        <ul className="flex max-w-prose flex-col gap-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[length:var(--slide-size-body)]">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slide-accent" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'stat':
      return <StatBlockView value={block.value} label={block.label} />
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
          "{block.text}"
          {block.attribution && (
            <footer className="mt-2 text-sm not-italic text-slide-muted">— {block.attribution}</footer>
          )}
        </blockquote>
      )
    case 'timelineStep':
      return (
        <div>
          <div className="font-semibold text-slide-accent">{block.label}</div>
          <div className="text-slide-foreground/90">{block.text}</div>
        </div>
      )
    case 'comparisonGroup':
      return (
        <div>
          <div className="mb-2 font-semibold text-slide-foreground">{block.heading}</div>
          <ul className="flex flex-col gap-1">
            {block.items.map((item, i) => (
              <li key={i} className="text-sm text-slide-foreground/90">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )
  }
}

export function Heading({ text, size = 'h2' }: { text: string; size?: 'h1' | 'h2' | 'h3' }) {
  const sizeVar = `var(--slide-size-${size})`
  return (
    <h2
      className="font-semibold tracking-[var(--slide-letter-spacing)] text-slide-foreground"
      style={{ fontFamily: 'var(--font-slide-heading)', fontSize: sizeVar, lineHeight: 1.15 }}
    >
      {text}
    </h2>
  )
}

export function StatBlockView({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div
        className="font-bold text-slide-accent"
        style={{ fontFamily: 'var(--font-slide-heading)', fontSize: 'var(--slide-size-h1)', lineHeight: 1 }}
      >
        {value}
      </div>
      <div className="mt-2 text-slide-muted">{label}</div>
    </div>
  )
}
