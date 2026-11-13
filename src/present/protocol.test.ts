import { describe, expect, it } from 'vitest'
import {
  CONNECT_GRACE_MS,
  SILENCE_MS,
  channelName,
  consoleUrl,
  parseConsoleMessage,
  parsePresentParams,
  nextScreenLink,
  parseScreenMessage,
  screenUrl,
  type DeckSnapshot,
} from './protocol'

const deck = {
  title: 'T',
  theme: { id: 'minimal' },
  textStyle: {},
  cards: [{ id: 'a', orderIndex: 0, blocks: [] }],
} as unknown as DeckSnapshot

const stroke = {
  id: 's1',
  kind: 'stroke',
  tool: 'pen',
  color: '#ef4444',
  width: 0.007,
  points: [[0.1, 0.2], [0.3, 0.4]],
}

describe('parseConsoleMessage', () => {
  it('round-trips every message type', () => {
    const msgs = [
      { type: 'ping' },
      { type: 'deck', deck },
      { type: 'state', index: 2, black: false, ended: true },
      { type: 'bye' },
      { type: 'end' },
      { type: 'ink', ink: { a: [stroke] } },
      { type: 'inkLive', cardId: 'a', stroke },
      { type: 'inkLive', cardId: 'a', stroke: null },
      { type: 'laser', cardId: 'a', point: [0.2, 0.3] },
      { type: 'laser', cardId: 'a', point: null },
    ]
    for (const m of msgs) expect(parseConsoleMessage(m)).toEqual(m)
  })

  it('checks ink like stored ink', () => {
    expect(parseConsoleMessage({ type: 'ink', ink: { a: [stroke, { id: 'x' }] } })).toEqual({
      type: 'ink',
      ink: { a: [stroke] },
    })
    expect(parseConsoleMessage({ type: 'ink', ink: 'x' })).toEqual({ type: 'ink', ink: {} })
    expect(parseConsoleMessage({ type: 'inkLive', cardId: 'a', stroke: { id: 'x' } })).toBeNull()
    expect(parseConsoleMessage({ type: 'laser', cardId: 'a', point: [Infinity, 0] })).toBeNull()
    expect(parseConsoleMessage({ type: 'laser', cardId: 'a', point: [1] })).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(parseConsoleMessage(null)).toBeNull()
    expect(parseConsoleMessage({ type: 'nope' })).toBeNull()
    expect(parseConsoleMessage({ type: 'state', index: '1' })).toBeNull()
    expect(parseConsoleMessage({ type: 'deck', deck: { ...deck, cards: 'x' } })).toBeNull()
    expect(parseConsoleMessage({ type: 'deck', deck: { ...deck, cards: [{ id: 1 }] } })).toBeNull()
  })
})

describe('parseScreenMessage', () => {
  it('round-trips every message type', () => {
    const msgs = [
      { type: 'hello' },
      { type: 'alive' },
      { type: 'bye' },
      { type: 'key', key: { type: 'next' } },
      { type: 'key', key: { type: 'goto', index: 3 } },
      { type: 'key', key: { type: 'toggleBlack' } },
      { type: 'key', key: { type: 'digit', digit: '7' } },
      { type: 'key', key: { type: 'enter' } },
    ]
    for (const m of msgs) expect(parseScreenMessage(m)).toEqual(m)
  })

  it('rejects malformed input', () => {
    expect(parseScreenMessage(null)).toBeNull()
    expect(parseScreenMessage({ type: 'nope' })).toBeNull()
    expect(parseScreenMessage({ type: 'key', key: { type: 'digit', digit: '12' } })).toBeNull()
    expect(parseScreenMessage({ type: 'key', key: { type: 'goto' } })).toBeNull()
    expect(parseScreenMessage({ type: 'ping' })).toBeNull()
  })
})

describe('urls and params', () => {
  it('builds the channel name and urls', () => {
    expect(channelName('s1')).toBe('lekturac:present:s1')
    expect(screenUrl('d1', 's1')).toBe('/deck/d1/present?view=screen&session=s1')
    expect(consoleUrl('d1', 's1', 4)).toBe('/deck/d1/present?view=presenter&session=s1&start=4')
    expect(screenUrl('d 1', 's&1')).toBe('/deck/d%201/present?view=screen&session=s%261')
  })

  it('parses present params', () => {
    expect(parsePresentParams('')).toEqual({ view: 'single' })
    expect(parsePresentParams('?view=presenter&session=s&start=4')).toEqual({
      view: 'presenter',
      session: 's',
      start: 4,
    })
    expect(parsePresentParams('?view=presenter&start=x')).toEqual({
      view: 'presenter',
      session: null,
      start: 0,
    })
    expect(parsePresentParams('view=screen&session=s')).toEqual({ view: 'screen', session: 's' })
    expect(parsePresentParams('?view=screen')).toEqual({ view: 'screen', session: null })
    expect(parsePresentParams('?view=other')).toEqual({ view: 'single' })
  })
})

describe('nextScreenLink', () => {
  it('keeps a connecting window through the load grace, not the 3 s silence', () => {
    expect(nextScreenLink('connecting', 5000, null, 0)).toBe('connecting')
    expect(nextScreenLink('connecting', CONNECT_GRACE_MS, null, 0)).toBe('connecting')
    expect(nextScreenLink('connecting', CONNECT_GRACE_MS + 1, null, 0)).toBe('closed')
  })

  it('counts the grace from the last open click', () => {
    expect(nextScreenLink('connecting', 20000, null, 15000)).toBe('connecting')
    expect(nextScreenLink('connecting', 25001, null, 15000)).toBe('closed')
  })

  it('closes an open window after the silence, not before', () => {
    expect(nextScreenLink('open', 1000 + SILENCE_MS, 1000, 0)).toBe('open')
    expect(nextScreenLink('open', 1000 + SILENCE_MS + 1, 1000, 0)).toBe('closed')
  })

  it('never closes an open window that has not been heard (it cannot be open then)', () => {
    expect(nextScreenLink('open', 99999, null, 0)).toBe('open')
  })

  it('leaves closed and blocked as they are', () => {
    expect(nextScreenLink('closed', 99999, 0, 0)).toBe('closed')
    expect(nextScreenLink('blocked', 99999, 0, 0)).toBe('blocked')
  })
})
