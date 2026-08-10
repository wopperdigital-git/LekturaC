import { blocksOfType, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'

export function TimelineLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfType(blocks, 'heading')
  const steps = blocksOfType(blocks, 'timelineStep')

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-6">
        {headings.map((h, i) => (
          <Heading key={i} text={h.text} />
        ))}
        <ol className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-4 rounded-slide-sm bg-slide-surface p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                {i + 1}
              </span>
              <div>
                <div className="font-semibold text-slide-accent">{step.label}</div>
                <div className="text-slide-foreground/90">{step.text}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} />
      ))}
      <ol className="relative flex flex-col gap-6">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-[calc(var(--spacing)*1.5)] w-0.5 -translate-x-1/2 bg-slide-border"
        />
        {steps.map((step, i) => (
          <li key={i} className="relative pl-6">
            <span className="absolute left-[calc(var(--spacing)*1.5)] top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-slide-accent" />
            <div className="font-semibold text-slide-accent">{step.label}</div>
            <div className="text-slide-foreground/90">{step.text}</div>
          </li>
        ))}
      </ol>
    </div>
  )
}
