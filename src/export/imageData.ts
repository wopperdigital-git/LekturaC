import type { Card } from '@/engine/contentBlocks'

/*
  Photos for the .pptx.

  An image block holds a URL, and PowerPoint needs the bytes, so the export
  fetches each picture once, up front (`prefetchDeckImages`), and hands the
  renderers a plain url -> data-URL map. The renderers stay pure: they never
  fetch, and a url missing from the map means "draw the alt text instead".

  Nothing here may fail the export. A host without CORS headers, a dead link, a
  page that is not a picture and a slow server all come back as "no data for
  this url", and the slide keeps its alt-text box.
*/

/** A picture that has not arrived in this long is given up on, so one slow host cannot hold the download. */
const FETCH_TIMEOUT_MS = 15_000

function toBase64(bytes: Uint8Array): string {
  // Chunked: spreading a few hundred kilobytes into one `fromCharCode` call overflows the stack.
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * One picture as a `data:image/<type>;base64,…` URL, or `null` on any failure:
 * a network error (CORS included), a non-2xx status, or a body that is not a
 * raster image. SVG is refused: the file format's picture slot does not take it.
 */
export async function fetchImageData(url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(url, { credentials: 'omit', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) return null
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!type.startsWith('image/') || type.includes('svg')) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length === 0) return null
    return `data:${type};base64,${toBase64(bytes)}`
  } catch {
    return null
  }
}

/** Every distinct picture on the deck fetched in parallel; failures are simply absent from the map. */
export async function prefetchDeckImages(
  cards: Card[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const urls = new Set<string>()
  for (const card of cards) {
    for (const block of card.blocks) {
      if (block.type === 'image' && block.url) urls.add(block.url)
    }
  }
  const results = await Promise.all(
    [...urls].map(async (url) => [url, await fetchImageData(url, fetchImpl)] as const),
  )
  const map = new Map<string, string>()
  for (const [url, data] of results) {
    if (data) map.set(url, data)
  }
  return map
}

function bytesOf(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || comma < 0) return null
  try {
    const binary = atob(dataUrl.slice(comma + 1, comma + 1 + 4 * 8192))
    return Uint8Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * A picture's pixel size, read from its header (PNG, JPEG, GIF), or `null`.
 *
 * pptxgenjs crops a `cover` picture against the size it is *given*, so it has to
 * be told the picture's real aspect or the crop is computed for the wrong shape.
 * Only the header is decoded (the first ~32KB, enough to pass a JPEG's EXIF).
 */
export function imageSize(dataUrl: string): { w: number; h: number } | null {
  const b = bytesOf(dataUrl)
  if (!b || b.length < 10) return null
  const u16 = (i: number) => (b[i] << 8) | b[i + 1]
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0

  // PNG: 8-byte signature, then IHDR width/height as big-endian u32.
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const w = u32(16)
    const h = u32(20)
    return w > 0 && h > 0 ? { w, h } : null
  }

  // GIF: "GIF8", then width/height as little-endian u16.
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    const w = b[6] | (b[7] << 8)
    const h = b[8] | (b[9] << 8)
    return w > 0 && h > 0 ? { w, h } : null
  }

  // JPEG: walk the segments to a start-of-frame marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 8 < b.length) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const marker = b[i + 1]
      if (marker === 0xff) {
        i++
        continue
      }
      // SOF0-SOF15, except DHT (c4), JPG (c8) and DAC (cc).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = u16(i + 5)
        const w = u16(i + 7)
        return w > 0 && h > 0 ? { w, h } : null
      }
      // Standalone markers (RSTn, SOI, EOI, TEM) carry no length.
      if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
        i += 2
        continue
      }
      i += 2 + u16(i + 2)
    }
  }
  return null
}
