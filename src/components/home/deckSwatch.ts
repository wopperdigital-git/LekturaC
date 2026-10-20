/** The four tracks of the conference programme (DESIGN.md), as `app-*` fills. */
export const TRACKS = ['orange', 'teal', 'sun', 'cobalt'] as const
export type Track = (typeof TRACKS)[number]

function hashId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return hash
}

/**
 * The track a deck's badge wears: deterministic per deck id, so the same deck
 * always keeps its stripe and neighbours differ without any extra stored data.
 */
export function deckTrack(id: string): Track {
  return TRACKS[hashId(id) % TRACKS.length]
}

/**
 * The lettered cover for a deck with no slides: its own track running into the
 * next one, so an empty deck still wears its badge colour.
 */
export function deckSwatch(id: string) {
  const index = hashId(id) % TRACKS.length
  return {
    from: `var(--app-track-${TRACKS[index]})`,
    to: `var(--app-track-${TRACKS[(index + 1) % TRACKS.length]})`,
  }
}
