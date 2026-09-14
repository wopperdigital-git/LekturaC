/**
 * "slides 2–5, 8" — which slides a quiz's questions came from.
 *
 * Several questions often cite one slide, so duplicates count once, and the
 * singular form depends on distinct slides rather than on questions.
 */
export function formatSlideRange(numbers: readonly number[]): string {
  const slides = [...new Set(numbers)]
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b)
  if (slides.length === 0) return ''

  const runs: string[] = []
  let start = slides[0]
  let previous = slides[0]
  const close = () => runs.push(start === previous ? `${start}` : `${start}–${previous}`)

  for (const n of slides.slice(1)) {
    if (n === previous + 1) {
      previous = n
      continue
    }
    close()
    start = n
    previous = n
  }
  close()

  return `${slides.length === 1 ? 'slide' : 'slides'} ${runs.join(', ')}`
}
