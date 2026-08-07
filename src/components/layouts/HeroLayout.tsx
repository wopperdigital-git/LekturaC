import { blocksOfType, type ContentBlock } from '@/engine/contentBlocks'

/** Cinematic opening title card: big heading, optional short subtitle, no clutter. */
export function HeroLayout({ blocks }: { blocks: ContentBlock[] }) {
  const heading = blocksOfType(blocks, 'heading')[0]
  const paragraph = blocksOfType(blocks, 'paragraph')[0]

  return (
    <div className="flex flex-col items-center gap-5 py-14 text-center">
      <span className="h-1.5 w-14 rounded-full bg-slide-accent" />
      {heading && (
        <h1
          className="font-bold tracking-[var(--slide-letter-spacing)] text-slide-foreground"
          style={{ fontFamily: 'var(--font-slide-heading)', fontSize: 'var(--slide-size-h1)', lineHeight: 1.05 }}
        >
          {heading.text}
        </h1>
      )}
      {paragraph && (
        <p
          className="max-w-lg text-[length:var(--slide-size-h3)] text-slide-muted"
          style={{ fontFamily: 'var(--font-slide-body)' }}
        >
          {paragraph.text}
        </p>
      )}
    </div>
  )
}
