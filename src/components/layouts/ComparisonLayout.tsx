import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading, Leftovers } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_BODY_FONT } from '@/lib/theme-tokens'

export function ComparisonLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const groups = blocksOfTypeIndexed(blocks, 'comparisonGroup')
  // Anything this layout does not draw itself still belongs on the slide.
  const consumed = [...headings, ...groups].map((entry) => entry.index)

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-6">
        {headings.map(({ block, index }) => (
          <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
        ))}
        <div className="flex flex-col divide-y divide-slide-border">
          {groups.map((group, i) => {
            const featured = i === 0
            return (
              <Adjustable key={i} index={group.index}>
              <div className="flex flex-col gap-3 py-4" style={{ fontFamily: SLIDE_BODY_FONT }}>
                <div
                  className={`font-semibold ${featured ? 'text-slide-accent' : 'text-slide-foreground'}`}
                >
                  <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
                </div>
                <ul className="flex flex-col gap-2">
                  {group.block.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-slide-foreground/90">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          featured ? 'bg-slide-accent' : 'bg-slide-muted'
                        }`}
                      />
                      <EditableText textRef={textRef(group.index, 'items', j)} value={item} />
                    </li>
                  ))}
                </ul>
              </div>
              </Adjustable>
            )
          })}
        </div>
        <Leftovers blocks={blocks} consumed={consumed} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
      ))}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
      >
        {groups.map((group, i) => {
          const featured = i === 0
          return (
            <Adjustable key={i} index={group.index}>
            <div
              className={`rounded-slide-sm border p-4 ${
                featured ? 'border-slide-accent bg-slide-accent/10' : 'border-slide-border bg-slide-surface'
              }`}
              style={{ fontFamily: SLIDE_BODY_FONT }}
            >
              <div
                className={`mb-3 font-semibold ${featured ? 'text-slide-accent' : 'text-slide-foreground'}`}
              >
                <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
              </div>
              <ul className="flex flex-col gap-2">
                {group.block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slide-foreground/90">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        featured ? 'bg-slide-accent' : 'bg-slide-muted'
                      }`}
                    />
                    <EditableText textRef={textRef(group.index, 'items', j)} value={item} />
                  </li>
                ))}
              </ul>
            </div>
            </Adjustable>
          )
        })}
      </div>
      <Leftovers blocks={blocks} consumed={consumed} />
    </div>
  )
}
