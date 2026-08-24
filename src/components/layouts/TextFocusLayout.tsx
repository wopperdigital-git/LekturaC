import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'

/** Flowing multi-paragraph prose for narrative cards with no natural list/number structure. */
export function TextFocusLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const paragraphs = blocksOfTypeIndexed(blocks, 'paragraph')
  const expressive = variant === 'expressive'

  return (
    <div className="flex flex-col gap-5">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
      ))}
      <div className="flex max-w-prose flex-col gap-4">
        {paragraphs.map(({ block, index }, i) => (
          <p
            key={index}
            className={
              expressive && i === 0
                ? 'text-[length:var(--slide-size-h3)] leading-snug text-slide-foreground'
                : 'text-[length:var(--slide-size-body)] leading-[var(--slide-line-height)] text-slide-foreground/90'
            }
            style={{ fontFamily: 'var(--font-slide-body)' }}
          >
            <EditableText textRef={textRef(index, 'text')} value={block.text} />
          </p>
        ))}
      </div>
    </div>
  )
}
