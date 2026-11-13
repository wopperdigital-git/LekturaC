import type { ReactNode } from 'react'
import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { singlePhoto } from '@/engine/blockPartition'
import { Heading, Leftovers } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_BODY_FONT, SLIDE_HEADING_FONT } from '@/lib/theme-tokens'
import { BackgroundPhoto, PhotoStage } from './BackgroundPhoto'

/*
  The quote is a multiple of the theme's h2 step rather than a bare rem, so the
  toolbar's size for the element still moves it. At the presets' 2.5rem h2 these
  are 2.25rem and 2.75rem.
*/
const STRUCTURED_QUOTE_SIZE = 'calc(var(--slide-size-h2) * 0.9)'
const EXPRESSIVE_QUOTE_SIZE = 'calc(var(--slide-size-h2) * 1.1)'

/**
 * Cinematic pull-quote treatment for a card built around one verbatim line. With one
 * photo, the photo is the slide's ground under a scrim and the quote sits on it, white.
 */
export function QuoteLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const quote = blocksOfTypeIndexed(blocks, 'quote')[0]
  const paragraph = blocksOfTypeIndexed(blocks, 'paragraph')[0]
  // Only the first quote and first paragraph are drawn here, so a second of
  // either is a leftover rather than content that disappears.
  const photo = singlePhoto(blocks)
  const consumed = [
    ...headings,
    ...(quote ? [quote] : []),
    ...(paragraph ? [paragraph] : []),
    ...(photo ? [photo] : []),
  ].map((entry) => entry.index)
  // The photo is positioned against the slide, so it is a sibling of the text.
  const onPhoto = (content: ReactNode) =>
    photo ? (
      <>
        <BackgroundPhoto block={photo.block} index={photo.index} scrim="even" />
        <PhotoStage justify="center">{content}</PhotoStage>
      </>
    ) : (
      content
    )

  if (variant === 'expressive') {
    return onPhoto(
      <div className={`flex flex-col gap-6 py-4${photo ? '' : ' my-auto'}`}>
        {headings.map(({ block, index }) => (
          <Heading key={index} text={block.text} textRef={textRef(index, 'text')} size={block.size} variant="expressive" />
        ))}
        {quote && (
          <Adjustable index={quote.index}>
            <div className="flex max-w-3xl flex-col gap-2" style={{ fontFamily: SLIDE_BODY_FONT }}>
              <span
                aria-hidden="true"
                className="select-none font-extrabold text-slide-accent"
                style={{
                  fontFamily: SLIDE_HEADING_FONT,
                  fontSize: 'calc(var(--slide-size-h1) * 3)',
                  lineHeight: 0.7,
                  height: '0.45em',
                }}
              >
                "
              </span>
              <p
                className="italic leading-tight text-slide-foreground"
                style={{ fontFamily: SLIDE_HEADING_FONT, fontSize: EXPRESSIVE_QUOTE_SIZE }}
              >
                <EditableText textRef={textRef(quote.index, 'text')} value={quote.block.text} />
              </p>
              {quote.block.attribution && (
                <div className="mt-2 text-[length:var(--slide-size-body)] font-semibold text-slide-muted">
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
              className="max-w-md text-[length:var(--slide-size-body)] text-slide-foreground/80"
              style={{ fontFamily: SLIDE_BODY_FONT }}
            >
              <EditableText
                textRef={textRef(paragraph.index, 'text')}
                value={paragraph.block.text}
              />
            </p>
          </Adjustable>
        )}
        <Leftovers blocks={blocks} consumed={consumed} />
      </div>,
    )
  }

  return onPhoto(
    <div className={`flex flex-col items-center gap-6 py-8 text-center${photo ? '' : ' my-auto'}`}>
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} size={block.size} />
      ))}
      {quote && (
        <Adjustable index={quote.index}>
          <div className="flex max-w-3xl flex-col items-center gap-4" style={{ fontFamily: SLIDE_BODY_FONT }}>
            <span
              aria-hidden="true"
              className="text-slide-accent"
              style={{
                fontFamily: SLIDE_HEADING_FONT,
                fontSize: 'var(--slide-size-h1)',
                lineHeight: 0.6,
              }}
            >
              "
            </span>
            <p
              className="italic leading-snug text-slide-foreground"
              style={{ fontFamily: SLIDE_HEADING_FONT, fontSize: STRUCTURED_QUOTE_SIZE }}
            >
              <EditableText textRef={textRef(quote.index, 'text')} value={quote.block.text} />
            </p>
            {quote.block.attribution && (
              <div className="text-[length:var(--slide-size-body)] text-slide-muted">
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
            className="max-w-md text-[length:var(--slide-size-body)] text-slide-foreground/80"
            style={{ fontFamily: SLIDE_BODY_FONT }}
          >
            <EditableText textRef={textRef(paragraph.index, 'text')} value={paragraph.block.text} />
          </p>
        </Adjustable>
      )}
      <Leftovers blocks={blocks} consumed={consumed} />
    </div>,
  )
}
