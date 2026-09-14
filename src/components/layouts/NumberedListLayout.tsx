import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_BODY_FONT, SLIDE_HEADING_FONT } from '@/lib/theme-tokens'

/** Full-width numbered rows for a bullet list too long or too detailed for the compact icon grid. */
export function NumberedListLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const list = blocksOfTypeIndexed(blocks, 'bulletList')[0]

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-6">
        {headings.map(({ block, index }) => (
          <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
        ))}
        {list && (
          <Adjustable index={list.index}>
          <ol className="flex flex-col gap-3" style={{ fontFamily: SLIDE_BODY_FONT }}>
            {list.block.items.map((item, i) => (
              <li key={i} className="flex items-center gap-4 rounded-slide-sm bg-slide-surface p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slide-accent to-slide-accent-soft text-sm font-semibold text-slide-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-slide-foreground/90">
                  <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                </span>
              </li>
            ))}
          </ol>
          </Adjustable>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
      ))}
      {list && (
        <Adjustable index={list.index}>
        <ol className="flex flex-col divide-y divide-slide-border" style={{ fontFamily: SLIDE_BODY_FONT }}>
          {list.block.items.map((item, i) => (
            <li key={i} className="flex items-baseline gap-4 py-3">
              <span
                className="shrink-0 text-slide-accent"
                style={{ fontFamily: SLIDE_HEADING_FONT, fontWeight: 600 }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-slide-foreground/90">
                  <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                </span>
            </li>
          ))}
        </ol>
        </Adjustable>
      )}
    </div>
  )
}
