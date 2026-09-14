import type { RefObject } from 'react'
import type { Card } from '@/engine/contentBlocks'
import type { BlockAdjust } from '@/engine/blockAdjust'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { SlideBody } from '@/components/layouts/SlideBody'
import { BlockAdjustContext } from '@/components/layouts/adjustContext'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { mergeTextStyle, type TextStyle } from '@/engine/textStyle'
import { TextEditingContext, type TextEditing } from '@/components/layouts/textEditingContext'

/**
 * Renders the deck.
 *
 * Selection is what it owns, at two levels. Clicking a card selects it, which
 * puts the toolbar into Level 2 so its tools scope to that card; clicking an
 * element *inside* the selected card selects that element and gives it a
 * selection box with resize handles. `cardRefs` exists so the outline sidebar
 * can scroll a card into view.
 *
 * How a card is arranged is never decided here. Every card goes to
 * `LayoutRenderer` and the classifier picks one of the twelve layouts —
 * including a card whose elements have been nudged, because a nudge is a delta
 * from the layout rather than a replacement for it.
 */
export function CardCanvas({
  cards,
  cardRefs,
  deckTextStyle,
  selectedCardId,
  onSelectCard,
  textEditing,
  selectedBlockIndex,
  onSelectElement,
  onChangeAdjust,
}: {
  cards: Card[]
  cardRefs: RefObject<Map<string, HTMLDivElement>>
  deckTextStyle: TextStyle
  selectedCardId: string | null
  onSelectCard: (cardId: string | null) => void
  /** Level 3 plumbing; only the selected card is given a provider. */
  textEditing: Omit<TextEditing, 'inline'>
  /** Which element of the selected card carries the selection box. */
  selectedBlockIndex: number | null
  /** Reports a press on one of a card's elements; the page decides whether that selects the element or its card. */
  onSelectElement: (cardId: string, index: number) => void
  onChangeAdjust: (cardId: string, index: number, adjust: BlockAdjust, commit?: boolean) => void
}) {
  const sorted = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)

  return (
    /*
      Pressing the empty canvas around the cards clears the selection, which is
      the way out of Level 2 and Level 3 back to Level 1. Two details make that
      reliable:

      - The target is this full-bleed wrapper, not the centred column inside it.
        The column is `max-w-5xl`, so on a wide window the strip either side of
        it is canvas the user can see and press but could not use to deselect.
        `min-h-full` extends the same target past the last card.
      - It fires on mousedown, and every card stops mousedown from reaching
        here. A `click` fires on the nearest common ancestor of its press and
        its release, so drag-selecting text and releasing past the end of the
        run would otherwise land a click on this wrapper and throw the user out
        of editing in the middle of making a selection.
    */
    <div className="min-h-full" onMouseDown={() => onSelectCard(null)}>
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
        {sorted.map((card, index) => {
          const isSelected = card.id === selectedCardId
          const body = <LayoutRenderer card={card} context={{ isFirstCard: index === 0 }} />

          return (
            <div
              key={card.id}
              ref={(el) => {
                if (el) cardRefs.current.set(card.id, el)
                else cardRefs.current.delete(card.id)
              }}
              // Keeps the press inside a card from reaching the wrapper's
              // deselect handler, which would otherwise clear the selection a
              // fraction before this click made it.
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onSelectCard(card.id)}
              className={`rounded-slide transition-shadow ${
                isSelected ? 'ring-2 ring-app-accent ring-offset-4 ring-offset-transparent' : ''
              }`}
            >
              {/*
                The style is merged here rather than nested as deck-scope +
                card-scope, because a card turning bold *off* while the deck has
                it on cannot be expressed by an inner CSS scope. See TextStyleScope.
              */}
              <TextStyleScope style={mergeTextStyle(deckTextStyle, card.textStyle)}>
                <SlideSurface className="w-full rounded-slide p-8 shadow-slide-card sm:p-10">
                  {/*
                    Only the selected card gets the *text* editing provider, so a
                    stray click can't start typing into a card nobody chose. That
                    lines up with element selection, which also needs the card
                    selected first — see `selectElement` in EditorPage.
                  */}
                  <BlockAdjustContext.Provider
                    value={{
                      // Only the selected card can be showing a selection box.
                      // Every card still gets the provider so a press on an
                      // unselected one is still *reported*; what it selects is
                      // `selectElement`'s call, and on a card that is not yet
                      // selected that is the card rather than the element.
                      selected: isSelected ? selectedBlockIndex : null,
                      select: (blockIndex) =>
                        blockIndex === null ? undefined : onSelectElement(card.id, blockIndex),
                      change: (blockIndex, adjust, commit) =>
                        onChangeAdjust(card.id, blockIndex, adjust, commit),
                    }}
                  >
                    {isSelected ? (
                      <TextEditingContext.Provider value={{ ...textEditing, inline: card.inline }}>
                        <SlideBody card={card}>{body}</SlideBody>
                      </TextEditingContext.Provider>
                    ) : (
                      <SlideBody card={card}>{body}</SlideBody>
                    )}
                  </BlockAdjustContext.Provider>
                </SlideSurface>
              </TextStyleScope>
            </div>
          )
        })}
      </div>
    </div>
  )
}
