import { sleep as abortableSleep } from '@/ai/retry'
import { FACE_NOT_SET_UP } from '@/lib/setupCopy'

/*
  The one file that talks to WaveSpeed. Everything else in `src/avatar/` is pure or UI.

  The key is `VITE_WAVESPEED_API_KEY`, read into the client bundle by decision, the same
  as the Cartesia key: this app has no server. A deployed build therefore lets anyone who
  loads it spend on the account. If that ever matters, replace this file with calls to a
  proxy; nothing else knows how the requests are made.

  Browser access works (checked with a live call on 2026-11-21): `api.wavespeed.ai` and
  the output CDN both answer with CORS `*`, so the key travels as `Authorization: Bearer`.
  Shapes seen in that call:
    upload  { code: 200, message: 'success', data: { type, download_url, filename, size } }
    submit  { code: 200, data: { id, model, outputs: [], status, ... } }
    poll    { code: 200, data: { status: 'processing' | 'completed' | ..., outputs: [url], error: '' } }
  The statuses observed were processing, then completed.

  Every submit is a separate billed job, so `submitTalk` is never retried, here or by a
  caller's loop. Polling and downloading are free to repeat.
*/

export const WAVESPEED_URL = 'https://api.wavespeed.ai/api/v3'

/** Longest the app waits for one clip before giving up on it. */
export const TALK_TIMEOUT_MS = 20 * 60_000

function apiKey(): string {
  return (import.meta.env.VITE_WAVESPEED_API_KEY ?? '').trim()
}

/** Read at call time so a key added to `.env` is seen and a test can set one. */
export function isWavespeedConfigured(): boolean {
  return apiKey() !== ''
}

export type WavespeedErrorKind = 'auth' | 'capacity' | 'request' | 'failed' | 'timeout' | 'unknown'

export class WavespeedError extends Error {
  kind: WavespeedErrorKind
  status?: number

  constructor(message: string, kind: WavespeedErrorKind, status?: number) {
    super(message)
    this.name = 'WavespeedError'
    this.kind = kind
    this.status = status
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

async function errorFor(res: Response): Promise<WavespeedError> {
  let detail = ''
  try {
    const body: unknown = await res.json()
    if (typeof body === 'object' && body !== null) {
      const b = body as { message?: unknown; error?: unknown }
      detail = typeof b.message === 'string' ? b.message : typeof b.error === 'string' ? b.error : ''
    }
  } catch {
    // No readable body: the status alone has to do.
  }
  if (res.status === 401) {
    return new WavespeedError("WaveSpeed didn't accept this site's key. Whoever runs the site needs to check it.", 'auth', 401)
  }
  if (res.status === 403) {
    return new WavespeedError(
      detail ? `WaveSpeed refused the request: ${detail}` : 'WaveSpeed rejected the API key or your plan does not allow this.',
      'auth',
      403,
    )
  }
  if (res.status === 429 || res.status === 503) {
    return new WavespeedError('WaveSpeed is busy right now. Try again in a moment.', 'capacity', res.status)
  }
  return new WavespeedError(
    detail || `WaveSpeed returned an error (${res.status}).`,
    res.status >= 400 && res.status < 500 ? 'request' : 'unknown',
    res.status,
  )
}

/** One request. A cancel is rethrown untouched; any other network failure is a WavespeedError. */
async function fetchChecked(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal })
  } catch (err) {
    // A cancel is not a failure to report: it always surfaces as an AbortError.
    if (isAbort(err)) throw err
    if (signal?.aborted) throw abortError()
    throw new WavespeedError('Could not reach WaveSpeed. Check your connection and try again.', 'unknown')
  }
  if (!res.ok) throw await errorFor(res)
  return res
}

async function send(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  if (!isWavespeedConfigured()) {
    throw new WavespeedError(FACE_NOT_SET_UP, 'auth')
  }
  const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${apiKey()}` }
  return fetchChecked(`${WAVESPEED_URL}${path}`, { ...init, headers }, signal)
}

async function readData(res: Response, signal?: AbortSignal): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json()
    const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined
    if (typeof data === 'object' && data !== null) return data as Record<string, unknown>
  } catch (err) {
    // A cancel while the body streams is still a cancel.
    if (isAbort(err)) throw err
    if (signal?.aborted) throw abortError()
    // Otherwise falls through to the error below.
  }
  throw new WavespeedError('WaveSpeed sent a reply the app could not read.', 'unknown')
}

/** Uploads a file to WaveSpeed's media store and returns the URL it can be read from. */
export async function uploadMedia(file: Blob, filename: string, signal?: AbortSignal): Promise<string> {
  const form = new FormData()
  form.append('file', file, filename)
  // No Content-Type: the browser has to set the multipart boundary itself.
  const res = await send('/media/upload/binary', { method: 'POST', body: form }, signal)
  const url = (await readData(res, signal)).download_url
  if (typeof url !== 'string' || url === '') {
    throw new WavespeedError('WaveSpeed did not return the uploaded file.', 'unknown')
  }
  return url
}

/**
  Starts one talking-face job and returns its id. Billed per job, so this is never
  retried: a failure is reported and the caller decides.
*/
export async function submitTalk(o: { imageUrl: string; audioUrl: string; signal?: AbortSignal }): Promise<string> {
  const res = await send(
    '/wavespeed-ai/infinitetalk',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: o.imageUrl, audio: o.audioUrl, resolution: '480p' }),
    },
    o.signal,
  )
  const id = (await readData(res, o.signal)).id
  if (typeof id !== 'string' || id === '') {
    throw new WavespeedError('WaveSpeed did not return a job id.', 'unknown')
  }
  return id
}

/** Wait before poll number `attempt` (0-based): 2 s, growing by half each time, at most 10 s. */
export function pollDelayMs(attempt: number): number {
  return Math.min(10_000, Math.round(2000 * 1.5 ** attempt))
}

const FAILED_STATUSES = new Set(['failed', 'cancelled', 'timeout', 'deleted'])

/**
  Polls a job until its clip is ready and returns the clip's URL. A dropped connection,
  429 or 5xx is waited out; a bad key, a rejected request, a failed job or the time limit
  ends it.
*/
export async function waitForTalk(
  id: string,
  signal?: AbortSignal,
  o: { sleep?: (ms: number, s?: AbortSignal) => Promise<void>; now?: () => number } = {},
): Promise<string> {
  const sleep = o.sleep ?? abortableSleep
  const now = o.now ?? Date.now
  const startedAt = now()
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError()
    try {
      const res = await send(`/predictions/${encodeURIComponent(id)}/result`, { method: 'GET' }, signal)
      const data = await readData(res, signal)
      const status = typeof data.status === 'string' ? data.status.toLowerCase() : ''
      if (status === 'completed') {
        const outputs = data.outputs
        const first = Array.isArray(outputs) ? outputs[0] : undefined
        if (typeof first !== 'string' || first === '') {
          throw new WavespeedError('WaveSpeed finished but sent no clip.', 'failed')
        }
        return first
      }
      if (FAILED_STATUSES.has(status)) {
        const reason = typeof data.error === 'string' ? data.error.trim() : ''
        throw new WavespeedError(`WaveSpeed could not make the clip (${status})${reason ? `: ${reason}` : '.'}`, 'failed')
      }
    } catch (err) {
      // Only a blip is waited out. A cancel, a bad key, a rejected request or a finished
      // job (failed or not) all end the wait.
      const blip = err instanceof WavespeedError && (err.kind === 'capacity' || err.kind === 'unknown')
      if (!blip) throw err
    }
    if (now() - startedAt > TALK_TIMEOUT_MS) {
      throw new WavespeedError('WaveSpeed took too long to make the clip.', 'timeout')
    }
    await sleep(pollDelayMs(attempt), signal)
  }
}

/** Fetches the finished clip. The output CDN needs no key, so none is sent. */
export async function downloadClip(url: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetchChecked(url, { method: 'GET' }, signal)
  try {
    return await res.blob()
  } catch (err) {
    // A cancel while the body streams is still a cancel.
    if (isAbort(err)) throw err
    if (signal?.aborted) throw abortError()
    throw new WavespeedError('The clip could not be downloaded. Try again.', 'unknown')
  }
}
