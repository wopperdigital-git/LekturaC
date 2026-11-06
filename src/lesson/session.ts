import type { Stop } from './checkpoints'
import { dueStop } from './player'

export interface SessionState {
  phase: 'watching' | 'asking' | 'feedback' | 'done'
  /** question id -> whether the answer was right. */
  answered: Map<string, boolean>
  watchedUntil: number
  /** The stop being asked or reviewed; null while watching. */
  current: Stop | null
  lastCorrect: boolean | null
  score: number | null
  /** Set when the server refused a move; the player seeks here. Cleared by the next tick or continue. */
  rewindTo: number | null
}

export type SessionEvent =
  | { type: 'tick'; time: number; ended: boolean }
  | { type: 'watchAck'; watchedUntil: number }
  | { type: 'answered'; questionId: string; correct: boolean; finished: boolean; score: number | null }
  | { type: 'refused'; watchedUntil: number }
  | { type: 'continue' }

export function initialSession(
  answered: Map<string, boolean>,
  watchedUntil: number,
  finishedScore: number | null,
): SessionState {
  return {
    phase: finishedScore === null ? 'watching' : 'done',
    answered,
    watchedUntil,
    current: null,
    lastCorrect: null,
    score: finishedScore,
    rewindTo: null,
  }
}

export function sessionReducer(stops: readonly Stop[]): (s: SessionState, e: SessionEvent) => SessionState {
  return (s, e) => {
    switch (e.type) {
      case 'tick': {
        if (s.phase !== 'watching') return s
        const due = dueStop(e.time, e.ended, stops, new Set(s.answered.keys()))
        if (due) return { ...s, phase: 'asking', current: due, rewindTo: null }
        return s.rewindTo === null ? s : { ...s, rewindTo: null }
      }
      case 'watchAck':
        return e.watchedUntil > s.watchedUntil ? { ...s, watchedUntil: e.watchedUntil } : s
      case 'answered': {
        if (s.phase === 'done') return s
        const answered = new Map(s.answered)
        answered.set(e.questionId, e.correct)
        const current =
          s.current?.questionId === e.questionId
            ? s.current
            : (stops.find((stop) => stop.questionId === e.questionId) ?? s.current)
        // Whether that was the last question is the server's call, never inferred here.
        return {
          ...s,
          phase: e.finished ? 'done' : 'feedback',
          answered,
          current,
          lastCorrect: e.correct,
          score: e.finished ? e.score : s.score,
        }
      }
      case 'refused': {
        if (s.phase === 'done') return s
        // Back to where the server counts us, never lower than we already knew.
        const watchedUntil = Math.max(s.watchedUntil, e.watchedUntil)
        return { ...s, phase: 'watching', current: null, watchedUntil, rewindTo: watchedUntil }
      }
      case 'continue': {
        if (s.phase !== 'feedback') return s
        // The video is paused at the answered stop, so its time stands in for the playhead.
        const time = s.current?.atSeconds ?? 0
        const due = dueStop(time, false, stops, new Set(s.answered.keys()))
        if (due) return { ...s, phase: 'asking', current: due, rewindTo: null }
        return { ...s, phase: 'watching', current: null, rewindTo: null }
      }
    }
  }
}
