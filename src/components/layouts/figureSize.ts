/**
 * The font size of a stat's figure, as a multiple of one of the theme's steps
 * (`--slide-size-h1`/`h2`) so a size picked for the element in the toolbar,
 * which rescales those variables, still moves it.
 *
 * A long figure ("1,200,000") steps down so it stays inside its box: full size
 * up to `fullChars` characters, then in proportion to its length (never under
 * 45%). Pure; the characters-per-box budgets are the callers' own.
 */
export function figureSize(step: 'h1' | 'h2', factor: number, value: string, fullChars: number): string {
  const shrink = value.length <= fullChars ? 1 : Math.max(0.45, fullChars / value.length)
  return `calc(var(--slide-size-${step}) * ${(factor * shrink).toFixed(3)})`
}
