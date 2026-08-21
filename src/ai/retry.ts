/**
 * Shared transient-failure retry policy for the AI providers.
 *
 * Both providers hit the same class of failure — the model is momentarily
 * overloaded or the key's rate limit is saturated — and both recover the same
 * way, so the policy lives here rather than being copy-pasted and drifting.
 */

// 503 ("model overloaded") and 429 (rate limit) are both transient per Google's
// and Groq's own guidance — retry with backoff before surfacing an error, since
// a spike has usually cleared within a few seconds.
export const RETRYABLE_STATUS = new Set([429, 503])
export const MAX_RETRIES = 3
export const BASE_DELAY_MS = 1000

/**
 * Ceiling on a single wait.
 *
 * A `Retry-After` longer than this is clamped rather than obeyed: Groq's free
 * tier measures its TPM cap over a 60s window and will happily ask for the
 * remainder of it, and a minute of dead air under a spinner reads as a hang.
 * Retrying early likely earns a second 429 and burns an attempt — accepted,
 * because the request fails with a real error either way, and the caller's
 * signal can cut the wait short in the meantime.
 */
export const MAX_DELAY_MS = 20_000

/** Abortable delay, so cancelling during backoff doesn't wait out the timer. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/**
 * `Retry-After` in milliseconds, or `null` if absent/unparseable.
 *
 * The header comes in two shapes per RFC 9110 — a delay in seconds, or an
 * HTTP-date — and both appear in the wild, so handle each. A date already in
 * the past yields 0, not a negative wait.
 */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const trimmed = header.trim()
  if (trimmed === '') return null

  const seconds = Number(trimmed)
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : null

  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return null
  return Math.max(0, date - Date.now())
}

/**
 * How long to wait before attempt `attempt + 1` (0-indexed): 1s, 2s, 4s.
 *
 * A server-sent `Retry-After` wins when it asks for *longer* than the
 * exponential step — it knows when the window actually resets and we'd
 * otherwise retry into the same closed door. It never shortens the wait, and
 * never exceeds `MAX_DELAY_MS`.
 */
export function backoffDelayMs(attempt: number, retryAfter?: string | null): number {
  const exponential = BASE_DELAY_MS * 2 ** attempt
  const requested = parseRetryAfter(retryAfter ?? null)
  if (requested === null) return Math.min(MAX_DELAY_MS, exponential)
  return Math.min(MAX_DELAY_MS, Math.max(exponential, requested))
}
