import { blocksOfType, type ContentBlock } from '@/engine/contentBlocks'
import { Heading, StatBlockView } from './BlockRenderer'

export function StatHeroLayout({ blocks }: { blocks: ContentBlock[] }) {
  const headings = blocksOfType(blocks, 'heading')
  const stat = blocksOfType(blocks, 'stat')[0]
  const paragraphs = blocksOfType(blocks, 'paragraph')

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} />
      ))}
      {stat && <StatBlockView value={stat.value} label={stat.label} />}
      {paragraphs.map((p, i) => (
        <p key={i} className="max-w-md text-slide-foreground/80">
          {p.text}
        </p>
      ))}
    </div>
  )
}
