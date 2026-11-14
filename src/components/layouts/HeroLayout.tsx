import type { ReactNode } from 'react'
import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { leftoverBlocks, singlePhoto } from '@/engine/blockPartition'
import { Leftovers } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'
import { Adjustable } from './Adjustable'
import { SLIDE_BODY_FONT, SLIDE_GAP, SLIDE_HEADING_FONT, SLIDE_SIZE } from '@/lib/theme-tokens'
import { BackgroundPhoto, PhotoStage } from './BackgroundPhoto'

/*
  Without a photo the title block sits at the bottom-left of the slide (`mt-auto` on its own
  root, so it is pushed down by the floor and never centred). The circle is decoration for the
  expressive treatment: a sibling placed before the text, positioned against `SlideBody` (the
  nearest positioned ancestor, so `cqw` is the slide's content width) and bleeding past the
  padding to the top-right corner, where the surface's `overflow-clip` cuts it.
*/
const TITLE_SIZE = 'calc(var(--slide-size-h1) * 1.2)'
const EXPRESSIVE_TITLE_SIZE = 'calc(var(--slide-size-h1) * 1.45)'
const CIRCLE_STYLE = {
  top: 'calc(-1 * var(--slide-pad, 0px) - 12cqw)',
  right: 'calc(-1 * var(--slide-pad, 0px) - 8cqw)',
  width: '46cqw',
  aspectRatio: '1',
} as const

/**
 * Cinematic opening title card: big heading, optional short subtitle, no clutter.
 * Both treatments are left-aligned, on the slide's left edge like every claim. With one photo the photo is the slide's ground, under a scrim, and the title sits
 * bottom-left on it in white. Without one the block sits bottom-left on the deep ground.
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

  if (photo) {
    // With a photo nothing changes: the photo is the slide's ground and the text sits on it, in
    // white, as before the title redraw. The photo's own box is positioned against the slide, so
    // it is a sibling of the text and never inside a positioned wrapper of ours.
    const onPhoto = (content: ReactNode) => (
      <>
        <BackgroundPhoto block={photo.block} index={photo.index} />
        <PhotoStage justify="end">{content}</PhotoStage>
      </>
    )
    if (variant === 'expressive') {
      return onPhoto(
        <div className="flex flex-col items-start gap-6 py-6 text-left">
          {heading && (
            <Adjustable index={heading.index}>
              <h1
                data-hero-title=""
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
      <div className="flex flex-col items-start gap-5 py-6 text-left">
        <span className="h-1.5 w-14 rounded-full bg-gradient-to-r from-slide-accent to-slide-accent-soft" />
        {heading && (
          <Adjustable index={heading.index}>
            <h1
              data-hero-title=""
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

  const expressive = variant === 'expressive'
  const hasLeftovers = leftoverBlocks(blocks, consumed).length > 0
  return (
    <>
      {expressive && (
        <div
          aria-hidden="true"
          data-hero-ornament=""
          className="pointer-events-none absolute rounded-full bg-slide-accent opacity-[0.12]"
          style={CIRCLE_STYLE}
        />
      )}
      <div data-hero-root="" className="relative mt-auto flex flex-col items-start text-left">
        <span
          aria-hidden="true"
          data-hero-rule=""
          className="pointer-events-none block shrink-0 bg-slide-accent"
          style={{ width: '4rem', height: '3px', marginBottom: SLIDE_GAP.group }}
        />
        {heading && (
          <Adjustable index={heading.index}>
            <h1
              data-hero-title=""
              className={`${expressive ? 'font-extrabold' : 'font-bold'} tracking-[var(--slide-letter-spacing)] text-slide-foreground`}
              style={{
                fontFamily: SLIDE_HEADING_FONT,
                fontSize: expressive ? EXPRESSIVE_TITLE_SIZE : TITLE_SIZE,
                lineHeight: 1,
              }}
            >
              <EditableText textRef={textRef(heading.index, 'text')} value={heading.block.text} />
            </h1>
          </Adjustable>
        )}
        {paragraph && (
          <Adjustable index={paragraph.index}>
            <p
              data-hero-subtitle=""
              className="text-slide-muted"
              style={{
                fontFamily: SLIDE_BODY_FONT,
                fontSize: SLIDE_SIZE.lead,
                lineHeight: 1.35,
                maxWidth: '62%',
                marginTop: SLIDE_GAP.tight,
              }}
            >
              <EditableText textRef={textRef(paragraph.index, 'text')} value={paragraph.block.text} />
            </p>
          </Adjustable>
        )}
        {hasLeftovers && (
          <div style={{ marginTop: SLIDE_GAP.group }}>
            <Leftovers blocks={blocks} consumed={consumed} />
          </div>
        )}
      </div>
    </>
  )
}
