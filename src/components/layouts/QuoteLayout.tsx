import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'

/** Cinematic pull-quote treatment for a card built around one verbatim line. */
export function QuoteLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const quote = blocksOfTypeIndexed(blocks, 'quote')[0]
  const paragraph = blocksOfTypeIndexed(blocks, 'paragraph')[0]

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-6 py-8">
        {headings.map(({ block, index }) => (
          <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
        ))}
        {quote && (
          <Adjustable index={quote.index}>
            <div className="flex max-w-2xl flex-col gap-4 border-l-4 border-slide-accent pl-6">
              <p
                className="text-[length:var(--slide-size-h3)] italic leading-snug text-slide-foreground"
                style={{ fontFamily: 'var(--font-slide-heading)' }}
              >
                <EditableText textRef={textRef(quote.index, 'text')} value={quote.block.text} />
              </p>
              {quote.block.attribution && (
                <div className="text-slide-muted">
                  —{' '}
                  <EditableText
                    textRef={textRef(quote.index, 'attribution')}
                    value={quote.block.attribution}
                  />
                </div>
              )}
            </div>
          </Adjustable>
        )}
        {paragraph && (
          <Adjustable index={paragraph.index}>
            <p
              className="max-w-md text-slide-foreground/80"
              style={{ fontFamily: 'var(--font-slide-body)' }}
            >
              <EditableText
                textRef={textRef(paragraph.index, 'text')}
                value={paragraph.block.text}
              />
            </p>
          </Adjustable>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
      ))}
      {quote && (
        <Adjustable index={quote.index}>
          <div className="flex max-w-2xl flex-col items-center gap-4">
            <span
              aria-hidden="true"
              className="text-slide-accent"
              style={{
                fontFamily: 'var(--font-slide-heading)',
                fontSize: 'var(--slide-size-h1)',
                lineHeight: 0.6,
              }}
            >
              "
            </span>
            <p
              className="text-[length:var(--slide-size-h3)] italic leading-snug text-slide-foreground"
              style={{ fontFamily: 'var(--font-slide-heading)' }}
            >
              <EditableText textRef={textRef(quote.index, 'text')} value={quote.block.text} />
            </p>
            {quote.block.attribution && (
              <div className="text-slide-muted">
                —{' '}
                <EditableText
                  textRef={textRef(quote.index, 'attribution')}
                  value={quote.block.attribution}
                />
              </div>
            )}
          </div>
        </Adjustable>
      )}
      {paragraph && (
        <Adjustable index={paragraph.index}>
          <p
            className="max-w-md text-slide-foreground/80"
            style={{ fontFamily: 'var(--font-slide-body)' }}
          >
            <EditableText textRef={textRef(paragraph.index, 'text')} value={paragraph.block.text} />
          </p>
        </Adjustable>
      )}
    </div>
  )
}
