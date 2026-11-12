// A pausable stopwatch as plain data. The caller supplies `now` (ms), so it is
// testable and survives re-renders; running iff startedAt !== null.

export interface Stopwatch {
  startedAt: number | null
  accumulatedMs: number
}

export function startStopwatch(now: number): Stopwatch {
  return { startedAt: now, accumulatedMs: 0 }
}

export function pauseStopwatch(sw: Stopwatch, now: number): Stopwatch {
  if (sw.startedAt === null) return sw
  return {
    startedAt: null,
    accumulatedMs: sw.accumulatedMs + Math.max(0, now - sw.startedAt),
  }
}

export function resumeStopwatch(sw: Stopwatch, now: number): Stopwatch {
  if (sw.startedAt !== null) return sw
  return { startedAt: now, accumulatedMs: sw.accumulatedMs }
}

export function elapsedMs(sw: Stopwatch, now: number): number {
  return sw.accumulatedMs + (sw.startedAt === null ? 0 : Math.max(0, now - sw.startedAt))
}

const two = (n: number) => String(n).padStart(2, '0')

/** "06:12", or "1:02:03" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`
}
