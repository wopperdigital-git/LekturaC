import { useEffect, useState } from 'react'
import { ConfirmModal } from '@/components/classroom/ConfirmModal'
import { deleteQuiz, quizUsage } from '@/quiz/api'
import { deleteQuizMessage } from '@/quiz/deleteMessage'

/**
 * Asks before deleting a quiz, saying how many classes and student submissions go with it.
 * Delete waits for that count; if the count cannot be read the warning says so and Delete is
 * still offered (the owner may delete regardless). `onDeleted` runs after the row is gone.
 */
export function DeleteQuizConfirm({
  quiz,
  onCancel,
  onDeleted,
}: {
  quiz: { id: string; title: string }
  onCancel: () => void
  onDeleted: () => void
}) {
  const [usage, setUsage] = useState<{ classes: number; attempts: number } | 'unknown' | null>(null)

  useEffect(() => {
    let live = true
    quizUsage(quiz.id)
      .then((u) => {
        if (live) setUsage(u)
      })
      .catch(() => {
        if (live) setUsage('unknown')
      })
    return () => {
      live = false
    }
  }, [quiz.id])

  return (
    <ConfirmModal
      title="Delete quiz"
      confirmLabel="Delete"
      pendingLabel="Deleting…"
      confirmDisabled={usage === null}
      onCancel={onCancel}
      onConfirm={async () => {
        await deleteQuiz(quiz.id)
        onDeleted()
      }}
    >
      {usage === null
        ? 'Checking submissions…'
        : usage === 'unknown'
          ? `Delete “${quiz.title}”? Any student submissions will be deleted with it. This can't be undone.`
          : deleteQuizMessage(quiz.title, usage)}
    </ConfirmModal>
  )
}
