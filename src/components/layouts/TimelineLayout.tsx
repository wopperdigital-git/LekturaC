import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'
import { Adjustable } from './Adjustable'
import { EditableText } from './EditableText'
import { textRef } from '@/engine/marks'

export function TimelineLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const steps = blocksOfTypeIndexed(blocks, 'timelineStep')

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-6">
        {headings.map(({ block, index }) => (
          <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
        ))}
        <ol className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <Adjustable key={step.index} index={step.index}>
              <li className="flex gap-4 rounded-slide-sm bg-slide-surface p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                  {i + 1}
                </span>
                <div>
                  <div className="font-semibold text-slide-accent">
                    <EditableText
                      textRef={textRef(step.index, 'label')}
                      value={step.block.label}
                    />
                  </div>
                  <div className="text-slide-foreground/90">
                    <EditableText textRef={textRef(step.index, 'text')} value={step.block.text} />
                  </div>
                </div>
              </li>
            </Adjustable>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
      ))}
      <ol className="relative flex flex-col gap-6">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-[calc(var(--spacing)*1.5)] w-0.5 -translate-x-1/2 bg-gradient-to-b from-slide-accent/45 via-slide-accent-soft/45 to-transparent"
        />
        {steps.map((step) => (
          <Adjustable key={step.index} index={step.index}>
            <li className="relative pl-6">
              <span className="absolute left-[calc(var(--spacing)*1.5)] top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-slide-accent" />
              <div className="font-semibold text-slide-accent">
                <EditableText textRef={textRef(step.index, 'label')} value={step.block.label} />
              </div>
              <div className="text-slide-foreground/90">
                <EditableText textRef={textRef(step.index, 'text')} value={step.block.text} />
              </div>
            </li>
          </Adjustable>
        ))}
      </ol>
    </div>
  )
}
