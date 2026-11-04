import type { Card } from '@/engine/contentBlocks'
import { singlePhoto } from '@/engine/blockPartition'
import { resolveLayout } from '@/engine/layoutEngine'

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

/** A picture over this size is not embedded: a few of them would make the file unwieldy to build and send. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024

/**
 * The formats PowerPoint shows everywhere and `imageSize` can read. WebP, AVIF, BMP,
 * TIFF, icons and SVG are refused: older PowerPoint, Keynote and Google Slides show
 * them as a red cross, which is worse than the alt text.
 */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
}

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
 * a network error (CORS included), a non-2xx status, a type that is not JPEG, PNG or
 * GIF, a body over `MAX_IMAGE_BYTES`, or bytes whose size cannot be read (the crop
 * needs the picture's real shape; an unreadable one would be stretched).
 */
export async function fetchImageData(url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(url, { credentials: 'omit', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) return null
    const type = ALLOWED_TYPES[(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()]
    if (!type) return null
    const declared = Number(response.headers.get('content-length'))
    if (declared > MAX_IMAGE_BYTES) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null
    const data = `data:${type};base64,${toBase64(bytes)}`
    return imageSize(data) ? data : null
  } catch {
    return null
  }
}

/**
 * The urls of the pictures the export can actually place, in deck order.
 *
 * A nudged card places every image block in its frame; otherwise only the layouts that
 * give a lone photo a place (hero and quote backgrounds, the split, the image slide).
 * A gallery or a list with photos has none, so fetching those would only spend
 * bandwidth on pictures that are then dropped.
 */
export function placeableImageUrls(cards: Card[]): string[] {
  const urls = new Set<string>()
  cards.forEach((card, index) => {
    if (card.adjusts && Object.keys(card.adjusts).length > 0) {
      for (const block of card.blocks) {
        if (block.type === 'image' && block.url) urls.add(block.url)
      }
      return
    }
    const layout = resolveLayout(card.layout, card.blocks, { isFirstCard: index === 0 })
    if (layout !== 'hero' && layout !== 'quote' && layout !== 'standardSplit' && layout !== 'imageFocus') return
    const photo = singlePhoto(card.blocks)
    if (photo && photo.block.url) urls.add(photo.block.url)
  })
  return [...urls]
}

/**
 * The placeable pictures of a deck fetched in parallel; failures are simply absent from
 * the map. `cards` must be in deck order (the first is the opening slide).
 */
export async function prefetchDeckImages(
  cards: Card[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const urls = placeableImageUrls(cards)
  const results = await Promise.all(
    [...urls].map(async (url) => [url, await fetchImageData(url, fetchImpl)] as const),
  )
  const map = new Map<string, string>()
  for (const [url, data] of results) {
    if (data) map.set(url, data)
  }
  return map
}

/** Base64 characters read for a header: 256KB of text (a multiple of 4), enough to pass a JPEG's EXIF and thumbnail. */
const HEADER_WINDOW_CHARS = 4 * 65536

function bytesOf(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || comma < 0) return null
  try {
    const binary = atob(dataUrl.slice(comma + 1, comma + 1 + HEADER_WINDOW_CHARS))
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
 * Only the header is decoded (the first 256KB of base64). Known gap: EXIF orientation is not read, so a phone photo stored rotated is placed as stored.
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
