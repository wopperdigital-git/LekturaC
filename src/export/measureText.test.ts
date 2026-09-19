import { describe, expect, it } from 'vitest'
import { createCanvasMeasurer } from './measureText'

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
