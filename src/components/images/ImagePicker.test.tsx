import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PHOTOS_NOT_SET_UP } from '@/lib/setupCopy'
import { ImagePicker } from './ImagePicker'

/**
 * A render smoke test: the picker as it opens. Tests run without a Pexels key, so this is
 * the unconfigured state, where search is replaced by the set-up message and pasting a link
 * still works. The debounce, abort and result states are live DOM and not exercised here.
 */

function render(open = true) {
  return renderToStaticMarkup(<ImagePicker open={open} onClose={() => {}} onPick={() => {}} />)
}

describe('ImagePicker', () => {
  it('draws nothing while closed', () => {
    expect(render(false)).toBe('')
  })

  it('without a key, says photo search is not set up and keeps the paste field', () => {
    const html = render()
    expect(html).toContain(PHOTOS_NOT_SET_UP.replace(/'/g, '&#x27;'))
    expect(html).toContain('Paste an image link')
    expect(html).not.toContain('type="search"')
  })

  it('never shows a variable name', () => {
    expect(render()).not.toContain('VITE_')
  })
})
