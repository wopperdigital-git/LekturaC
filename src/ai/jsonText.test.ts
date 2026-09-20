import { describe, expect, it } from 'vitest'
import { extractJsonObject } from './jsonText'

describe('extractJsonObject', () => {
  it('returns clean JSON unchanged', () => {
    const clean = '{"a":1,"b":[1,2,3]}'
    expect(extractJsonObject(clean)).toBe(clean)
  })

  it('strips a ```json fence around the object', () => {
    const raw = '```json\n{"a":1}\n```'
    expect(extractJsonObject(raw)).toBe('{"a":1}')
  })

  it('strips a prose prefix and suffix', () => {
    const raw = 'Here is the deck:\n{"a":1}\nHope that helps!'
    expect(extractJsonObject(raw)).toBe('{"a":1}')
  })

  it('strips the compound-style "**Presentation Deck (JSON)**" preamble and fence', () => {
    const raw = '**Presentation Deck (JSON)**\n```json\n{"title":"Test"}\n```'
    expect(extractJsonObject(raw)).toBe('{"title":"Test"}')
  })

  it('survives nested braces', () => {
    const raw = 'prefix {"a":{"b":{"c":1}},"d":[{"e":2}]} suffix'
    expect(extractJsonObject(raw)).toBe('{"a":{"b":{"c":1}},"d":[{"e":2}]}')
  })

  it('returns null when there is no brace pair at all', () => {
    expect(extractJsonObject('sorry, I could not find anything useful.')).toBeNull()
  })

  it('returns null for a lone opening brace with no closing one', () => {
    expect(extractJsonObject('{"a": 1')).toBeNull()
  })

  it('returns null for a lone closing brace with no opening one', () => {
    expect(extractJsonObject('a": 1}')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(extractJsonObject('')).toBeNull()
  })
})
