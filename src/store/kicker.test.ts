import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card } from '@/engine/contentBlocks'

/*
  A kicker is a field of its heading. These pin the store's side of it: adding one is a single
  undo step, and a kicker edited to nothing is removed, never stored as an empty string
  (the field's marks go with it, so a later kicker does not inherit offsets into text that is gone).
  Supabase is mocked to unconfigured, as in `history.test.ts`.
*/
vi.mock('@/lib/supabaseClient', () => ({
  supabaseConfigured: false,
  supabase: null,
  ensureSession: () => Promise.resolve(),
}))

const { usePresentationStore } = await import('./presentationStore')
const { DEFAULT_THEME } = await import('@/lib/theme-tokens')

const make = (): Card => ({
  id: 'a',
  orderIndex: 0,
  layout: 'auto',
  visualStyle: 'structured',
  blocks: [
    { type: 'heading', text: 'Loops' },
    { type: 'paragraph', text: 'Body' },
  ],
  adjusts: { '1': { dx: 0.1, dy: 0, rotation: 0 } },
})

function seed(card: Card = make()) {
  usePresentationStore.setState({
    presentationId: 'deck-1',
    title: 't',
    theme: DEFAULT_THEME,
    textStyle: {},
    cards: [card],
    past: [],
    future: [],
    status: 'idle',
    errorMessage: null,
  })
}

/*
  Typing coalesces into one history entry within a short window, and that clock is module state:
  each test starts well after the last, so one test's typing never merges into the next's.
*/
let clock = Date.now()
function newTestClock() {
  clock += 60_000
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(clock)
}

const state = () => usePresentationStore.getState()
const blocks = () => state().cards[0].blocks

describe('setHeadingKicker', () => {
  beforeEach(() => {
    newTestClock()
    seed()
  })

  it('adds a kicker to a heading as one undo step, leaving every other block and nudge alone', () => {
    state().setHeadingKicker('a', 0, 'Small heading')
    expect(blocks()[0]).toEqual({ type: 'heading', text: 'Loops', kicker: 'Small heading' })
    expect(blocks()[1]).toEqual({ type: 'paragraph', text: 'Body' })
    expect(state().cards[0].adjusts).toEqual(make().adjusts)
    expect(state().past).toHaveLength(1)

    state().undo()
    expect('kicker' in blocks()[0]).toBe(false)
    state().redo()
    expect(blocks()[0]).toMatchObject({ kicker: 'Small heading' })
  })

  it('removes the field for null, empty and whitespace-only text', () => {
    for (const text of [null, '', '   ']) {
      seed({ ...make(), blocks: [{ type: 'heading', text: 'Loops', kicker: 'Part one' }, make().blocks[1]] })
      state().setHeadingKicker('a', 0, text)
      expect('kicker' in blocks()[0], JSON.stringify(text)).toBe(false)
    }
  })

  it('does nothing for a block that is not a heading', () => {
    state().setHeadingKicker('a', 1, 'Nope')
    expect(blocks()).toEqual(make().blocks)
    expect(state().past).toHaveLength(0)
  })
})

describe('editing a kicker', () => {
  beforeEach(() => {
    newTestClock()
    seed({
      ...make(),
      blocks: [{ type: 'heading', text: 'Loops', kicker: 'Small heading' }, make().blocks[1]],
      inline: { '0:kicker': { marks: [{ type: 'bold', start: 0, end: 5 }] } },
    })
  })

  it('stores typed text under the heading', () => {
    state().setBlockText('a', '0:kicker', 'Part two')
    expect(blocks()[0]).toMatchObject({ kicker: 'Part two' })
  })

  // While the run is open the store holds what was typed, even nothing: the page removes it
  // when editing ends, so the run keeps its caret box and a first space deletes nothing.
  it.each([[''], ['  '], ['\n']])('keeps %j while the run is still being edited', (text) => {
    state().setBlockText('a', '0:kicker', text)
    expect(blocks()[0]).toEqual({ type: 'heading', text: 'Loops', kicker: text })
  })

  it.each([[''], ['  ']])('removes an emptied kicker (%j) at the end of the edit, with its marks', (text) => {
    state().setBlockText('a', '0:kicker', text)
    state().setHeadingKicker('a', 0, null, { amend: true })
    expect(blocks()[0]).toEqual({ type: 'heading', text: 'Loops' })
    expect('kicker' in blocks()[0]).toBe(false)
    expect(state().cards[0].inline?.['0:kicker']).toBeUndefined()
  })

  it('undoes typing, emptying and the removal in one step, back to the kicker it had', () => {
    state().setBlockText('a', '0:kicker', 'Hi')
    state().setBlockText('a', '0:kicker', '')
    state().setHeadingKicker('a', 0, null, { amend: true })
    expect('kicker' in blocks()[0]).toBe(false)
    expect(state().past).toHaveLength(1)
    state().undo()
    expect(blocks()[0]).toMatchObject({ kicker: 'Small heading' })
    expect(state().cards[0].inline?.['0:kicker']).toBeDefined()
  })

  it('keeps it one step however long the pause before the edit ends', () => {
    state().setBlockText('a', '0:kicker', 'Hi')
    vi.setSystemTime(Date.now() + 30_000)
    state().setHeadingKicker('a', 0, null, { amend: true })
    expect(state().past).toHaveLength(1)
  })

  it("leaves the heading's own text alone when its kicker is cleared", () => {
    state().setBlockText('a', '0:text', 'Loops and branches')
    state().setBlockText('a', '0:kicker', '')
    state().setHeadingKicker('a', 0, null, { amend: true })
    expect(blocks()[0]).toEqual({ type: 'heading', text: 'Loops and branches' })
  })
})
