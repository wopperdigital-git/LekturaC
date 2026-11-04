import { describe, expect, it, vi } from 'vitest'
import { fetchImageData, imageSize, prefetchDeckImages } from './imageData'
import type { Card, ContentBlock } from '@/engine/contentBlocks'

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])

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
      fetchOf(() => respond(JPEG_BYTES, { type: 'image/png; charset=binary' })),
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

describe('prefetchDeckImages', () => {
  it('fetches each distinct url once and keys the result by url', async () => {
    const fetchImpl = vi.fn(async () => respond(JPEG_BYTES, { type: 'image/jpeg' })) as unknown as typeof fetch
    const map = await prefetchDeckImages(
      [
        cardOf('a', [image('https://x.test/1.jpg'), image('https://x.test/2.jpg')]),
        cardOf('b', [image('https://x.test/1.jpg')]),
      ],
      fetchImpl,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect([...map.keys()].sort()).toEqual(['https://x.test/1.jpg', 'https://x.test/2.jpg'])
  })

  it('leaves out an image that failed and keeps the rest', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('bad') ? respond('no', { status: 500 }) : respond(JPEG_BYTES, { type: 'image/jpeg' }),
    ) as unknown as typeof fetch
    const map = await prefetchDeckImages(
      [cardOf('a', [image('https://x.test/good.jpg'), image('https://x.test/bad.jpg')])],
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
