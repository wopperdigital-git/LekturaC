import { z } from 'zod'
import type { Photo } from './types'
import { PHOTOS_NOT_SET_UP } from '@/lib/setupCopy'

/*
  The one file that talks to Pexels. A second photo source would be another file with
  the same `searchPhotos` shape; nothing else knows how the requests are made.

  The key is `VITE_PEXELS_API_KEY`, baked into the client bundle like the other keys.
  Pexels' free key is rate limited (200 requests an hour) but never billed. It travels
  as a bare `Authorization` value, with no `Bearer`.
*/

export const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search'
export const DEFAULT_PER_PAGE = 5

function envKey(): string {
  return (import.meta.env.VITE_PEXELS_API_KEY ?? '').trim()
}

/** Whether photo search has a key to use (read when the module loads). */
export const imagesConfigured: boolean = envKey() !== ''

export class ImageSearchError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ImageSearchError'
    this.status = status
  }
}

const photoSchema = z.object({
  alt: z.string().nullish(),
  photographer: z.string().min(1),
  photographer_url: z.string().min(1),
  src: z.object({ large2x: z.string().min(1) }),
})

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

export interface SearchOptions {
  signal?: AbortSignal
  perPage?: number
  orientation?: 'landscape' | 'portrait' | 'square'
  apiKey?: string
  fetchImpl?: typeof fetch
}

/** Photos for a query, best match first. A photo missing what a block needs is skipped. */
export async function searchPhotos(query: string, options: SearchOptions = {}): Promise<Photo[]> {
  const key = (options.apiKey ?? envKey()).trim()
  if (key === '') throw new ImageSearchError(PHOTOS_NOT_SET_UP)
  const q = query.trim()
  if (q === '') throw new ImageSearchError('Type what the photo should show.')

  const params = new URLSearchParams({
    query: q,
    per_page: String(options.perPage ?? DEFAULT_PER_PAGE),
    orientation: options.orientation ?? 'landscape',
  })
  const doFetch = options.fetchImpl ?? fetch

  let res: Response
  try {
    res = await doFetch(`${PEXELS_SEARCH_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: key },
      signal: options.signal,
    })
  } catch (err) {
    // A cancel is not a failure to report: let it through for the caller to recognise.
    if (options.signal?.aborted || isAbort(err)) throw err
    throw new ImageSearchError('Could not reach the photo service. Check your connection and try again.')
  }
  if (!res.ok) {
    throw new ImageSearchError(
      res.status === 429 ? 'The photo service is busy right now. Try again in a moment.' : `Photo search failed (${res.status}).`,
      res.status,
    )
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ImageSearchError('The photo service sent a reply the app could not read.', res.status)
  }
  const list = typeof body === 'object' && body !== null ? (body as { photos?: unknown }).photos : undefined
  if (!Array.isArray(list)) return []

  const photos: Photo[] = []
  for (const raw of list) {
    const parsed = photoSchema.safeParse(raw)
    if (!parsed.success) continue
    const p = parsed.data
    photos.push({
      url: p.src.large2x,
      alt: p.alt?.trim() ? p.alt.trim() : q,
      credit: { name: p.photographer, url: p.photographer_url, source: 'pexels' },
    })
  }
  return photos
}
