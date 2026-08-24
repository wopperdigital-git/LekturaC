import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading, StatBlockView } from './BlockRenderer'
import { textRef } from '@/engine/marks'

export function StatGridLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const stats = blocksOfTypeIndexed(blocks, 'stat')
  const expressive = variant === 'expressive'

  return (
    <div className="flex flex-col gap-8">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
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
            <StatBlockView value={stat.block.value} label={stat.block.label} valueRef={textRef(stat.index, 'value')} labelRef={textRef(stat.index, 'label')} />
          </div>
        ))}
      </div>
    </div>
  )
}
