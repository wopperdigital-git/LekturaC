import { describe, expect, it } from 'vitest'

/*
  Every surface lays a slide out at one width, `SLIDE_WIDTH_PX`, and scales the picture
  (`lib/slideSize.ts`). A screen-width breakpoint (`sm:`, `md:` …) inside a layout breaks
  that: the slide is still 976px wide, but on a phone the screen is not, so the same
  slide wraps into another arrangement in the presenter and the phone deck view than in
  the editor. A layout that must change with width asks the slide's own width instead,
  through a container query (`@min-[640px]:`) against `SlideBody`'s `@container`.

  Read through Vite's glob, as `theme-tokens.test.ts` does, for the same reason.
*/

const SCREEN_BREAKPOINT = /(?<![\w@[-])(?:sm|md|lg|xl|2xl):[a-z]/

/** A class token with an arbitrary value (`...-[...]` or `[...]:...]`) glued to a `${`. */
const GLUED_CLASS = /className=.*[a-z0-9-]\[[^\s`'"]*\]\$\{/

function layoutSources(): { file: string; source: string }[] {
  const sources = import.meta.glob('./**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >
  return Object.entries(sources)
    .filter(([file]) => !file.endsWith('.test.tsx'))
    .map(([file, source]) => ({ file, source }))
}

describe('slide layouts', () => {
  it('never change with the screen width, only with the slide width', () => {
    const offenders = layoutSources().flatMap(({ file, source }) =>
      source
        .split('\n')
        .filter((line) => SCREEN_BREAKPOINT.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    )
    expect(offenders).toEqual([])
  })

  // The rule must catch the real thing and leave the container form alone.
  it('tells a screen breakpoint from a container query', () => {
    expect(SCREEN_BREAKPOINT.test('className="grid sm:grid-cols-3"')).toBe(true)
    expect(SCREEN_BREAKPOINT.test('className="md:items-center"')).toBe(true)
    expect(SCREEN_BREAKPOINT.test('className="grid @min-[640px]:grid-cols-3"')).toBe(false)
    expect(SCREEN_BREAKPOINT.test('className="@container"')).toBe(false)
  })

  // Tailwind reads class names out of the source as text. A token that ends in `]` and runs
  // straight into a `${` is read together with the expression, so its rule is never generated
  // (the two halves of a before and after stacked at every width). Keep a space before `${`.
  it('never runs an arbitrary-value class straight into a template expression', () => {
    const offenders = layoutSources().flatMap(({ file, source }) =>
      source
        .split('\n')
        .filter((line) => GLUED_CLASS.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    )
    expect(offenders).toEqual([])
  })

  it('tells a glued class from a spaced one', () => {
    expect(GLUED_CLASS.test("className={`grid @min-[640px]:[grid-template-columns:var(--c)]${fill ? ' flex-1' : ''}`}")).toBe(true)
    expect(GLUED_CLASS.test("className={`grid @min-[640px]:grid-cols-[1fr_auto_1fr]${fill ? ' flex-1' : ''}`}")).toBe(true)
    expect(GLUED_CLASS.test("className={`grid @min-[640px]:[grid-template-columns:var(--c)] ${fill ? 'flex-1' : ''}`}")).toBe(false)
    expect(GLUED_CLASS.test("className={`grid${fill ? ' flex-1' : ''}`}")).toBe(false)
    expect(GLUED_CLASS.test('const cell = rows[0]${x}')).toBe(false)
  })
})
