import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAsync } from '@/classroom/useAsync'
import { DashboardShell } from '@/components/home/DashboardShell'
import { Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { CheckpointCard } from '@/components/lesson/CheckpointCard'
import { LessonPlayer } from '@/components/lesson/LessonPlayer'
import { LessonSummary } from '@/components/lesson/LessonSummary'
import { ReloadPrompt } from '@/components/lesson/ReloadPrompt'
import { useCheckpointSession } from '@/components/lesson/useCheckpointSession'
import { Button } from '@/components/ui/Button'
import { getLessonForTaking, lessonVideoUrl } from '@/lesson/api'
import { placeCheckpoints, type Stop } from '@/lesson/checkpoints'
import { checkpointContext, hasUsableVideo, noVideoNeedsReload } from '@/lesson/playerUi'
import type { TakeLesson } from '@/lesson/rows'
import { normalizeQuizCode } from '@/quiz/quizCode'

interface LoadedLesson {
  lesson: TakeLesson
  /** Null when there is no video to play. */
  videoUrl: string | null
  /** Counts loads, so a reload starts the lesson's session afresh from what the server now says. */
  loadId: number
}

let loads = 0

async function loadLesson(code: string, classId: string): Promise<LoadedLesson> {
  const lesson = await getLessonForTaking(code, classId)
  const wantsVideo = lesson.video !== null && (lesson.video.slides?.length ?? 0) > 0
  const videoUrl = wantsVideo && lesson.video ? await lessonVideoUrl(lesson.video.path) : null
  return { lesson, videoUrl, loadId: ++loads }
}

/**
 * Keyed on the code and class: `useAsync` keeps the previous data on screen while a new key
 * loads, so without a remount one lesson's session could answer another's questions.
 */
export function LessonPage() {
  const { code = '', classId = '' } = useParams()
  const normalized = normalizeQuizCode(code)
  return <LessonPageInner key={`${normalized}|${classId}`} code={normalized} classId={classId} />
}

function LessonPageInner({ code, classId }: { code: string; classId: string }) {
  const navigate = useNavigate()
  const { state, reload } = useAsync(() => loadLesson(code, classId), `${code}|${classId}`)
  const ready = state.status === 'ready' ? state.data.lesson : null

  return (
    <DashboardShell title={ready?.title ?? 'Lesson'} subtitle={ready?.className || undefined}>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs text-app-muted">
        <Link
          to={`/classes/${classId}`}
          className="inline-flex items-center gap-1 font-medium transition-colors hover:text-app-foreground"
        >
          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12l-4-4 4-4" />
          </svg>
          {ready?.className || 'My classes'}
        </Link>
        <span className="text-app-border">/</span>
        <span className="truncate font-semibold text-app-foreground">{ready?.title ?? 'Lesson'}</span>
      </nav>

      {state.status === 'loading' ? (
        <Panel>
          <RowsSkeleton count={3} />
        </Panel>
      ) : state.status === 'error' ? (
        <Panel>
          <PanelMessage
            title="This lesson isn't available"
            body={state.error}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => void navigate('/classes')}>
                  Go to my classes
                </Button>
                <Button variant="secondary" onClick={reload}>
                  Retry
                </Button>
              </div>
            }
          />
        </Panel>
      ) : (
        <LessonBody key={`${state.data.lesson.quizId}|${state.data.loadId}`} code={code} classId={classId} loaded={state.data} onReload={reload} />
      )}
    </DashboardShell>
  )
}

function LessonBody({
  code,
  classId,
  loaded,
  onReload,
}: {
  code: string
  classId: string
  loaded: LoadedLesson
  onReload: () => void
}) {
  const { lesson, videoUrl } = loaded
  const playable = hasUsableVideo(lesson.video, videoUrl)
  // Without a video every question is asked at the end, in order.
  const stops = useMemo(
    () => placeCheckpoints(lesson.questions, playable ? (lesson.video?.slides ?? []) : []),
    [lesson, playable],
  )

  if (playable && lesson.video && videoUrl) {
    return (
      <LessonPlayer
        code={code}
        classId={classId}
        lesson={lesson}
        video={lesson.video}
        videoUrl={videoUrl}
        stops={stops}
        onReload={onReload}
      />
    )
  }
  return <VideoRemoved code={code} classId={classId} lesson={lesson} stops={stops} onReload={onReload} />
}

/**
 * A lesson whose video is gone: what is left of it is the questions, one at a time, in the
 * order the video would have asked them. The server skips its watch check for such a lesson.
 */
function VideoRemoved({
  code,
  classId,
  lesson,
  stops,
  onReload,
}: {
  code: string
  classId: string
  lesson: TakeLesson
  stops: readonly Stop[]
  onReload: () => void
}) {
  const { state, dispatch, busy, error, notice, refusals, submit, onContinue } = useCheckpointSession({
    code,
    classId,
    lesson,
    stops,
  })
  const [acknowledged, setAcknowledged] = useState(0)
  // The link to the video could not be made but the server still wants it watched: asking again
  // would only be refused again, so stop and offer to load the lesson afresh.
  const needsReload = noVideoNeedsReload(refusals, acknowledged)

  // Nothing plays, so the first question is due at once, and again after anything that sends
  // the student back to watching.
  useEffect(() => {
    if (state.phase === 'watching' && !needsReload) dispatch({ type: 'tick', time: 0, ended: true })
  }, [state.phase, needsReload, dispatch])

  if (state.phase === 'done') {
    return <LessonSummary lesson={lesson} answered={state.answered} score={state.score} />
  }

  const current = state.current?.questionId
  const remaining = stops.filter((s) => !state.answered.has(s.questionId) || s.questionId === current)
  const context = current ? checkpointContext(lesson, current) : null

  return (
    <Panel>
      <p className="mb-4 text-sm font-medium text-app-foreground">The video for this lesson was removed.</p>
      {needsReload && (
        <ReloadPrompt
          notice={notice}
          onReload={() => {
            setAcknowledged(refusals)
            onReload()
          }}
        >
          The video couldn&apos;t be loaded, so this question can&apos;t be checked yet.
        </ReloadPrompt>
      )}
      <ol className="flex flex-col gap-3">
        {remaining.map((stop) => {
          const q = lesson.questions.find((x) => x.id === stop.questionId)
          if (!q) return null
          if (!needsReload && stop.questionId === current && context && (state.phase === 'asking' || state.phase === 'feedback')) {
            return (
              <li key={q.id}>
                <CheckpointCard
                  question={context.question}
                  config={context.config}
                  index={context.index}
                  words={context.words}
                  result={state.phase === 'feedback' ? state.lastCorrect : null}
                  busy={busy}
                  error={error}
                  onSubmit={(answer) => void submit(q.id, answer)}
                  onContinue={onContinue}
                />
              </li>
            )
          }
          return (
            <li key={q.id} className="rounded-app-sm border border-app-border bg-app-surface/30 p-3 text-sm text-app-muted">
              {q.prompt}
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
