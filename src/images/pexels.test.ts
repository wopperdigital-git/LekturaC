import { describe, expect, it, vi } from 'vitest'
import { contentBlockSchema } from '@/engine/contentBlocks'
import { ImageSearchError, searchPhotos } from './pexels'

function pexelsPhoto(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    alt: 'A red barn',
    photographer: 'Ada Lens',
    photographer_url: 'https://www.pexels.com/@ada',
    src: { large: 'https://images.pexels.com/1-large.jpg', large2x: 'https://images.pexels.com/1-large2x.jpg' },
    ...over,
  }
}

function okFetch(photos: unknown[]) {
  return vi.fn(async () => new Response(JSON.stringify({ photos }), { status: 200 }))
}

describe('searchPhotos', () => {
  it('builds the request with an encoded query, default page size and landscape', async () => {
    const fetchImpl = okFetch([])
    await searchPhotos('solar panels & wind', { apiKey: 'k', fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.pexels.com/v1/search?query=solar+panels+%26+wind&per_page=5&orientation=landscape')
  })

  it('honours perPage and orientation', async () => {
    const fetchImpl = okFetch([])
    await searchPhotos('x', { apiKey: 'k', fetchImpl, perPage: 12, orientation: 'portrait' })
    const [url] = fetchImpl.mock.calls[0] as unknown as [string]
    expect(url).toContain('per_page=12')
    expect(url).toContain('orientation=portrait')
  })

  it('sends the bare key as Authorization', async () => {
    const fetchImpl = okFetch([])
    await searchPhotos('x', { apiKey: 'secret-key', fetchImpl })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('secret-key')
  })

  it('maps large2x, alt and the photographer credit', async () => {
    const fetchImpl = okFetch([pexelsPhoto()])
    const photos = await searchPhotos('barn', { apiKey: 'k', fetchImpl })
    expect(photos).toEqual([
      {
        url: 'https://images.pexels.com/1-large2x.jpg',
        alt: 'A red barn',
        credit: { name: 'Ada Lens', url: 'https://www.pexels.com/@ada', source: 'pexels' },
      },
    ])
  })

  it('falls back to the query when alt is empty or missing', async () => {
    const fetchImpl = okFetch([pexelsPhoto({ alt: '' }), pexelsPhoto({ alt: undefined })])
    const photos = await searchPhotos('barn', { apiKey: 'k', fetchImpl })
    expect(photos.map((p) => p.alt)).toEqual(['barn', 'barn'])
  })

  it('skips malformed photos instead of failing the search', async () => {
    const fetchImpl = okFetch([
      pexelsPhoto(),
      { id: 2, photographer: 'No Src' },
      null,
      pexelsPhoto({ photographer: '' }),
      pexelsPhoto({ src: { large2x: '' } }),
    ])
    const photos = await searchPhotos('barn', { apiKey: 'k', fetchImpl })
    expect(photos).toHaveLength(1)
  })

  it('returns nothing for a reply without a photos array', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    expect(await searchPhotos('x', { apiKey: 'k', fetchImpl })).toEqual([])
  })

  it('rejects a non-2xx reply with an ImageSearchError carrying the status', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 429 }))
    const err = await searchPhotos('x', { apiKey: 'k', fetchImpl }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ImageSearchError)
    expect((err as ImageSearchError).status).toBe(429)
  })

  it('rejects a network failure with an ImageSearchError without a status', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('offline')
    })
    const err = await searchPhotos('x', { apiKey: 'k', fetchImpl }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ImageSearchError)
    expect((err as ImageSearchError).status).toBeNull()
  })

  it('rejects an unreadable body with an ImageSearchError', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 200 }))
    await expect(searchPhotos('x', { apiKey: 'k', fetchImpl })).rejects.toBeInstanceOf(ImageSearchError)
  })

  it('lets an abort through as an AbortError, not an ImageSearchError', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
      controller.abort()
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return new Response('{}')
    })
    const err = await searchPhotos('x', { apiKey: 'k', fetchImpl, signal: controller.signal }).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(ImageSearchError)
    expect((err as DOMException).name).toBe('AbortError')
  })

  it('rejects without calling fetch when there is no key', async () => {
    const fetchImpl = okFetch([])
    await expect(searchPhotos('x', { apiKey: '', fetchImpl })).rejects.toBeInstanceOf(ImageSearchError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a blank query without calling fetch', async () => {
    const fetchImpl = okFetch([])
    await expect(searchPhotos('   ', { apiKey: 'k', fetchImpl })).rejects.toBeInstanceOf(ImageSearchError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('image block credit', () => {
  it('parses an old image block without credit', () => {
    const block = contentBlockSchema.parse({ type: 'image', url: 'https://x/y.jpg', alt: 'a' })
    expect(block).toEqual({ type: 'image', url: 'https://x/y.jpg', alt: 'a' })
  })

  it('keeps a credit', () => {
    const credit = { name: 'Ada', url: 'https://www.pexels.com/@ada', source: 'pexels' as const }
    const block = contentBlockSchema.parse({ type: 'image', url: 'https://x/y.jpg', credit })
    expect(block).toMatchObject({ credit })
  })

  it('rejects an unknown credit source', () => {
    const r = contentBlockSchema.safeParse({ type: 'image', url: 'u', credit: { name: 'a', url: 'b', source: 'flickr' } })
    expect(r.success).toBe(false)
  })
})
