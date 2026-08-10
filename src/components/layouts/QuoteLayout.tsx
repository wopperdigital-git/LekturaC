import { blocksOfType, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'

/** Cinematic pull-quote treatment for a card built around one verbatim line. */
export function QuoteLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfType(blocks, 'heading')
  const quote = blocksOfType(blocks, 'quote')[0]
  const paragraph = blocksOfType(blocks, 'paragraph')[0]

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-6 py-8">
        {headings.map((h, i) => (
          <Heading key={i} text={h.text} />
        ))}
        {quote && (
          <div className="flex max-w-2xl flex-col gap-4 border-l-4 border-slide-accent pl-6">
            <p
              className="text-[length:var(--slide-size-h3)] italic leading-snug text-slide-foreground"
              style={{ fontFamily: 'var(--font-slide-heading)' }}
            >
              {quote.text}
            </p>
            {quote.attribution && <div className="text-slide-muted">— {quote.attribution}</div>}
          </div>
        )}
        {paragraph && (
          <p className="max-w-md text-slide-foreground/80" style={{ fontFamily: 'var(--font-slide-body)' }}>
            {paragraph.text}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} />
      ))}
      {quote && (
        <div className="flex max-w-2xl flex-col items-center gap-4">
          <span
            aria-hidden="true"
            className="text-slide-accent"
            style={{ fontFamily: 'var(--font-slide-heading)', fontSize: 'var(--slide-size-h1)', lineHeight: 0.6 }}
          >
            "
          </span>
          <p
            className="text-[length:var(--slide-size-h3)] italic leading-snug text-slide-foreground"
            style={{ fontFamily: 'var(--font-slide-heading)' }}
          >
            {quote.text}
          </p>
          {quote.attribution && <div className="text-slide-muted">— {quote.attribution}</div>}
        </div>
      )}
      {paragraph && (
        <p className="max-w-md text-slide-foreground/80" style={{ fontFamily: 'var(--font-slide-body)' }}>
          {paragraph.text}
        </p>
      )}
    </div>
  )
}
