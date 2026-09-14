import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading, StatBlockView } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_BODY_FONT } from '@/lib/theme-tokens'

export function StatHeroLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const stat = blocksOfTypeIndexed(blocks, 'stat')[0]
  const paragraphs = blocksOfTypeIndexed(blocks, 'paragraph')

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col items-center gap-6 rounded-slide-sm bg-slide-surface p-8 sm:flex-row sm:items-center sm:gap-10">
        {stat && <StatBlockView value={stat.block.value} label={stat.block.label} valueRef={textRef(stat.index, 'value')} labelRef={textRef(stat.index, 'label')} />}
        <div className="flex flex-col gap-3 text-center sm:text-left">
          {headings.map(({ block, index }) => (
            <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
          ))}
          {paragraphs.map(({ block, index }) => (
            <Adjustable key={index} index={index}>
              <p className="max-w-md text-slide-foreground/80" style={{ fontFamily: SLIDE_BODY_FONT }}>
                <EditableText textRef={textRef(index, 'text')} value={block.text} />
              </p>
            </Adjustable>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
      ))}
      {stat && <StatBlockView value={stat.block.value} label={stat.block.label} valueRef={textRef(stat.index, 'value')} labelRef={textRef(stat.index, 'label')} />}
      {paragraphs.map(({ block, index }) => (
        <Adjustable key={index} index={index}>
          <p className="max-w-md text-slide-foreground/80" style={{ fontFamily: SLIDE_BODY_FONT }}>
            <EditableText textRef={textRef(index, 'text')} value={block.text} />
          </p>
        </Adjustable>
      ))}
    </div>
  )
}
