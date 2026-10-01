import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { DeckQuizSummary } from '@/quiz/rows'
import { quizTypeLabel, summaryType } from '@/quiz/types'

/** A share code in a monospace chip with a Copy button. Only ever rendered for Teachers. */
export function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <code className="rounded-app-sm border border-app-border bg-app-surface px-2 py-1 font-mono text-sm tracking-wider text-app-foreground">
        {code}
      </code>
      <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  )
}

/** The quizzes already made from this deck: their codes (Teachers) and PDFs. */
export function DeckQuizList({
  quizzes,
  loadError,
  isTeacher,
  pdfBusy,
  busy,
  onPdf,
}: {
  /** `null` while loading. */
  quizzes: DeckQuizSummary[] | null
  loadError: boolean
  isTeacher: boolean
  pdfBusy: string | null
  busy: boolean
  onPdf: (quizId: string) => void
}) {
  if (loadError) return <p className="text-sm text-app-muted">The quizzes from this deck couldn&apos;t be loaded.</p>
  if (quizzes === null) return <p className="text-sm text-app-muted">Loading…</p>
  if (quizzes.length === 0) {
    return <p className="text-sm text-app-muted">No quizzes from this deck yet. Make one on the Create new quiz tab.</p>
  }
  return (
    <ul className="space-y-2">
      {quizzes.map((q) => (
        <li
          key={q.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-app border border-app-border px-3 py-2 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-app-foreground">{q.title}</p>
            <p className="text-xs text-app-muted">
              {q.itemCount} questions · {q.sections.length} {q.sections.length === 1 ? 'test' : 'tests'} ·{' '}
              {quizTypeLabel(summaryType(q.sections))} · {new Date(q.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isTeacher && <CodeChip code={q.code} />}
            <Button
              variant="secondary"
              className="!px-2 !py-1 text-xs"
              loading={pdfBusy === q.id}
              disabled={pdfBusy !== null || busy}
              onClick={() => onPdf(q.id)}
            >
              PDF
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
