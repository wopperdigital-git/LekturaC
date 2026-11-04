import type { ContentBlock } from '@/engine/contentBlocks'
import type { Photo } from '@/images/types'
import type { GeneratedCard, GeneratedDeck } from './schemas'

/** The search the stage runs for each card; the deck job injects `searchPhotos`. */
export type PhotoSearch = (query: string, signal?: AbortSignal) => Promise<Photo[]>

function abortError(): DOMException {
  return new DOMException('Finding photos was cancelled.', 'AbortError')
}

/**
 * The photo stage: runs after validation and repair, before ingest. For each
 * card that names an `imageQuery` it searches for a photo and APPENDS one
 * `image` block as the card's last block (appending keeps every existing
 * block index, which marks, nudges and typography are keyed by).
 *
 * - Every `image` block the model wrote is removed first: it has no source we
 *   looked up, so its URL is invented. Photos come only from `search`.
 * - Best effort per card: a search that rejects, or finds nothing unused,
 *   leaves that card without a photo and never costs the deck.
 * - Searches run in parallel; duplicates are settled afterwards in card order,
 *   each card taking the first result whose `url` no earlier card has taken.
 * - Cancellation is decided here from `signal.aborted` (before and after the
 *   searches settle), never from the kind of rejection: a search can reject
 *   with an ordinary error even though the signal fired.
 * - The input deck is not mutated; cards that need no change keep identity.
 */
export async function addPhotos(
  deck: GeneratedDeck,
  search: PhotoSearch,
  signal?: AbortSignal,
): Promise<GeneratedDeck> {
  if (signal?.aborted) throw abortError()

  const settled = await Promise.allSettled(
    deck.cards.map((card) =>
      card.imageQuery === undefined ? Promise.resolve<Photo[]>([]) : search(card.imageQuery, signal),
    ),
  )

  if (signal?.aborted) throw abortError()

  const taken = new Set<string>()
  const cards = deck.cards.map((card, i): GeneratedCard => {
    const hasInvented = card.blocks.some((block) => block.type === 'image')
    const result = settled[i]
    const query = card.imageQuery
    let pick: Photo | undefined
    if (query !== undefined && result.status === 'fulfilled') {
      pick = result.value.find((photo) => !taken.has(photo.url))
      if (pick) taken.add(pick.url)
    }
    if (!hasInvented && !pick) return card

    const blocks: ContentBlock[] = card.blocks.filter((block) => block.type !== 'image')
    if (pick && query !== undefined) {
      blocks.push({ type: 'image', url: pick.url, alt: pick.alt, prompt: query, credit: pick.credit })
    }
    return { ...card, blocks }
  })

  return { ...deck, cards }
}
