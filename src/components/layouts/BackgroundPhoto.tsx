import type { ReactNode } from 'react'
import type { ImageBlock } from '@/engine/contentBlocks'
import { Adjustable } from './Adjustable'
import { ON_PHOTO_ATTR } from './adjustContext'
import { PhotoCredit } from './PhotoCredit'

/**
 * A photo that is the slide's ground: it fills the whole slide, through the
 * padding to the edges, under a dark scrim, and the slide's text sits on it.
 *
 * `--slide-pad` is the surface's padding (`SlideSurface`), so the negative inset
 * reaches the slide's edge on every surface; the surface clips it to its
 * corners. It is positioned against `SlideBody`, so the layout using it must not
 * wrap it in a positioned box of its own.
 *
 * It is `Adjustable` but `fixed`: selectable (a box and the bin, nothing to move
 * or resize), like any other element so it can be removed or, later, replaced.
 * Its scrim and credit live inside the one node the selection measures.
 *
 * The scrim is what the text's readability rests on, in one of two forms (`scrim`):
 * the default gradient, never lighter than 20% black and 75% black at the bottom
 * where a title sits, or `even`, a flat 60% black for text anywhere on the
 * picture. It is a fixed set of classes rather than a theme colour because a
 * photo has no theme.
 */
export function BackgroundPhoto({
  block,
  index,
  scrim = 'gradient',
}: {
  block: ImageBlock
  index: number
  /**
   * `gradient` darkens toward the bottom, where a title sits (the hero). `even` is one flat
   * 60% black for text anywhere on the picture (the centred quote): white over 60% black on
   * pure white is about 5.7:1, where the gradient's mid-height would be about 2.9:1.
   */
  scrim?: 'gradient' | 'even'
}) {
  return (
    <Adjustable index={index} fixed>
      <div
        className="absolute z-[1] overflow-hidden"
        style={{ inset: 'calc(-1 * var(--slide-pad, 0px))' }}
      >
        <img src={block.url} alt={block.alt ?? ''} className="h-full w-full object-cover" />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${
            scrim === 'even' ? 'bg-black/60' : 'bg-gradient-to-t from-black/75 via-black/40 to-black/20'
          }`}
        />
        <PhotoCredit credit={block.credit} />
      </div>
    </Adjustable>
  )
}

/**
 * The text of a slide that has a `BackgroundPhoto`, over it.
 *
 * `data-on-photo` makes everything in it white (`index.css`): a photo has no one
 * background colour for a picked text colour to be checked against, so the
 * scrim, not a pick, decides. The box is at least the slide's own height (the
 * 16:9 floor, from the slide's width as a container unit) so its content can sit
 * at the bottom or in the middle of the picture, and it lets presses through
 * except on the text itself (`index.css`), so the photo behind stays selectable.
 */
export function PhotoStage({
  justify,
  children,
}: {
  justify: 'end' | 'center'
  children: ReactNode
}) {
  return (
    <div
      {...{ [ON_PHOTO_ATTR]: '' }}
      className={`relative z-[2] flex flex-col text-white ${justify === 'end' ? 'justify-end' : 'justify-center'}`}
      style={{
        // The surface's 16:9 floor less its padding, from the slide's content width (100cqw).
        minHeight:
          'calc((100cqw + 2 * var(--slide-pad, 0px)) * 0.5625 - 2 * var(--slide-pad, 0px))',
      }}
    >
      {children}
    </div>
  )
}
