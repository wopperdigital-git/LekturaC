import { clipFileName } from './recording'
import { clampSpeed, clampVolume, type Emotion } from './settingsRow'
import type { VoiceLanguage } from './scripts'

/*
  The one file that talks to Cartesia. Everything else in `src/voice/` is pure or UI.

  The key is `VITE_CARTESIA_API_KEY`, read into the client bundle by decision: cloning
  and listing voices need a full API key (Cartesia's short-lived browser tokens only
  cover speech), and this app has no server. Cartesia's own advice is never to put a
  key in a client app, because it grants full account access, so a deployed build lets
  anyone who loads it spend on the account. If that ever matters, replace this file
  with calls to a proxy; nothing else knows how the requests are made.

  Browser access works: the API allows `Authorization`, `Cartesia-Version` and
  `Content-Type` from any origin, which is why the key travels as `Authorization`.
*/

export const CARTESIA_URL = 'https://api.cartesia.ai'
export const CARTESIA_VERSION = '2026-08-14'
export const CARTESIA_MODEL = 'sonic-3.6'

function apiKey(): string {
  return (import.meta.env.VITE_CARTESIA_API_KEY ?? '').trim()
}

/** Read at call time so a key added to `.env` is seen and a test can set one. */
export function isCartesiaConfigured(): boolean {
  return apiKey() !== ''
}

export type CartesiaErrorKind = 'auth' | 'capacity' | 'request' | 'unknown'

export class CartesiaError extends Error {
  kind: CartesiaErrorKind
  status?: number

  constructor(message: string, kind: CartesiaErrorKind, status?: number) {
    super(message)
    this.name = 'CartesiaError'
    this.kind = kind
    this.status = status
  }
}

export interface VoiceSummary {
  id: string
  name: string
  tagline: string
  description: string
  gender: string
  language: string
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/** One voice, or `null` if it has no id or no name (nothing could select or show it). */
export function parseVoice(raw: unknown): VoiceSummary | null {
  if (typeof raw !== 'object' || raw === null) return null
  const v = raw as Record<string, unknown>
  const id = text(v.id)
  const name = text(v.name)
  if (id === '' || name === '') return null
  return { id, name, tagline: text(v.tagline), description: text(v.description), gender: text(v.gender), language: text(v.language) }
}

export function parseVoices(body: unknown): VoiceSummary[] {
  const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : undefined
  if (!Array.isArray(data)) return []
  return data.map(parseVoice).filter((v): v is VoiceSummary => v !== null)
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

async function errorFor(res: Response): Promise<CartesiaError> {
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
    return new CartesiaError('Cartesia rejected the API key. Check VITE_CARTESIA_API_KEY.', 'auth', 401)
  }
  if (res.status === 403) {
    return new CartesiaError(
      detail ? `Cartesia refused the request: ${detail}` : 'Cartesia rejected the API key or your plan does not allow this.',
      'auth',
      403,
    )
  }
  if (res.status === 429 || res.status === 503) {
    return new CartesiaError('Cartesia is busy right now. Try again in a moment.', 'capacity', res.status)
  }
  return new CartesiaError(
    detail || `Cartesia returned an error (${res.status}).`,
    res.status >= 400 && res.status < 500 ? 'request' : 'unknown',
    res.status,
  )
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${apiKey()}`, 'Cartesia-Version': CARTESIA_VERSION, ...extra }
}

async function send(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  if (!isCartesiaConfigured()) {
    throw new CartesiaError('Add VITE_CARTESIA_API_KEY to your .env file to use voices.', 'auth')
  }
  let res: Response
  try {
    res = await fetch(`${CARTESIA_URL}${path}`, { ...init, signal })
  } catch (err) {
    // A cancel is not a failure to report: let it through for the caller to recognise.
    if (signal?.aborted || isAbort(err)) throw err
    throw new CartesiaError('Could not reach Cartesia. Check your connection and try again.', 'unknown')
  }
  if (!res.ok) throw await errorFor(res)
  return res
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    throw new CartesiaError('Cartesia sent a reply the app could not read.', 'unknown')
  }
}

/** The first 100 voices, premade (`mine: false`) or the account's own (`mine: true`). */
export async function listVoices(o: {
  mine: boolean
  language?: string
  q?: string
  signal?: AbortSignal
}): Promise<VoiceSummary[]> {
  const params = new URLSearchParams({ limit: '100', is_owner: String(o.mine) })
  if (o.language) params.set('language', o.language)
  const q = o.q?.trim()
  if (q) params.set('q', q)
  const res = await send(`/voices?${params.toString()}`, { method: 'GET', headers: headers() }, o.signal)
  return parseVoices(await readJson(res))
}

/** Clones a voice from a recorded clip. The language must be the one the clip was spoken in. */
export async function cloneVoice(o: {
  clip: Blob
  name: string
  language: string
  signal?: AbortSignal
}): Promise<VoiceSummary> {
  const form = new FormData()
  form.append('clip', o.clip, clipFileName(o.clip.type))
  form.append('name', o.name.trim())
  form.append('language', o.language)
  form.append('access', 'private')
  // No Content-Type: the browser has to set the multipart boundary itself.
  const res = await send('/voices/clone', { method: 'POST', headers: headers(), body: form }, o.signal)
  const voice = parseVoice(await readJson(res))
  if (!voice) throw new CartesiaError('Cartesia did not return the new voice.', 'unknown')
  return voice
}

export interface SpeakOptions {
  voiceId: string
  transcript: string
  language: VoiceLanguage
  speed: number
  volume: number
  emotion: Emotion | null
  signal?: AbortSignal
}

/** The JSON for `POST /tts/bytes`. Pure, so it can be checked without a request. */
export function speakBody(o: SpeakOptions): Record<string, unknown> {
  return {
    model_id: CARTESIA_MODEL,
    transcript: o.transcript,
    voice: o.voiceId,
    language: o.language,
    output_format: { container: 'wav', encoding: 'pcm_f32le', sample_rate: 44100 },
    generation_config: {
      speed: clampSpeed(o.speed),
      volume: clampVolume(o.volume),
      // Cartesia supports emotion for English only; elsewhere it would be a wrong-output request.
      ...(o.emotion && o.language === 'en' ? { emotion: o.emotion } : {}),
    },
  }
}

export async function speak(o: SpeakOptions): Promise<Blob> {
  const res = await send(
    '/tts/bytes',
    { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(speakBody(o)) },
    o.signal,
  )
  return res.blob()
}
