import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Leftovers } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_BODY_FONT, SLIDE_HEADING_FONT } from '@/lib/theme-tokens'

/** Cinematic opening title card: big heading, optional short subtitle, no clutter. */
export function HeroLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const heading = blocksOfTypeIndexed(blocks, 'heading')[0]
  const paragraph = blocksOfTypeIndexed(blocks, 'paragraph')[0]
  // `chooseLayout` only awards hero to a spare card, but `layoutForKind` and
  // `roleLayoutHint` name it outright — so a hero can arrive carrying more than
  // a heading and one line, and the rest must not vanish.
  const consumed = [...(heading ? [heading] : []), ...(paragraph ? [paragraph] : [])].map(
    (entry) => entry.index,
  )

  if (variant === 'expressive') {
    return (
      <div className="flex gap-6 py-14">
        <span className="w-1.5 shrink-0 rounded-full bg-gradient-to-b from-slide-accent to-slide-accent-soft" />
        <div className="flex flex-col gap-5 text-left">
          {heading && (
            <Adjustable index={heading.index}>
            <h1
              className="font-bold tracking-[var(--slide-letter-spacing)] text-slide-foreground"
              style={{ fontFamily: SLIDE_HEADING_FONT, fontSize: 'var(--slide-size-h1)', lineHeight: 1.05 }}
            >
              <EditableText textRef={textRef(heading.index, 'text')} value={heading.block.text} />
            </h1>
            </Adjustable>
          )}
          {paragraph && (
            <Adjustable index={paragraph.index}>
            <p
              className="max-w-lg text-[length:var(--slide-size-h3)] text-slide-muted"
              style={{ fontFamily: SLIDE_BODY_FONT }}
            >
              <EditableText textRef={textRef(paragraph.index, 'text')} value={paragraph.block.text} />
            </p>
            </Adjustable>
          )}
          <Leftovers blocks={blocks} consumed={consumed} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 py-14 text-center">
      <span className="h-1.5 w-14 rounded-full bg-gradient-to-r from-slide-accent to-slide-accent-soft" />
      {heading && (
        <Adjustable index={heading.index}>
        <h1
          className="font-bold tracking-[var(--slide-letter-spacing)] text-slide-foreground"
          style={{ fontFamily: SLIDE_HEADING_FONT, fontSize: 'var(--slide-size-h1)', lineHeight: 1.05 }}
        >
          <EditableText textRef={textRef(heading.index, 'text')} value={heading.block.text} />
        </h1>
        </Adjustable>
      )}
      {paragraph && (
        <Adjustable index={paragraph.index}>
        <p
          className="max-w-lg text-[length:var(--slide-size-h3)] text-slide-muted"
          style={{ fontFamily: SLIDE_BODY_FONT }}
        >
          <EditableText textRef={textRef(paragraph.index, 'text')} value={paragraph.block.text} />
        </p>
        </Adjustable>
      )}
      <Leftovers blocks={blocks} consumed={consumed} />
    </div>
  )
}
