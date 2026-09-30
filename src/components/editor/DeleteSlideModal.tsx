import type { Card } from '@/engine/contentBlocks'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

/**
 * Asks before a slide is deleted, from the bin above the selected slide or the
 * one on its outline thumbnail. Names the slide by number and heading so a click
 * on the wrong thumbnail is caught here. Deleting is undoable (the store's
 * history re-inserts the card), and the copy says so rather than claiming it is
 * final.
 *
 * Delete takes focus on open, so Enter confirms and Escape cancels.
 */
export function DeleteSlideModal({
  card,
  number,
  onCancel,
  onConfirm,
}: {
  card: Card
  /** 1-based position in the deck. */
  number: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const heading = card.blocks.find((block) => block.type === 'heading')?.text.trim()

  return (
    <Modal title="Delete slide" onClose={onCancel}>
      <p className="text-sm text-app-muted">
        Delete slide {number}
        {heading ? (
          <>
            , <span className="font-medium text-app-foreground">"{heading}"</span>
          </>
        ) : null}
        ? You can bring it back with Undo (Ctrl+Z).
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} autoFocus>
          Delete slide
        </Button>
      </div>
    </Modal>
  )
}
