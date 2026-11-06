import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { answerLessonCheckpoint, lessonWatch } from '@/lesson/api'
import type { Stop } from '@/lesson/checkpoints'
import { isWatchRefusal, refusalAction } from '@/lesson/playerUi'
import type { TakeLesson } from '@/lesson/rows'
import { initialSession, sessionReducer } from '@/lesson/session'
import { describeError } from '@/store/presentationStore'

/** How long the server's "watch more" sentence stays on screen. */
const NOTICE_MS = 5000

let heartbeatWarned = false

/**
 * The student's walk through a lesson: the session reducer plus the two server calls it
 * needs (where the video has got to, and marking an answer). The video element and the
 * no-video list both sit on top of it, so the rules live in one place.
 */
export function useCheckpointSession({
  code,
  classId,
  lesson,
  stops,
}: {
  code: string
  classId: string
  lesson: TakeLesson
  stops: readonly Stop[]
}) {
  const reducer = useMemo(() => sessionReducer(stops), [stops])
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialSession(lesson.answered, lesson.watchedUntil, lesson.finishedScore),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // How many times the server has sent the student back to watch (for a lesson with no video to go back to).
  const [refusals, setRefusals] = useState(0)
  // Set when rewinding cannot help (the server and this page disagree about the stops): the
  // player then offers to load the lesson afresh instead of asking the same question again.
  const [stuck, setStuck] = useState(false)
  const lastRefused = useRef<string | null>(null)
  const busyRef = useRef(false)
  const lastBeat = useRef<Promise<void>>(Promise.resolve())
  const noticeTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  /** Tells the server where the video is; the reply is how far it now counts. Errors are only logged. */
  const reportPosition = useCallback(
    (position: number): Promise<void> => {
      if (!Number.isFinite(position)) return Promise.resolve()
      const beat = lessonWatch(code, classId, position).then(
        (watchedUntil) => dispatch({ type: 'watchAck', watchedUntil }),
        (err: unknown) => {
          if (heartbeatWarned) return
          heartbeatWarned = true
          console.warn('[lesson] Could not report watch progress.', err)
        },
      )
      lastBeat.current = beat
      return beat
    },
    [code, classId],
  )

  const submit = useCallback(
    async (questionId: string, answer: number | string | boolean) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setError(null)
      try {
        // The report made as the video stopped has to land first, or the server may not yet
        // count the student as having watched up to this question.
        await lastBeat.current
        const result = await answerLessonCheckpoint(code, classId, questionId, answer)
        lastRefused.current = null
        dispatch({
          type: 'answered',
          questionId,
          correct: result.correct,
          finished: result.finished,
          score: result.score,
        })
      } catch (err) {
        const message = describeError(err)
        if (isWatchRefusal(message)) {
          setRefusals((n) => n + 1)
          setNotice(message)
          window.clearTimeout(noticeTimer.current)
          if (refusalAction(message, questionId, lastRefused.current) === 'reload') {
            // The sentence stays up with the offer to reload; no timer clears it.
            setStuck(true)
          } else {
            lastRefused.current = questionId
            // 0: the reducer keeps what it already knew, and sends the student back to it.
            dispatch({ type: 'refused', watchedUntil: 0 })
            noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
          }
        } else {
          setError(err instanceof TypeError ? "Couldn't reach the server. Press Check to try again." : message)
        }
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [code, classId],
  )

  const onContinue = useCallback(() => {
    setError(null)
    dispatch({ type: 'continue' })
  }, [])

  return { state, dispatch, busy, error, notice, refusals, stuck, submit, onContinue, reportPosition }
}

export type CheckpointSession = ReturnType<typeof useCheckpointSession>
