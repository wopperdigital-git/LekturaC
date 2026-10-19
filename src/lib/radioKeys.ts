/*
  The keyboard rules of a radio group built from buttons (WAI-ARIA Authoring Practices,
  Radio Group): one Tab stop for the whole group (`radioTabStop`), and the arrow keys
  move between the options, selecting as they go and wrapping at the ends
  (`nextRadioIndex`). Native radios do this by themselves; `role="radio"` buttons don't.
*/

const FORWARD = new Set(['ArrowRight', 'ArrowDown'])
const BACK = new Set(['ArrowLeft', 'ArrowUp'])

/** The option an arrow key moves to from `current` (-1: none selected), or null for any other key. */
export function nextRadioIndex(current: number, count: number, key: string): number | null {
  if (count <= 0) return null
  if (FORWARD.has(key)) return current < 0 ? 0 : (current + 1) % count
  if (BACK.has(key)) return current < 0 ? count - 1 : (current - 1 + count) % count
  return null
}

/** The one option Tab lands on: the selected one, else the first. */
export function radioTabStop(selected: number, count: number): number {
  return selected >= 0 && selected < count ? selected : 0
}
