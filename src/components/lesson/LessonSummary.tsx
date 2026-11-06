import type { TakeLesson } from '@/lesson/rows'
import { groupBySection } from '@/quiz/rows'

/**
 * The end of a lesson: the score, and per question a right or wrong mark. Never the correct
 * answers; the page does not have them.
 */
export function LessonSummary({
  lesson,
  answered,
  score,
}: {
  lesson: TakeLesson
  answered: ReadonlyMap<string, boolean>
  score: number | null
}) {
  const correct = lesson.questions.filter((q) => answered.get(q.id) === true).length
  const total = lesson.questions.length

  return (
    <div>
      <div className="border-b border-app-border pb-6 text-center">
        {score !== null && (
          <p className="font-mono text-4xl font-bold tracking-tight text-app-foreground sm:text-5xl">
            {Math.round(score * 100)}%
          </p>
        )}
        <p className="mt-2 text-sm text-app-muted">
          You answered <span className="font-semibold text-app-foreground">{correct}</span> of{' '}
          <span className="font-semibold text-app-foreground">{total}</span> questions correctly.
        </p>
      </div>

      <div className="flex flex-col gap-6 pt-6">
        {groupBySection(lesson.sections, lesson.questions).map(({ section, index, questions }) => (
          <section key={index} aria-label={section.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-muted">{section.title}</h3>
            <ol className="divide-y divide-app-border">
              {questions.map((q, i) => {
                const right = answered.get(q.id) === true
                return (
                  <li key={q.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                    <span
                      className={`mt-0.5 inline-grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        right ? 'bg-app-highlight/15 text-app-highlight-text' : 'bg-app-danger/15 text-app-danger-text'
                      }`}
                      aria-label={right ? 'Correct' : 'Incorrect'}
                    >
                      {right ? '✓' : '✕'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-xs font-medium text-app-muted">Question {i + 1}</span>
                      <p className="mt-1 text-sm leading-snug text-app-foreground">{q.prompt}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
