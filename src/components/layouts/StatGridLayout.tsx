import { blocksOfType, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading, StatBlockView } from './BlockRenderer'

export function StatGridLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfType(blocks, 'heading')
  const stats = blocksOfType(blocks, 'stat')
  const expressive = variant === 'expressive'

  return (
    <div className="flex flex-col gap-8">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} />
      ))}
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((stat, i) => (
          <div
            key={i}
            className={
              expressive
                ? 'rounded-slide-sm bg-slide-surface p-5'
                : 'border-t-2 border-slide-accent pt-4'
            }
          >
            <StatBlockView value={stat.value} label={stat.label} />
          </div>
        ))}
      </div>
    </div>
  )
}
