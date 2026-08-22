import { blocksOfType, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading, StatBlockView } from './BlockRenderer'
import { idx } from './blockTags'

export function StatHeroLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfType(blocks, 'heading')
  const stat = blocksOfType(blocks, 'stat')[0]
  const paragraphs = blocksOfType(blocks, 'paragraph')

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col items-center gap-6 rounded-slide-sm bg-slide-surface p-8 sm:flex-row sm:items-center sm:gap-10">
        {stat && <StatBlockView value={stat.value} label={stat.label} blockIndex={idx(blocks, stat)} />}
        <div className="flex flex-col gap-3 text-center sm:text-left">
          {headings.map((h, i) => (
            <Heading key={i} text={h.text} blockIndex={idx(blocks, h)} path="text" />
          ))}
          {paragraphs.map((p, i) => (
            <p
              key={i}
              data-block-index={idx(blocks, p)}
              data-text-path="text"
              className="max-w-md text-slide-foreground/80"
            >
              {p.text}
            </p>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} blockIndex={idx(blocks, h)} path="text" />
      ))}
      {stat && <StatBlockView value={stat.value} label={stat.label} blockIndex={idx(blocks, stat)} />}
      {paragraphs.map((p, i) => (
        <p
              key={i}
              data-block-index={idx(blocks, p)}
              data-text-path="text"
              className="max-w-md text-slide-foreground/80"
            >
          {p.text}
        </p>
      ))}
    </div>
  )
}
