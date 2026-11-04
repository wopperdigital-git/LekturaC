import { describe, expect, it, vi } from 'vitest'
import { MAX_IMAGE_BYTES, fetchImageData, imageSize, placeableImageUrls, prefetchDeckImages } from './imageData'
import type { Card, ContentBlock } from '@/engine/contentBlocks'

// A readable JPEG header (SOF0, 800 x 600): the size is all the export needs from the bytes.
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
// Starts like a JPEG but carries no frame header, so its shape is unknown.
const UNREADABLE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03, 0x20, 0, 0, 0x02, 0x58,
])

function respond(body: Uint8Array | string, init: { status?: number; type?: string } = {}) {
  return new Response(body as BodyInit, {
    status: init.status ?? 200,
    headers: init.type ? { 'Content-Type': init.type } : {},
  })
}

const fetchOf = (response: () => Response | Promise<Response>) =>
  vi.fn(async () => response()) as unknown as typeof fetch

describe('fetchImageData', () => {
  it('returns a base64 data URL carrying the response content type', async () => {
    const data = await fetchImageData(
      'https://images.pexels.com/a.jpg',
      fetchOf(() => respond(JPEG_BYTES, { type: 'image/jpeg' })),
    )
    expect(data).toBe(`data:image/jpeg;base64,${btoa(String.fromCharCode(...JPEG_BYTES))}`)
  })

  it('drops content type parameters such as a charset', async () => {
    const data = await fetchImageData(
      'https://x.test/a.png',
      fetchOf(() => respond(PNG_BYTES, { type: 'image/png; charset=binary' })),
    )
    expect(data?.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('gives null for a 404', async () => {
    const data = await fetchImageData(
      'https://x.test/missing.jpg',
      fetchOf(() => respond('nope', { status: 404, type: 'image/jpeg' })),
    )
    expect(data).toBeNull()
  })

  it('gives null when the network fails', async () => {
    const data = await fetchImageData(
      'https://x.test/a.jpg',
      fetchOf(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    expect(data).toBeNull()
  })

  it('gives null for a page that is not an image', async () => {
    const data = await fetchImageData(
      'https://x.test/page',
      fetchOf(() => respond('<html></html>', { type: 'text/html' })),
    )
    expect(data).toBeNull()
  })

  it('gives null for a response with no content type', async () => {
    const data = await fetchImageData('https://x.test/a', fetchOf(() => respond(JPEG_BYTES)))
    expect(data).toBeNull()
  })

  it.each(['image/webp', 'image/avif', 'image/bmp', 'image/tiff', 'image/x-icon'])(
    'gives null for %s, which PowerPoint cannot be relied on to show',
    async (type) => {
      const data = await fetchImageData('https://x.test/a', fetchOf(() => respond(JPEG_BYTES, { type })))
      expect(data).toBeNull()
    },
  )

  it('accepts image/jpg as a JPEG', async () => {
    const data = await fetchImageData('https://x.test/a.jpg', fetchOf(() => respond(JPEG_BYTES, { type: 'image/jpg' })))
    expect(data?.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('gives null for a JPEG whose size cannot be read, so it is never placed stretched', async () => {
    const data = await fetchImageData(
      'https://x.test/a.jpg',
      fetchOf(() => respond(UNREADABLE_JPEG, { type: 'image/jpeg' })),
    )
    expect(data).toBeNull()
  })

  it('gives null when the server declares a body over the size cap, without reading it', async () => {
    const response = new Response(JPEG_BYTES as BodyInit, {
      headers: { 'content-type': 'image/jpeg', 'content-length': String(MAX_IMAGE_BYTES + 1) },
    })
    const buffer = vi.spyOn(response, 'arrayBuffer')
    expect(await fetchImageData('https://x.test/big.jpg', fetchOf(() => response))).toBeNull()
    expect(buffer).not.toHaveBeenCalled()
  })

  it('gives null when the body turns out larger than the cap although none was declared', async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1)
    big.set(JPEG_BYTES)
    expect(await fetchImageData('https://x.test/big.jpg', fetchOf(() => respond(big, { type: 'image/jpeg' })))).toBeNull()
  })

  it('gives null for an SVG, which PowerPoint cannot take as a picture here', async () => {
    const data = await fetchImageData(
      'https://x.test/a.svg',
      fetchOf(() => respond('<svg/>', { type: 'image/svg+xml' })),
    )
    expect(data).toBeNull()
  })
})

const image = (url: string): ContentBlock => ({ type: 'image', url })
const cardOf = (id: string, blocks: ContentBlock[]): Card => ({
  id,
  orderIndex: 0,
  blocks,
  layout: 'auto',
  visualStyle: 'structured',
})

const heading = (text = 'Title'): ContentBlock => ({ type: 'heading', text })
const paragraph = (text = 'Words'): ContentBlock => ({ type: 'paragraph', text })

describe('prefetchDeckImages', () => {
  it('fetches each distinct url once and keys the result by url', async () => {
    const fetchImpl = vi.fn(async () => respond(JPEG_BYTES, { type: 'image/jpeg' })) as unknown as typeof fetch
    const map = await prefetchDeckImages(
      [
        cardOf('a', [heading(), paragraph(), image('https://x.test/1.jpg')]),
        cardOf('b', [heading(), paragraph(), image('https://x.test/1.jpg')]),
        cardOf('c', [heading(), paragraph(), image('https://x.test/2.jpg')]),
      ],
      fetchImpl,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect([...map.keys()].sort()).toEqual(['https://x.test/1.jpg', 'https://x.test/2.jpg'])
  })

  it('does not fetch the pictures of a gallery, which has no place for them', async () => {
    const fetchImpl = vi.fn(async () => respond(JPEG_BYTES, { type: 'image/jpeg' })) as unknown as typeof fetch
    const map = await prefetchDeckImages(
      [cardOf('a', [heading(), image('https://x.test/1.jpg'), image('https://x.test/2.jpg')])],
      fetchImpl,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(map.size).toBe(0)
  })

  it('leaves out an image that failed and keeps the rest', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('bad') ? respond('no', { status: 500 }) : respond(JPEG_BYTES, { type: 'image/jpeg' }),
    ) as unknown as typeof fetch
    const map = await prefetchDeckImages(
      [
        cardOf('a', [heading(), paragraph(), image('https://x.test/good.jpg')]),
        cardOf('b', [heading(), paragraph(), image('https://x.test/bad.jpg')]),
      ],
      fetchImpl,
    )
    expect([...map.keys()]).toEqual(['https://x.test/good.jpg'])
  })

  it('does not fetch anything for a deck with no images', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const map = await prefetchDeckImages([cardOf('a', [{ type: 'heading', text: 'Hi' }])], fetchImpl)
    expect(map.size).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('placeableImageUrls', () => {
  it('takes the lone photo of a hero, split, quote and image-slide card', () => {
    const urls = placeableImageUrls([
      cardOf('hero', [heading(), image('https://x.test/hero.jpg')]),
      cardOf('split', [heading(), paragraph(), image('https://x.test/split.jpg')]),
      cardOf('quote', [heading(), { type: 'quote', text: 'Look up' }, image('https://x.test/quote.jpg')]),
      cardOf('slide', [heading(), image('https://x.test/slide.jpg')]),
    ])
    expect(urls).toEqual([
      'https://x.test/hero.jpg',
      'https://x.test/split.jpg',
      'https://x.test/quote.jpg',
      'https://x.test/slide.jpg',
    ])
  })

  it('skips a photo on a list or stat card, where the export keeps the alt text', () => {
    const urls = placeableImageUrls([
      cardOf('first', [heading(), paragraph()]),
      cardOf('list', [heading(), { type: 'bulletList', items: ['a', 'b'] }, image('https://x.test/list.jpg')]),
      cardOf('stat', [heading(), { type: 'stat', value: '9', label: 'x' }, image('https://x.test/stat.jpg')]),
    ])
    expect(urls).toEqual([])
  })

  it('takes every image on a card with nudged elements', () => {
    const nudged: Card = {
      ...cardOf('n', [heading(), image('https://x.test/1.jpg'), image('https://x.test/2.jpg')]),
      adjusts: { '1': { dx: 0.1, dy: 0, rotation: 0 } },
    }
    expect(placeableImageUrls([cardOf('first', [heading(), paragraph()]), nudged])).toEqual([
      'https://x.test/1.jpg',
      'https://x.test/2.jpg',
    ])
  })
})

const toDataUrl = (type: string, bytes: number[]) =>
  `data:${type};base64,${btoa(String.fromCharCode(...bytes))}`

describe('imageSize', () => {
  it('reads a PNG header', () => {
    const png = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
      0, 0, 0x03, 0x20, // 800
      0, 0, 0x01, 0xf4, // 500
    ]
    expect(imageSize(toDataUrl('image/png', png))).toEqual({ w: 800, h: 500 })
  })

  it('reads a JPEG start-of-frame segment, skipping earlier segments', () => {
    const jpeg = [
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4 (two payload bytes)
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xf4, 0x03, 0x20, // SOF0: height 500, width 800
    ]
    expect(imageSize(toDataUrl('image/jpeg', jpeg))).toEqual({ w: 800, h: 500 })
  })

  it('reads a GIF header', () => {
    const gif = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0xf4, 0x01]
    expect(imageSize(toDataUrl('image/gif', gif))).toEqual({ w: 800, h: 500 })
  })

  it('gives null for bytes it cannot read', () => {
    expect(imageSize(toDataUrl('image/jpeg', [1, 2, 3]))).toBeNull()
    expect(imageSize('not a data url')).toBeNull()
  })
})
