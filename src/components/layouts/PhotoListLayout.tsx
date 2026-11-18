import type { CSSProperties } from 'react'
import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { singlePhoto } from '@/engine/blockPartition'
import { fillNode } from '@/engine/composition'
import { inferGroups, nodeKey } from '@/engine/groups'
import { SLIDE_GAP } from '@/lib/theme-tokens'
import { BlockRenderer } from './BlockRenderer'
import { BodyNode } from './BodyNode'
import { SlideFrame, frameBody } from './SlideFrame'

const ZONE = { '--zone-width': '100cqi' } as CSSProperties

/**
 * A list beside the card's photo: the photo is the frame's aside, bleeding to the slide's
 * edge on its own side (the right on even positions, the left on odd, as the split does),
 * the claim, lead and the list in the text column. The list is the ruled numbered rows
 * (`photoList` is a `numbered` hint), and the body is a container of its own with
 * `--zone-width` set to its width, so the numeral column caps by this half and not by the
 * slide.
 *
 * The aside is used only for exactly one photo (`singlePhoto`). A card the picker offers
 * this layout for with no photo, or with two, is the same body on the plain frame with
 * every node drawn in order, so no block goes undrawn.
 */
export function PhotoListLayout({
  blocks,
  variant,
  position,
}: {
  blocks: ContentBlock[]
  variant: VisualStyle
  position: number
}) {
  const photo = singlePhoto(blocks)
  const nodes = inferGroups(blocks, 'photoList')
  const filling = fillNode(nodes, frameBody(blocks, photo?.index ?? null), photo?.index ?? null)
  return (
    <SlideFrame
      blocks={blocks}
      variant={variant}
      aside={
        photo
          ? {
              node: (
                <BlockRenderer block={photo.block} index={photo.index} photoClass="aspect-[4/3]" bleed />
              ),
              side: position % 2 === 1 ? 'left' : 'right',
              width: 'half',
              index: photo.index,
              bleed: true,
            }
          : undefined
      }
    >
      {(body) => {
        const inBody = new Set(body)
        return (
          <div
            data-photo-list=""
            className="@container flex flex-1 flex-col"
            style={{ ...ZONE, gap: SLIDE_GAP.group }}
          >
            {nodes
              .filter((node) => inBody.has(nodeKey(node)))
              .map((node) => (
                <BodyNode key={nodeKey(node)} node={node} variant={variant} fill={nodeKey(node) === filling} />
              ))}
          </div>
        )
      }}
    </SlideFrame>
  )
}
