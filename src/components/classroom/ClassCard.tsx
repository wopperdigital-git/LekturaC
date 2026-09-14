import type { ClassRoom } from '@/classroom/types'
import { plural } from '@/classroom/format'
import { relativePostedAt } from '@/components/home/relativeTime'
import { Button } from '@/components/ui/Button'
import { JoinCodeChip } from './JoinCodeChip'

export function ClassCard({
  classRoom,
  studentCount,
  quizCount,
  latestAnnouncementAt,
  onOpen,
  onDelete,
}: {
  classRoom: ClassRoom
  studentCount: number
  quizCount: number
  latestAnnouncementAt: string | null
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <article className="flex flex-col rounded-app border border-app-border bg-app-background shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 cursor-pointer flex-col items-start gap-1 rounded-t-app px-5 pt-5 pb-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        <h3 className="text-base font-semibold text-app-foreground">{classRoom.name}</h3>
        {classRoom.description && <p className="line-clamp-2 text-sm text-app-muted">{classRoom.description}</p>}
        <p className="mt-2 text-xs text-app-muted">
          {plural(studentCount, 'student')} · {plural(quizCount, 'quiz', 'quizzes')} ·{' '}
          {latestAnnouncementAt ? relativePostedAt(latestAnnouncementAt) : 'No announcements yet'}
        </p>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-app-border px-5 py-3">
        <JoinCodeChip code={classRoom.joinCode} />
        <Button variant="ghost" onClick={onDelete} className="px-2 py-1 text-xs text-red-600 dark:text-red-400">
          Delete
        </Button>
      </div>
    </article>
  )
}
