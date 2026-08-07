import { blocksOfType, type ContentBlock } from '@/engine/contentBlocks'
import { Heading, StatBlockView } from './BlockRenderer'

export function StatGridLayout({ blocks }: { blocks: ContentBlock[] }) {
  const headings = blocksOfType(blocks, 'heading')
  const stats = blocksOfType(blocks, 'stat')

  return (
    <div className="flex flex-col gap-8">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} />
      ))}
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((stat, i) => (
          <div key={i} className="border-t-2 border-slide-accent pt-4">
            <StatBlockView value={stat.value} label={stat.label} />
          </div>
        ))}
      </div>
    </div>
  )
}
