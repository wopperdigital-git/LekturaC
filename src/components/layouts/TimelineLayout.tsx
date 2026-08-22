import { blocksOfType, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'
import { idx } from './blockTags'

export function TimelineLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfType(blocks, 'heading')
  const steps = blocksOfType(blocks, 'timelineStep')

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-6">
        {headings.map((h, i) => (
          <Heading key={i} text={h.text} blockIndex={idx(blocks, h)} path="text" />
        ))}
        <ol className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <li key={i} data-block-index={idx(blocks, step)} className="flex gap-4 rounded-slide-sm bg-slide-surface p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                {i + 1}
              </span>
              <div>
                <div data-block-index={idx(blocks, step)} data-text-path="label" className="font-semibold text-slide-accent">
                  {step.label}
                </div>
                <div data-block-index={idx(blocks, step)} data-text-path="text" className="text-slide-foreground/90">
                  {step.text}
                </div>
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
        <Heading key={i} text={h.text} blockIndex={idx(blocks, h)} path="text" />
      ))}
      <ol className="relative flex flex-col gap-6">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-[calc(var(--spacing)*1.5)] w-0.5 -translate-x-1/2 bg-slide-border"
        />
        {steps.map((step, i) => (
          <li key={i} data-block-index={idx(blocks, step)} className="relative pl-6">
            <span className="absolute left-[calc(var(--spacing)*1.5)] top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-slide-accent" />
            <div data-block-index={idx(blocks, step)} data-text-path="label" className="font-semibold text-slide-accent">
                  {step.label}
                </div>
            <div data-block-index={idx(blocks, step)} data-text-path="text" className="text-slide-foreground/90">
                  {step.text}
                </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
