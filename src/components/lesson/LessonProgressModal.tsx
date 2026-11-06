import { useMemo } from 'react'
import { personLabel } from '@/classroom/format'
import type { Attempt, ClassRoom, Person } from '@/classroom/types'
import { useAsync } from '@/classroom/useAsync'
import { LoadError, RowsSkeleton } from '@/components/classroom/Panel'
import { Modal } from '@/components/ui/Modal'
import { loadLessonAnswers } from '@/lesson/api'
import {
  hardestCheckpoints,
  studentProgress,
  type HardCheckpoint,
  type StudentProgress,
} from '@/lesson/progress'
import type { LessonStatus } from '@/lesson/player'
import { loadOwnerQuiz } from '@/quiz/api'

const STATUS_LABEL: Record<LessonStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  finished: 'Finished',
}

const STATUS_STYLE: Record<LessonStatus, string> = {
  not_started: 'border-app-border bg-app-surface text-app-muted',
  in_progress: 'border-app-track-sun/70 bg-app-track-sun/20 text-app-foreground',
  finished: 'border-app-highlight/25 bg-app-highlight/10 text-app-highlight-text',
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/** Who has done the lesson and which checkpoints were missed. Pure, so a render test can feed it data. */
export function LessonProgressView({
  students,
  progress,
  hardest,
}: {
  students: readonly { id: string; name: string }[]
  progress: readonly StudentProgress[]
  hardest: readonly HardCheckpoint[]
}) {
  const byStudent = new Map(progress.map((p) => [p.studentId, p]))

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Students">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-muted">Students</h3>
        {students.length === 0 ? (
          <p className="text-sm text-app-muted">No students in this class yet.</p>
        ) : (
          <ul className="divide-y divide-app-border rounded-app-sm border border-app-border">
            {students.map((s) => {
              const p = byStudent.get(s.id)
              const status: LessonStatus = p?.status ?? 'not_started'
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0 truncate text-sm font-medium text-app-foreground">{s.name}</span>
                  <span className="flex items-center gap-2 text-xs">
                    {status === 'in_progress' && p && (
                      <span className="tabular-nums text-app-muted">
                        {p.answered} of {p.total}
                      </span>
                    )}
                    {status === 'finished' && p?.score != null && (
                      <span className="font-mono font-semibold tabular-nums text-app-foreground">{percent(p.score)}</span>
                    )}
                    <span className={`rounded-full border px-2 py-0.5 font-medium ${STATUS_STYLE[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-label="Hardest checkpoints">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-muted">Hardest checkpoints</h3>
        {hardest.length === 0 ? (
          <p className="text-sm text-app-muted">No answers yet</p>
        ) : (
          <ol className="divide-y divide-app-border rounded-app-sm border border-app-border">
            {hardest.map((h) => (
              <li key={h.questionId} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-medium text-app-muted">Slide {h.slideNumber}</span>
                  <p className="mt-0.5 text-sm leading-snug text-app-foreground">{h.prompt}</p>
                </div>
                <span className="shrink-0 text-right text-xs tabular-nums text-app-muted">
                  <span className="block font-semibold text-app-danger-text">{percent(h.missRate)} missed</span>
                  {h.missed} of {h.answered}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

/** One posted lesson's progress in one class: loads the questions and answers, then draws the view. */
export function LessonProgressModal({
  quizId,
  classRoom,
  students,
  attempts,
  onClose,
}: {
  quizId: string
  classRoom: ClassRoom
  /** The class's roster. */
  students: readonly Person[]
  /** Every attempt the teacher can see; only this quiz in this class counts. */
  attempts: readonly Attempt[]
  onClose: () => void
}) {
  const { state, reload } = useAsync(
    async () => {
      const [quiz, answers] = await Promise.all([loadOwnerQuiz(quizId), loadLessonAnswers(quizId, classRoom.id)])
      return { quiz, answers }
    },
    `${quizId}|${classRoom.id}`,
  )

  const view = useMemo(() => {
    if (state.status !== 'ready') return null
    const { quiz, answers } = state.data
    const here = attempts.filter((a) => a.quizId === quizId && a.classId === classRoom.id)
    return {
      progress: studentProgress(
        students.map((s) => s.id),
        answers,
        here,
        quiz.questions.length,
      ),
      hardest: hardestCheckpoints(
        answers,
        quiz.questions.map((q) => ({ id: q.id, prompt: q.prompt, slideNumber: q.slideNumber })),
      ),
    }
  }, [state, attempts, students, quizId, classRoom.id])

  return (
    <Modal title={`Lesson progress · ${classRoom.name}`} onClose={onClose} maxWidth="max-w-2xl">
      {state.status === 'loading' ? (
        <RowsSkeleton count={3} />
      ) : state.status === 'error' || !view ? (
        <LoadError message={state.status === 'error' ? state.error : 'Could not load progress.'} onRetry={reload} />
      ) : (
        <LessonProgressView
          students={students.map((s) => ({ id: s.id, name: personLabel(s) }))}
          progress={view.progress}
          hardest={view.hardest}
        />
      )}
    </Modal>
  )
}
