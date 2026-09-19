import { describe, expect, it } from 'vitest'
import { createCanvasMeasurer, escapeFaceName } from './measureText'

/*
  Vitest runs this repo's suite in node, where `document` does not exist — so
  this is the fallback branch of `createCanvasMeasurer`, not the canvas one.
  The real canvas path has no unit test for the same reason `measureText.ts`
  itself says: it needs a DOM this suite doesn't have.
*/
describe('createCanvasMeasurer (node fallback)', () => {
  it('resolves to a measurer that returns a positive width', async () => {
    const measure = await createCanvasMeasurer()
    const width = measure('Hello, world', { face: 'Inter', sizePt: 18, bold: false, italic: false })
    expect(width).toBeGreaterThan(0)
  })
})

/*
  Pure and DOM-free, unlike the canvas path above, so it is directly testable
  in this node-run suite. A face name carrying `"` or `\` would otherwise
  break out of the quoted family in the `ctx.font` string this builds
  (`cssFont`), corrupting the whole font spec rather than just mis-measuring
  one face — see measureText.ts's "6. Safe canvas font string".
*/
describe('escapeFaceName', () => {
  it('leaves an ordinary face name unchanged', () => {
    expect(escapeFaceName('Inter')).toBe('Inter')
  })

  it('escapes a double quote so it cannot close the quoted family early', () => {
    expect(escapeFaceName('Weird"Font')).toBe('Weird\\"Font')
  })

  it('escapes a backslash so it is not read as an escape itself', () => {
    expect(escapeFaceName('Weird\\Font')).toBe('Weird\\\\Font')
  })

  it('escapes a backslash before a later quote in the order that keeps both readable', () => {
    // Escaping the backslash first, then the quote, is what keeps `\"` from
    // being read as an already-escaped quote instead of two escaped characters.
    expect(escapeFaceName('a\\"b')).toBe('a\\\\\\"b')
  })
})
