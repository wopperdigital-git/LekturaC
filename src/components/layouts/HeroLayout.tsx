import type { ReactNode } from 'react'
import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { singlePhoto } from '@/engine/blockPartition'
import { Leftovers } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_BODY_FONT, SLIDE_HEADING_FONT } from '@/lib/theme-tokens'
import { BackgroundPhoto, PhotoStage } from './BackgroundPhoto'

/**
 * Cinematic opening title card: big heading, optional short subtitle, no clutter.
 * Both treatments are left-aligned, on the slide's left edge like every claim. With one photo the photo is the slide's ground, under a scrim, and the title sits
 * bottom-left on it in white.
 */
export function HeroLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const heading = blocksOfTypeIndexed(blocks, 'heading')[0]
  const paragraph = blocksOfTypeIndexed(blocks, 'paragraph')[0]
  // `chooseLayout` only awards hero to a spare card, but `layoutForKind` and
  // `roleLayoutHint` name it outright — so a hero can arrive carrying more than
  // a heading and one line, and the rest must not vanish.
  const photo = singlePhoto(blocks)
  const consumed = [
    ...(heading ? [heading] : []),
    ...(paragraph ? [paragraph] : []),
    ...(photo ? [photo] : []),
  ].map((entry) => entry.index)
  // The photo's own box is positioned against the slide, so it is a sibling of the
  // text and never inside a positioned wrapper of ours.
  const onPhoto = (content: ReactNode) =>
    photo ? (
      <>
        <BackgroundPhoto block={photo.block} index={photo.index} />
        <PhotoStage justify="end">{content}</PhotoStage>
      </>
    ) : (
      content
    )

  if (variant === 'expressive') {
    return onPhoto(
      <div className={`flex flex-col items-start gap-6 py-6 text-left${photo ? '' : ' my-auto'}`}>
        {heading && (
          <Adjustable index={heading.index}>
            <h1
              className="font-extrabold tracking-[var(--slide-letter-spacing)] text-slide-foreground"
              style={{ fontFamily: SLIDE_HEADING_FONT, fontSize: 'var(--slide-size-h1)', lineHeight: 1.05 }}
            >
              <EditableText textRef={textRef(heading.index, 'text')} value={heading.block.text} />
            </h1>
          </Adjustable>
        )}
        {paragraph && (
          <Adjustable index={paragraph.index}>
            <p
              className="max-w-xl text-[length:var(--slide-size-h3)] text-slide-muted"
              style={{ fontFamily: SLIDE_BODY_FONT }}
            >
              <EditableText textRef={textRef(paragraph.index, 'text')} value={paragraph.block.text} />
            </p>
          </Adjustable>
        )}
        <Leftovers blocks={blocks} consumed={consumed} />
      </div>,
    )
  }

  return onPhoto(
    <div
      className={
        photo
          ? 'flex flex-col items-start gap-5 py-6 text-left'
          : 'my-auto flex flex-col items-start gap-5 py-6 text-left'
      }
    >
      <span className="h-1.5 w-14 rounded-full bg-gradient-to-r from-slide-accent to-slide-accent-soft" />
      {heading && (
        <Adjustable index={heading.index}>
        <h1
          className="font-bold tracking-[var(--slide-letter-spacing)] text-slide-foreground"
          style={{ fontFamily: SLIDE_HEADING_FONT, fontSize: 'var(--slide-size-h1)', lineHeight: 1.05 }}
        >
          <EditableText textRef={textRef(heading.index, 'text')} value={heading.block.text} />
        </h1>
        </Adjustable>
      )}
      {paragraph && (
        <Adjustable index={paragraph.index}>
        <p
          className="max-w-lg text-[length:var(--slide-size-h3)] text-slide-muted"
          style={{ fontFamily: SLIDE_BODY_FONT }}
        >
          <EditableText textRef={textRef(paragraph.index, 'text')} value={paragraph.block.text} />
        </p>
        </Adjustable>
      )}
      <Leftovers blocks={blocks} consumed={consumed} />
    </div>,
  )
}
