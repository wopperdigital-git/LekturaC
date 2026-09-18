/**
 * The deck length the creation brief asks for.
 *
 * `MAX_SLIDES` is a product decision, not a token one: a deck this tool writes
 * is meant to be presented, and ten slides is about as long as a single
 * generated talk stays coherent. It used to be 30, chosen purely as the point
 * where `maxOutputTokens` (clamped at 8192) truncates the JSON mid-deck — a
 * ceiling that answered "what will the model survive" rather than "what should
 * we offer". The new limit sits well inside that budget, which also retires
 * the narration gap: narration stops fitting somewhere around 20-25 slides, so
 * the old cap let a user create a deck that could never be narrated.
 *
 * `DEFAULT_SLIDE_COUNT` is what the field opens on and what "let AI decide"
 * aims at. Below it the user is trusted: deliberately typing 3 gets 3, because
 * a three-slide deck is a legitimate thing to want and nothing downstream
 * cares. Only the ceiling is enforced.
 *
 * Kept out of `CreatePage` so the bounds are checkable without rendering the
 * six-step flow — this is the one piece of that page with an off-by-one to get
 * wrong.
 */
export const MAX_SLIDES = 10
export const DEFAULT_SLIDE_COUNT = 5

/** A sentence to show under the field, or `null` when the value is usable. */
export function slideCountProblem(raw: string): string | null {
  const trimmed = raw.trim()
  // `parseInt` would read '5x' and '5.5' as 5, so the shape is checked first.
  if (!/^-?\d+$/.test(trimmed)) return 'Enter a number.'

  const count = Number(trimmed)
  if (count < 1) return 'At least 1 slide.'
  if (count > MAX_SLIDES) return `${MAX_SLIDES} slides max.`
  return null
}

/** The number, or `null` if the field isn't a usable count. */
export function parseSlideCount(raw: string): number | null {
  return slideCountProblem(raw) === null ? Number(raw.trim()) : null
}
