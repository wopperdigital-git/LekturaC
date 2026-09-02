import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

/**
 * The one thing on this page that asks twice: replacing words the user typed.
 *
 * Shared by both routes into a generation, because both can reach an edited
 * slide and the principle does not change between them — the checklist can
 * sweep one up among many, and "this slide only" can be pressed while standing
 * on one. A confirm on the dialog but not the button would mean the safer-
 * looking, narrower action was the one that destroyed writing silently.
 *
 * `slides` are 1-based numbers, because they are shown to a person.
 */
export function ConfirmReplaceModal({
  slides,
  onBack,
  onClose,
  onConfirm,
}: {
  slides: number[]
  onBack: () => void
  onClose: () => void
  onConfirm: () => void
}) {
  const one = slides.length === 1
  const which = slides.join(', ')

  return (
    <Modal title={`Replace ${slides.length} edited ${one ? 'script' : 'scripts'}?`} onClose={onClose}>
      <p className="text-sm text-app-muted">
        {one ? `Slide ${which} has` : `Slides ${which} have`} a script you wrote by hand. Generating
        will replace {one ? 'it' : 'them'}.
      </p>
      <p className="mt-2 text-sm text-app-muted">⌘Z undoes this.</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Replace {one ? 'it' : 'them'}
        </Button>
      </div>
    </Modal>
  )
}
