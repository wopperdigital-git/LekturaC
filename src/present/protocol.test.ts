import { describe, expect, it } from 'vitest'
import {
  channelName,
  consoleUrl,
  parseConsoleMessage,
  parsePresentParams,
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

describe('parseConsoleMessage', () => {
  it('round-trips every message type', () => {
    const msgs = [
      { type: 'ping' },
      { type: 'deck', deck },
      { type: 'state', index: 2, black: false, ended: true },
      { type: 'bye' },
      { type: 'end' },
    ]
    for (const m of msgs) expect(parseConsoleMessage(m)).toEqual(m)
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
