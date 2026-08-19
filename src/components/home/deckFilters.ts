import type { DeckSummary } from '@/store/presentationStore'

export type DeckView = 'grid' | 'list'
export type DeckSort = 'recent' | 'name'
export type UpdatedWithin = 'all' | '7d' | '30d'

export interface DeckFilters {
  sort: DeckSort
  updatedWithin: UpdatedWithin
}

export const DEFAULT_FILTERS: DeckFilters = { sort: 'recent', updatedWithin: 'all' }

export const SORT_OPTIONS: { value: DeckSort; label: string }[] = [
  { value: 'recent', label: 'Last updated' },
  { value: 'name', label: 'Name (A–Z)' },
]

export const UPDATED_OPTIONS: { value: UpdatedWithin; label: string }[] = [
  { value: 'all', label: 'Any time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const WINDOW_MS: Record<Exclude<UpdatedWithin, 'all'>, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

/** How many filters differ from the default — drives the dot on the Filter button. */
export function activeFilterCount(filters: DeckFilters): number {
  let count = 0
  if (filters.sort !== DEFAULT_FILTERS.sort) count++
  if (filters.updatedWithin !== DEFAULT_FILTERS.updatedWithin) count++
  return count
}

/** Search + filter + sort in one pass, so the list and grid views can't drift apart. */
export function selectDecks(
  decks: DeckSummary[],
  query: string,
  filters: DeckFilters,
): DeckSummary[] {
  const needle = query.trim().toLowerCase()
  const cutoff =
    filters.updatedWithin === 'all' ? null : Date.now() - WINDOW_MS[filters.updatedWithin]

  const filtered = decks.filter((deck) => {
    if (needle && !deck.title.toLowerCase().includes(needle)) return false
    if (cutoff !== null && new Date(deck.updatedAt).getTime() < cutoff) return false
    return true
  })

  // listDecks already returns updated_at desc, but sort explicitly so the control owns the order
  return filtered.sort((a, b) =>
    filters.sort === 'name'
      ? a.title.localeCompare(b.title)
      : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}
