import { useCallback, useEffect, useLayoutEffect, useState, type MouseEvent, type RefObject } from 'react'
import type { Card } from '@/engine/contentBlocks'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { SelectionOverlay, type SelectionRect } from './SelectionOverlay'

export interface BlockSelection {
  cardId: string
  blockIndex: number
}

export interface EditTarget extends BlockSelection {
  path: string
}

/**
 * Outermost node for a block: several nodes share `data-block-index` (the
 * block's wrapper and each of its text fields), and the wrapper is the first of
 * them in document order.
 */
function blockNode(card: HTMLElement | undefined, blockIndex: number): HTMLElement | null {
  return card?.querySelector<HTMLElement>(`[data-block-index="${blockIndex}"]`) ?? null
}

function textNode(card: HTMLElement | undefined, target: EditTarget): HTMLElement | null {
  return (
    card?.querySelector<HTMLElement>(
      `[data-block-index="${target.blockIndex}"][data-text-path="${target.path}"]`,
    ) ?? null
  )
}

export function CardCanvas({
  cards,
  cardRefs,
  selection,
  onSelect,
  onEditText,
  onDeleteBlock,
}: {
  cards: Card[]
  cardRefs: RefObject<Map<string, HTMLDivElement>>
  selection: BlockSelection | null
  onSelect: (selection: BlockSelection | null) => void
  onEditText: (target: EditTarget, text: string) => void
  onDeleteBlock: (selection: BlockSelection) => void
}) {
  const sorted = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)
  const [rect, setRect] = useState<SelectionRect | null>(null)
  const [editing, setEditing] = useState<EditTarget | null>(null)

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    // Deliberately not skipped while editing: the click that blurs the field is
    // also the click that should select whatever was clicked, or the user has
    // to click twice to move on after an edit.
    const target = e.target as HTMLElement
    const node = target.closest<HTMLElement>('[data-block-index]')
    const cardEl = target.closest<HTMLElement>('[data-card-id]')
    if (!node || !cardEl?.dataset.cardId) {
      onSelect(null)
      return
    }
    onSelect({ cardId: cardEl.dataset.cardId, blockIndex: Number(node.dataset.blockIndex) })
  }

  function handleDoubleClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    const node = target.closest<HTMLElement>('[data-text-path]')
    const cardEl = target.closest<HTMLElement>('[data-card-id]')
    if (!node?.dataset.textPath || !cardEl?.dataset.cardId) return
    setEditing({
      cardId: cardEl.dataset.cardId,
      blockIndex: Number(node.dataset.blockIndex),
      path: node.dataset.textPath,
    })
  }

  // Measured rather than derived: the box has to track the block through theme
  // changes, window resizes, and its own text growing while being edited.
  useLayoutEffect(() => {
    if (!selection) {
      setRect(null)
      return
    }
    const cardEl = cardRefs.current.get(selection.cardId)
    const node = blockNode(cardEl, selection.blockIndex)
    if (!cardEl || !node) {
      setRect(null)
      return
    }

    function measure() {
      if (!cardEl || !node) return
      const card = cardEl.getBoundingClientRect()
      const block = node.getBoundingClientRect()
      setRect({
        top: block.top - card.top,
        left: block.left - card.left,
        width: block.width,
        height: block.height,
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(cardEl)
    observer.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [selection, cards, cardRefs])

  /*
    Editing happens in the DOM node the layout already rendered — not an input
    positioned on top of it — so the text keeps its font, size, colour and
    wrapping for free, which is what preserving the slide design actually
    requires. The store is written once on commit rather than per keystroke:
    React never re-renders the node mid-edit, so the caret cannot jump, and the
    whole edit collapses into a single undo step.
  */
  useEffect(() => {
    if (!editing) return
    const node = textNode(cardRefs.current.get(editing.cardId), editing)
    if (!node) {
      setEditing(null)
      return
    }

    const target = editing
    const original = node.textContent ?? ''
    let cancelled = false

    node.contentEditable = 'true'
    node.spellcheck = false
    node.focus()

    // The double-click that opens the field leaves the word under the cursor
    // highlighted; collapse it so the field opens for typing rather than for
    // replacement. Selecting the whole field on entry reads as "your text is
    // about to be overwritten" and makes one stray key destroy the line.
    const domSelection = window.getSelection()
    if (domSelection && domSelection.rangeCount > 0 && node.contains(domSelection.anchorNode)) {
      domSelection.collapseToEnd()
    }

    function finish() {
      node!.contentEditable = 'false'
      const next = (node!.textContent ?? '').trim()
      if (cancelled || !next || next === original.trim()) {
        // Blank fails the zod schema every text field is `min(1)` under, so an
        // emptied field reverts rather than being written.
        node!.textContent = original
      } else {
        onEditText(target, next)
      }
      setEditing(null)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        e.preventDefault()
        node!.blur()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelled = true
        node!.blur()
      }
      // Keep the editor's Delete / undo shortcuts out of the text being typed.
      e.stopPropagation()
    }

    node.addEventListener('blur', finish)
    node.addEventListener('keydown', handleKeyDown)
    return () => {
      node.removeEventListener('blur', finish)
      node.removeEventListener('keydown', handleKeyDown)
      node.contentEditable = 'false'
    }
  }, [editing, cardRefs, onEditText])

  const handleDelete = useCallback(() => {
    if (selection) onDeleteBlock(selection)
  }, [selection, onDeleteBlock])

  return (
    <div
      className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {sorted.map((card, index) => (
        <div
          key={card.id}
          data-card-id={card.id}
          ref={(el) => {
            if (el) cardRefs.current.set(card.id, el)
            else cardRefs.current.delete(card.id)
          }}
          className="relative w-full rounded-slide bg-slide-background p-8 shadow-slide sm:p-10"
        >
          <LayoutRenderer card={card} context={{ isFirstCard: index === 0 }} />
          {rect && selection?.cardId === card.id && (
            <SelectionOverlay rect={rect} editing={editing?.cardId === card.id} onDelete={handleDelete} />
          )}
        </div>
      ))}
    </div>
  )
}
