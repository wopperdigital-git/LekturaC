import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading, Leftovers } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_BODY_FONT } from '@/lib/theme-tokens'

/** Flowing multi-paragraph prose for narrative cards with no natural list/number structure. */
export function TextFocusLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const paragraphs = blocksOfTypeIndexed(blocks, 'paragraph')
  const expressive = variant === 'expressive'
  // Anything this layout does not draw itself still belongs on the slide.
  const consumed = [...headings, ...paragraphs].map((entry) => entry.index)

  return (
    <div className="flex flex-col gap-5">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
      ))}
      <div className="flex max-w-prose flex-col gap-4">
        {paragraphs.map(({ block, index }, i) => (
          <Adjustable key={index} index={index}>
          <p
            className={
              expressive && i === 0
                ? 'text-[length:var(--slide-size-h3)] leading-snug text-slide-foreground'
                : 'text-[length:var(--slide-size-body)] leading-[var(--slide-line-height)] text-slide-foreground/90'
            }
            style={{ fontFamily: SLIDE_BODY_FONT }}
          >
            <EditableText textRef={textRef(index, 'text')} value={block.text} />
          </p>
          </Adjustable>
        ))}
      </div>
      <Leftovers blocks={blocks} consumed={consumed} />
    </div>
  )
}
