import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_THEME } from '@/lib/theme-tokens'
import { EMPTY_TEXT_STYLE } from '@/engine/textStyle'
import type { DeckSummary } from '@/store/presentationStore'
import { VideoCard } from './VideoCard'

/** A render smoke test: what a video card offers. Playing and the signed links are checked by hand. */

const deck: DeckSummary = {
  id: 'd1',
  title: 'Volcanoes',
  updatedAt: '2026-11-01T00:00:00.000Z',
  theme: DEFAULT_THEME,
  textStyle: EMPTY_TEXT_STYLE,
  cover: null,
}

const record = {
  path: 'u/d1.mp4',
  contentType: 'video/mp4' as const,
  durationSeconds: 125,
  generatedAt: '2026-11-01T00:00:00.000Z',
}

const html = renderToStaticMarkup(<VideoCard deck={deck} record={record} onPlay={() => {}} onOpenDeck={() => {}} />)

describe('VideoCard', () => {
  it('plays from the cover, naming the deck and the running time', () => {
    expect(html).toContain('aria-label="Play the video of Volcanoes (2:05)"')
    expect(html).toContain('>2:05<')
  })

  it('says when the video was made, not when the deck was edited', () => {
    expect(html).toContain('Made ')
    expect(html).not.toContain('Updated ')
  })

  it('offers opening the deck as its own action', () => {
    expect(html).toContain('aria-label="Open the deck Volcanoes"')
  })
})
