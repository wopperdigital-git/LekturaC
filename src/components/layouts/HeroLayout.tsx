import { blocksOfType, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'

/** Cinematic opening title card: big heading, optional short subtitle, no clutter. */
export function HeroLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const heading = blocksOfType(blocks, 'heading')[0]
  const paragraph = blocksOfType(blocks, 'paragraph')[0]

  if (variant === 'expressive') {
    return (
      <div className="flex gap-6 py-14">
        <span className="w-1.5 shrink-0 rounded-full bg-slide-accent" />
        <div className="flex flex-col gap-5 text-left">
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
      </div>
    )
  }

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
