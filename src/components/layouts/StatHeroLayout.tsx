import type { ReactNode } from 'react'
import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { singlePhoto } from '@/engine/blockPartition'
import { BlockRenderer, Heading, Leftovers, StatBlockView } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_BODY_FONT, SLIDE_GAP, SLIDE_SIZE } from '@/lib/theme-tokens'
import { figureSize } from './figureSize'

/*
  The figure is the focal point: a multiple of the theme's h1 step rather than a bare rem, so a
  size picked for the element in the toolbar (which rescales `--slide-size-*`) still moves it. At
  the presets' 3.5rem h1 it is 7.7rem. `figureSize` steps a long value down so it stays inside its
  box.
*/
const FIGURE_FACTOR = 2.2
const FIGURE_LINE_HEIGHT = 0.95
// The expressive figure's own box: the slide's one accent panel (accent-foreground ink), marked `data-accent-owner`.
const STAT_PANEL =
  'min-w-0 max-w-full shrink-0 rounded-slide-sm bg-slide-accent text-center text-slide-accent-foreground @min-[640px]:max-w-[55%]'
// Beside a photo the figure has half the slide, so its panel takes less of it.
const STAT_PANEL_BESIDE_PHOTO =
  'min-w-0 max-w-full shrink-0 rounded-slide-sm bg-slide-accent text-center text-slide-accent-foreground'
const PANEL_PADDING = { paddingInline: SLIDE_GAP.section, paddingBlock: SLIDE_GAP.group }
const PANEL_PADDING_BESIDE_PHOTO = { padding: SLIDE_GAP.group }

/**
 * The figure and its words on one side, one photo on the other (the side alternates
 * with the slide's position in the deck); stacked below the slide's 640px.
 */
export function StatHeroLayout({
  blocks,
  variant,
  position,
}: {
  blocks: ContentBlock[]
  variant: VisualStyle
  position: number
}) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const stat = blocksOfTypeIndexed(blocks, 'stat')[0]
  const paragraphs = blocksOfTypeIndexed(blocks, 'paragraph')
  const photo = singlePhoto(blocks)
  // Only the FIRST stat is drawn here, so a second one is a leftover rather
  // than content that vanishes.
  const consumed = [...headings, ...paragraphs, ...(stat ? [stat] : []), ...(photo ? [photo] : [])].map(
    (e) => e.index,
  )
  const beside = (content: ReactNode) =>
    photo ? (
      <div className="my-auto grid grid-cols-1 items-center @min-[640px]:grid-cols-2" style={{ gap: SLIDE_GAP.section }}>
        {position % 2 === 1 && <PhotoSide photo={photo} />}
        <div className="min-w-0">{content}</div>
        {position % 2 === 0 && <PhotoSide photo={photo} />}
      </div>
    ) : (
      content
    )

  if (variant === 'expressive') {
    return beside(
      <div
        className={
          photo
            ? 'flex flex-col items-start'
            : 'my-auto flex flex-col items-center @min-[640px]:flex-row @min-[640px]:items-center'
        }
        style={{ gap: SLIDE_GAP.section }}
      >
        {stat && (
          <StatBlockView
            value={stat.block.value}
            label={stat.block.label}
            valueRef={textRef(stat.index, 'value')}
            labelRef={textRef(stat.index, 'label')}
            valueSize={figureSize('h1', FIGURE_FACTOR, stat.block.value, photo ? 4 : 5)}
            labelSize={SLIDE_SIZE.lead}
            lineHeight={FIGURE_LINE_HEIGHT}
            gap={SLIDE_GAP.tight}
            panel={photo ? STAT_PANEL_BESIDE_PHOTO : STAT_PANEL}
            panelStyle={photo ? PANEL_PADDING_BESIDE_PHOTO : PANEL_PADDING}
            accentOwner
          />
        )}
        <div
          className="flex min-w-0 flex-1 flex-col text-center @min-[640px]:text-left"
          style={{ gap: SLIDE_GAP.group }}
        >
          {headings.map(({ block, index }) => (
            <Heading key={index} text={block.text} textRef={textRef(index, 'text')} size={block.size} variant="expressive" />
          ))}
          {paragraphs.map(({ block, index }) => (
            <Adjustable key={index} index={index}>
              <p className="max-w-md text-slide-foreground/80" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: 'var(--slide-size-body)' }}>
                <EditableText textRef={textRef(index, 'text')} value={block.text} />
              </p>
            </Adjustable>
          ))}
          <Leftovers blocks={blocks} consumed={consumed} />
        </div>
      </div>,
    )
  }

  return beside(
    <div
      className={`flex flex-col items-center text-center${photo ? '' : ' my-auto'}`}
      style={{ gap: SLIDE_GAP.group, paddingBlock: SLIDE_GAP.group }}
    >
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} size={block.size} />
      ))}
      {stat && (
        <StatBlockView
          value={stat.block.value}
          label={stat.block.label}
          valueRef={textRef(stat.index, 'value')}
          labelRef={textRef(stat.index, 'label')}
          valueSize={figureSize('h1', FIGURE_FACTOR, stat.block.value, photo ? 5 : 8)}
          labelSize={SLIDE_SIZE.lead}
          lineHeight={FIGURE_LINE_HEIGHT}
          gap={SLIDE_GAP.tight}
        />
      )}
      {paragraphs.map(({ block, index }) => (
        <Adjustable key={index} index={index}>
          <p className="max-w-md text-slide-foreground/80" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: 'var(--slide-size-body)' }}>
            <EditableText textRef={textRef(index, 'text')} value={block.text} />
          </p>
        </Adjustable>
      ))}
      <Leftovers blocks={blocks} consumed={consumed} />
    </div>,
  )
}

function PhotoSide({ photo }: { photo: NonNullable<ReturnType<typeof singlePhoto>> }) {
  return <BlockRenderer block={photo.block} index={photo.index} photoClass="aspect-[4/3]" />
}
