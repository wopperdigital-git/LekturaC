/** Palette-only swatch tokens a deck card can land on — no colors outside the five-color system. */
const SWATCH_TOKENS = [
  { from: 'var(--app-accent)', to: 'var(--app-highlight)' },
  { from: 'var(--app-highlight)', to: 'var(--app-secondary)' },
  { from: 'var(--app-secondary)', to: 'var(--app-accent)' },
] as const

/**
 * Deterministic swatch per deck id — same deck always gets the same cover, and
 * decks visually differ from their neighbors without any extra data from the store.
 */
export function deckSwatch(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return SWATCH_TOKENS[hash % SWATCH_TOKENS.length]
}
