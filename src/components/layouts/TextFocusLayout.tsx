import { blocksOfType, type ContentBlock } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'

/** Flowing multi-paragraph prose for narrative cards with no natural list/number structure. */
export function TextFocusLayout({ blocks }: { blocks: ContentBlock[] }) {
  const headings = blocksOfType(blocks, 'heading')
  const paragraphs = blocksOfType(blocks, 'paragraph')

  return (
    <div className="flex flex-col gap-5">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} />
      ))}
      <div className="flex max-w-prose flex-col gap-4">
        {paragraphs.map((p, i) => (
          <p
            key={i}
            className={
              i === 0
                ? 'text-[length:var(--slide-size-h3)] leading-snug text-slide-foreground'
                : 'text-[length:var(--slide-size-body)] leading-[var(--slide-line-height)] text-slide-foreground/90'
            }
            style={{ fontFamily: 'var(--font-slide-body)' }}
          >
            {p.text}
          </p>
        ))}
      </div>
    </div>
  )
}
