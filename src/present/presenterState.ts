export interface PresenterState {
  index: number
  count: number
  black: boolean
  ended: boolean
}

export type PresenterAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'goto'; index: number }
  | { type: 'toggleBlack' }

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(index, count - 1))
}

export function initialPresenterState(count: number, start: number): PresenterState {
  return { index: clampIndex(start, count), count, black: false, ended: false }
}

export function reducePresenter(state: PresenterState, action: PresenterAction): PresenterState {
  if (state.count === 0) return state
  const last = state.count - 1

  switch (action.type) {
    case 'next':
      if (state.black) return { ...state, black: false }
      if (state.ended) return state
      if (state.index >= last) return { ...state, ended: true }
      return { ...state, index: state.index + 1 }
    case 'prev':
      if (state.black) return { ...state, black: false }
      if (state.ended) return { ...state, ended: false }
      return { ...state, index: Math.max(0, state.index - 1) }
    case 'first':
      return { ...state, index: 0, black: false, ended: false }
    case 'last':
      return { ...state, index: last, black: false, ended: false }
    case 'goto':
      return { ...state, index: clampIndex(action.index, state.count), black: false, ended: false }
    case 'toggleBlack':
      return { ...state, black: !state.black }
  }
}

/** How long typed digits wait for the next one before they lapse. */
export const JUMP_TIMEOUT_MS = 2000

export interface JumpBuffer {
  digits: string
  at: number
}

function expired(buffer: JumpBuffer, now: number): boolean {
  return now - buffer.at > JUMP_TIMEOUT_MS
}

/** Adds a digit to the buffer, starting over when the previous one has lapsed. */
export function typeDigit(buffer: JumpBuffer | null, digit: string, now: number): JumpBuffer {
  if (!buffer || expired(buffer, now)) return { digits: digit, at: now }
  return { digits: buffer.digits + digit, at: now }
}

/** The 0-based slide the typed number names, or null when nothing live is typed. */
export function commitJump(buffer: JumpBuffer | null, now: number): number | null {
  if (!buffer || buffer.digits === '' || expired(buffer, now)) return null
  const n = Number.parseInt(buffer.digits, 10)
  return Number.isNaN(n) ? null : n - 1
}
