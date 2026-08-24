import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'

/** Cinematic opening title card: big heading, optional short subtitle, no clutter. */
export function HeroLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const heading = blocksOfTypeIndexed(blocks, 'heading')[0]
  const paragraph = blocksOfTypeIndexed(blocks, 'paragraph')[0]

  if (variant === 'expressive') {
    return (
      <div className="flex gap-6 py-14">
        <span className="w-1.5 shrink-0 rounded-full bg-gradient-to-b from-slide-accent to-slide-accent-soft" />
        <div className="flex flex-col gap-5 text-left">
          {heading && (
            <h1
              className="font-bold tracking-[var(--slide-letter-spacing)] text-slide-foreground"
              style={{ fontFamily: 'var(--font-slide-heading)', fontSize: 'var(--slide-size-h1)', lineHeight: 1.05 }}
            >
              <EditableText textRef={textRef(heading.index, 'text')} value={heading.block.text} />
            </h1>
          )}
          {paragraph && (
            <p
              className="max-w-lg text-[length:var(--slide-size-h3)] text-slide-muted"
              style={{ fontFamily: 'var(--font-slide-body)' }}
            >
              <EditableText textRef={textRef(paragraph.index, 'text')} value={paragraph.block.text} />
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 py-14 text-center">
      <span className="h-1.5 w-14 rounded-full bg-gradient-to-r from-slide-accent to-slide-accent-soft" />
      {heading && (
        <h1
          className="font-bold tracking-[var(--slide-letter-spacing)] text-slide-foreground"
          style={{ fontFamily: 'var(--font-slide-heading)', fontSize: 'var(--slide-size-h1)', lineHeight: 1.05 }}
        >
          <EditableText textRef={textRef(heading.index, 'text')} value={heading.block.text} />
        </h1>
      )}
      {paragraph && (
        <p
          className="max-w-lg text-[length:var(--slide-size-h3)] text-slide-muted"
          style={{ fontFamily: 'var(--font-slide-body)' }}
        >
          <EditableText textRef={textRef(paragraph.index, 'text')} value={paragraph.block.text} />
        </p>
      )}
    </div>
  )
}
