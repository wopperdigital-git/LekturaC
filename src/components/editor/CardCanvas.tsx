import type { RefObject } from 'react'
import type { Card } from '@/engine/contentBlocks'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { mergeTextStyle, type TextStyle } from '@/engine/textStyle'
import { TextEditingContext, type TextEditing } from '@/components/layouts/textEditingContext'

/**
 * Renders the deck.
 *
 * Card *content* is still read-only here — the canvas has nothing that edits a
 * block's text. What it does own is selection: clicking a card selects it,
 * which is what puts the toolbar into Level 2 so its tools scope to that card
 * instead of the whole deck. `cardRefs` exists so the outline sidebar can
 * scroll a card into view.
 */
export function CardCanvas({
  cards,
  cardRefs,
  deckTextStyle,
  selectedCardId,
  onSelectCard,
  textEditing,
}: {
  cards: Card[]
  cardRefs: RefObject<Map<string, HTMLDivElement>>
  deckTextStyle: TextStyle
  selectedCardId: string | null
  onSelectCard: (cardId: string | null) => void
  /** Level 3 plumbing; only the selected card is given a provider. */
  textEditing: Omit<TextEditing, 'inline'>
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
                    Only the selected card gets an editing provider. Without a
                    provider `EditableText` renders plain styled text with no
                    listeners, so unselected cards stay inert and a stray click
                    can't start editing a card the user hasn't chosen.
                  */}
                  {isSelected ? (
                    <TextEditingContext.Provider value={{ ...textEditing, inline: card.inline }}>
                      <LayoutRenderer card={card} context={{ isFirstCard: index === 0 }} />
                    </TextEditingContext.Provider>
                  ) : (
                    <LayoutRenderer card={card} context={{ isFirstCard: index === 0 }} />
                  )}
                </SlideSurface>
              </TextStyleScope>
            </div>
          )
        })}
      </div>
    </div>
  )
}
