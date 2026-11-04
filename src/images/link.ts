import type { Photo } from './types'

/**
 * A pasted image link as a photo, or null when it is not a web address. Only http and
 * https pass: anything else (`javascript:`, `data:`, `ftp:`, plain words) is refused, since
 * the address ends up in an `<img src>` and in saved decks. There is no credit to show for
 * a link the user pasted, so the credit is empty and `source` is `'url'`.
 */
export function photoFromLink(text: string): Photo | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  // The normalised address (escaped spaces, lower-cased host), not the raw paste.
  return { url: parsed.href, alt: '', credit: { name: '', url: '', source: 'url' } }
}
