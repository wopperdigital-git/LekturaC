import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Stop } from '@/lesson/checkpoints'
import { clampSeek, resumeTime } from '@/lesson/player'
import {
  backTarget,
  checkpointContext,
  formatClock,
  HEARTBEAT_MS,
  progressFraction,
  seekFromFraction,
} from '@/lesson/playerUi'
import type { TakeLesson } from '@/lesson/rows'
import type { VideoRecord } from '@/video/videoRecord'
import { CheckpointCard } from './CheckpointCard'
import { LessonSummary } from './LessonSummary'
import { ReloadPrompt } from './ReloadPrompt'
import { useCheckpointSession } from './useCheckpointSession'

/**
 * The narrated video with the teacher's questions woven in. It has no native controls: the
 * play, back and progress controls below hold every seek to what the server has counted as
 * watched, playback stays at 1x, and the video pauses at each question until it is answered.
 * The rules are in `lesson/` (session, player, playerUi); this only wires them to the element.
 */
export function LessonPlayer({
  code,
  classId,
  lesson,
  video,
  videoUrl,
  stops,
  onReload,
}: {
  code: string
  classId: string
  lesson: TakeLesson
  video: VideoRecord
  videoUrl: string
  stops: readonly Stop[]
  /** Loads the lesson afresh, when the server and this page disagree about the questions. */
  onReload: () => void
}) {
  const { state, dispatch, busy, error, notice, stuck, submit, onContinue, reportPosition } = useCheckpointSession({
    code,
    classId,
    lesson,
    stops,
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const resumeAfter = useRef(false)
  const resumed = useRef(false)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [broken, setBroken] = useState(false)

  const duration = video.durationSeconds
  const watching = state.phase === 'watching'

  // Pause for a question, and tell the server where the video stopped so it counts the student
  // as having watched up to it by the time the answer arrives.
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (state.phase === 'asking') void reportPosition(el.currentTime)
    if (state.phase !== 'watching') el.pause()
  }, [state.phase, reportPosition])

  // After Continue, carry on: play, or (an ended video emits no more timeupdate) look at the
  // end again so any questions still waiting there come up.
  useEffect(() => {
    if (state.phase !== 'watching' || !resumeAfter.current) return
    resumeAfter.current = false
    const el = videoRef.current
    if (!el) return
    if (el.ended) dispatch({ type: 'tick', time: el.currentTime, ended: true })
    else void el.play().catch(() => {})
  }, [state.phase, dispatch])

  // The server refused a move: go back to where it counts the student and play on.
  useEffect(() => {
    if (state.rewindTo === null) return
    const el = videoRef.current
    if (!el) return
    el.currentTime = state.rewindTo
    void el.play().catch(() => {})
  }, [state.rewindTo])

  // Report the position every few seconds, only while the video is really playing.
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = videoRef.current
      if (!el || el.paused || el.ended) return
      void reportPosition(el.currentTime)
    }, HEARTBEAT_MS)
    return () => window.clearInterval(id)
  }, [reportPosition])

  if (state.phase === 'done') {
    return <LessonSummary lesson={lesson} answered={state.answered} score={state.score} />
  }

  const context = state.current ? checkpointContext(lesson, state.current.questionId) : null
  const asked = (state.phase === 'asking' || state.phase === 'feedback') && context !== null

  function seekTo(target: number) {
    const el = videoRef.current
    if (!el) return
    el.currentTime = target
    setTime(target)
  }

  function togglePlay() {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  }

  return (
    <div className="relative flex flex-col gap-3">
      <video
        ref={videoRef}
        src={videoUrl}
        playsInline
        preload="metadata"
        aria-label={lesson.title}
        className="aspect-video w-full rounded-app bg-black"
        onLoadedMetadata={(e) => {
          if (resumed.current) return
          resumed.current = true
          const target = clampSeek(
            resumeTime(stops, new Set(state.answered.keys()), video.slides ?? []),
            state.watchedUntil,
          )
          if (target > 0) e.currentTarget.currentTime = target
          setTime(target)
        }}
        onTimeUpdate={(e) => {
          setTime(e.currentTarget.currentTime)
          dispatch({ type: 'tick', time: e.currentTarget.currentTime, ended: e.currentTarget.ended })
        }}
        onEnded={(e) => dispatch({ type: 'tick', time: e.currentTarget.currentTime, ended: true })}
        onRateChange={(e) => {
          if (e.currentTarget.playbackRate !== 1) e.currentTarget.playbackRate = 1
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setBroken(true)}
      />

      {broken && (
        <p role="alert" className="text-sm font-medium text-app-danger-text">
          The video couldn&apos;t be played. Reload the page to try again.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={togglePlay} disabled={!watching || broken} className="w-20">
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => seekTo(backTarget(time, state.watchedUntil))}
          disabled={!watching || broken}
        >
          Back 10 s
        </Button>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(progressFraction(time, duration) * 1000)}
          disabled={!watching || broken}
          onChange={(e) => seekTo(seekFromFraction(Number(e.target.value) / 1000, duration, state.watchedUntil))}
          aria-label="Progress"
          aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
          className="min-w-0 flex-1 accent-app-accent"
        />
        <span className="font-mono text-xs tabular-nums text-app-muted">
          {formatClock(time)} / {formatClock(duration)}
        </span>
      </div>

      {notice && !stuck && (
        <p role="status" className="text-sm font-medium text-app-highlight-text">
          {notice}
        </p>
      )}

      {/* On a phone the question covers the video; on a wider screen it sits under it. */}
      {stuck && (
        <ReloadPrompt notice={notice} onReload={onReload}>
          This question can&apos;t be checked against the video yet.
        </ReloadPrompt>
      )}

      {asked && !stuck && (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-app-background/95 p-3 sm:static sm:overflow-visible sm:bg-transparent sm:p-0">
          <CheckpointCard
            key={context.question.id}
            question={context.question}
            config={context.config}
            index={context.index}
            words={context.words}
            result={state.phase === 'feedback' ? state.lastCorrect : null}
            busy={busy}
            error={error}
            onSubmit={(answer) => void submit(context.question.id, answer)}
            onContinue={() => {
              resumeAfter.current = true
              onContinue()
            }}
          />
        </div>
      )}
    </div>
  )
}
