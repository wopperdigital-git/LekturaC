import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ElementActions } from './ElementActions'

/**
 * A small render smoke test, the same deliberate exception as `OverlayLayer.test.tsx`: which
 * buttons ride on a selected element. Pressing is not exercised (no jsdom).
 */

const FRAME = { x: 10, y: 10, w: 200, h: 100, rotation: 0 }
const noop = () => {}

describe('ElementActions', () => {
  it('offers Replace photo beside the bin only for a photo', () => {
    const photo = renderToStaticMarkup(
      <ElementActions frame={FRAME} removeLabel="Remove element" onRemove={noop} onReplace={noop} />,
    )
    expect(photo).toContain('aria-label="Replace photo"')
    expect(photo).toContain('aria-label="Remove element"')

    const text = renderToStaticMarkup(<ElementActions frame={FRAME} removeLabel="Remove element" onRemove={noop} />)
    expect(text).not.toContain('Replace photo')
  })

  it('offers Replace photo inside the frame for a background photo', () => {
    const html = renderToStaticMarkup(
      <ElementActions frame={FRAME} inside removeLabel="Remove photo" onRemove={noop} onReplace={noop} />,
    )
    expect(html).toContain('aria-label="Replace photo"')
    expect(html).toContain('aria-label="Remove photo"')
  })

  it('still offers the plus for a list, and no Replace', () => {
    const html = renderToStaticMarkup(
      <ElementActions frame={FRAME} removeLabel="Remove element" onRemove={noop} onAddItem={noop} />,
    )
    expect(html).toContain('aria-label="Add item"')
    expect(html).not.toContain('Replace photo')
  })

  it('offers the add-row plus for a term row, labelled as a row, not an item', () => {
    const html = renderToStaticMarkup(
      <ElementActions frame={FRAME} removeLabel="Remove element" onRemove={noop} onAddRow={noop} />,
    )
    expect(html).toContain('aria-label="Add row"')
    expect(html).not.toContain('aria-label="Add item"')
  })

  it('offers neither plus for a paragraph', () => {
    const html = renderToStaticMarkup(<ElementActions frame={FRAME} removeLabel="Remove element" onRemove={noop} />)
    expect(html).not.toContain('Add row')
    expect(html).not.toContain('Add item')
  })
})
