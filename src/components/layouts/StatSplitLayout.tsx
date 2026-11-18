import type { ContentBlock, StatBlock, VisualStyle } from '@/engine/contentBlocks'
import { inferGroups, nodeKey, type RenderNode } from '@/engine/groups'
import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT, SLIDE_GAP, SLIDE_HEADING_FONT, SLIDE_SIZE } from '@/lib/theme-tokens'
import { Adjustable } from './Adjustable'
import { BodyNode } from './BodyNode'
import { EditableText } from './EditableText'
import { SlideFrame } from './SlideFrame'
import { ZONE_WIDTH } from './slideFrameParts'
import { figureSize } from './figureSize'

/** A figure of up to this many characters is drawn at full size; a longer one steps down. */
const FULL_CHARS = 4

/**
 * The figure never takes more than this share of its column (the cell is a container with
 * `--zone-width`): four characters at about 0.6em each fit when the size is the width over 2.6.
 */
const FIGURE_WIDTH_DIVISOR = 2.6

/**
 * One figure beside the list that backs it: the stat's value as large accent text with its
 * label under it at the lead size (the figure sized by its own length, as the stat columns
 * size theirs), on the left two fifths from the slide's 640px container width up; the list as
 * ruled numbered rows on the right three fifths (stacked below it). The figure is accent
 * text, never a fill. Any other body block (the picker offers this layout for a card with a
 * photo or a second paragraph too) follows below the grid in order, so every block is drawn
 * once under its own index.
 */
export function StatSplitLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const expressive = variant === 'expressive'
  const nodes = inferGroups(blocks, 'statSplit')
  return (
    <SlideFrame blocks={blocks} variant={variant}>
      {(body) => {
        const inBody = new Set(body)
        const drawn = nodes.filter((node) => inBody.has(nodeKey(node)))
        const isFigure = (node: RenderNode) => node.kind === 'leaf' && node.block.type === 'stat'
        const isList = (node: RenderNode) => node.kind === 'group' && node.items[0].block.type === 'bulletList'
        const figure = drawn.find(isFigure)
        const listNode = drawn.find(isList)
        // With only one of the two there is nothing to split: one column, no empty cell.
        const both = Boolean(figure && listNode)
        const rest = drawn.filter((node) => node !== figure && node !== listNode)
        return (
          <div className="flex flex-col" style={{ gap: SLIDE_GAP.section }}>
            {(figure || listNode) && (
            <div
              data-stat-split=""
              className={`grid grid-cols-1 items-start${both ? ' @min-[640px]:grid-cols-[2fr_3fr]' : ''}`}
              style={{ columnGap: SLIDE_GAP.section, rowGap: SLIDE_GAP.group }}
            >
              {figure && figure.kind === 'leaf' && figure.block.type === 'stat' && (
                <div data-stat-cell="" className="@container min-w-0" style={ZONE_WIDTH}>
                  <Figure stat={figure.block} index={figure.index} expressive={expressive} />
                </div>
              )}
              {listNode && listNode.kind === 'group' && listNode.items[0].block.type === 'bulletList' && (
                <div data-list-cell="" className="@container min-w-0" style={ZONE_WIDTH}>
                  <BodyNode
                    // The list is always the ruled numbered rows beside a figure, whatever its length.
                    node={{
                      kind: 'group',
                      arrangement: 'numbered',
                      items: [{ block: listNode.items[0].block, index: listNode.items[0].index }],
                    }}
                    variant={variant}
                  />
                </div>
              )}
            </div>
            )}
            {rest.length > 0 && (
              <div className="flex flex-col" style={{ gap: SLIDE_GAP.group }}>
                {rest.map((node) => (
                  <BodyNode key={nodeKey(node)} node={node} variant={variant} />
                ))}
              </div>
            )}
          </div>
        )
      }}
    </SlideFrame>
  )
}

/** The stat as one element (one `Adjustable`): the value over its label, both editable in place. */
function Figure({ stat, index, expressive }: { stat: StatBlock; index: number; expressive: boolean }) {
  return (
    <Adjustable index={index}>
      <div className="flex min-w-0 flex-col" style={{ gap: SLIDE_GAP.tight, fontFamily: SLIDE_BODY_FONT }}>
        <div
          data-stat-figure=""
          className="min-w-0 text-slide-accent"
          style={{
            fontFamily: SLIDE_HEADING_FONT,
            fontSize: `min(${figureSize('h1', expressive ? 2.4 : 2.1, stat.value, FULL_CHARS)}, calc(var(--zone-width, 9999px) / ${FIGURE_WIDTH_DIVISOR}))`,
            fontWeight: expressive ? 800 : 600,
            lineHeight: 1,
          }}
        >
          <EditableText textRef={textRef(index, 'value')} value={stat.value} />
        </div>
        <div data-stat-label="" className="min-w-0 text-slide-muted" style={{ fontSize: SLIDE_SIZE.lead }}>
          <EditableText textRef={textRef(index, 'label')} value={stat.label} />
        </div>
      </div>
    </Adjustable>
  )
}
