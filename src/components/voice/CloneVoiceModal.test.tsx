import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_SETTINGS } from '@/voice/settingsRow'
import { READING_SCRIPTS } from '@/voice/scripts'
import { useVoiceStore } from '@/voice/voiceStore'
import { CloneVoiceModal } from './CloneVoiceModal'

/**
 * A render smoke test, like the other editor panels: what the modal draws for which
 * state. Recording, playback and the live Cartesia calls need a microphone and a key,
 * and are checked by hand.
 *
 * Server rendering reads a zustand hook's *initial* state, not the current one, so only
 * what the modal takes with `getState()` (the draft, and whether the voice has loaded)
 * can be set up here. What arrives by subscription (the migration warning, a save
 * error) cannot; the warning's text and when it appears are pinned in `voiceStore.test.ts`.
 */

beforeEach(() => {
  vi.stubEnv('VITE_CARTESIA_API_KEY', 'sk_car_test')
  useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS }, loaded: true, warning: null, error: null, status: 'idle' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const render = () => renderToStaticMarkup(<CloneVoiceModal onClose={() => {}} />)

/** The opening tag of the element with this `aria-label`; fails loudly if there is none, so a
    `.not.toContain` on it can never pass because the element was missing. */
function tagLabelled(html: string, label: string): string {
  const tag = html.match(new RegExp(`<[^>]*aria-label="${label}"[^>]*>`))?.[0]
  if (!tag) throw new Error(`no element labelled "${label}" in the markup`)
  return tag
}

describe('CloneVoiceModal', () => {
  it('draws the four parts of the voice setup', () => {
    const html = render()
    for (const heading of ['>Voice<', '>Record your voice<', '>Settings<', '>Preview<']) {
      expect(html).toContain(heading)
    }
    expect(html).toContain('role="dialog"')
  })

  it('shows the passage to read in the chosen language', () => {
    expect(render()).toContain(READING_SCRIPTS.en)
    useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS, language: 'fr' } })
    expect(render()).toContain('Le renard brun rapide')
  })

  // Cloning must not be offered without a clip of at least three seconds and a name.
  it('cannot clone until there is a clip and a name', () => {
    expect(tagLabelled(render(), 'Clone voice')).toContain('disabled=""')
  })

  it('cannot preview until a voice is chosen', () => {
    expect(tagLabelled(render(), 'Preview voice')).toContain('disabled=""')
  })

  it('can preview once a voice is chosen', () => {
    useVoiceStore.setState({
      settings: { ...DEFAULT_SETTINGS, voiceId: 'v1', voiceName: 'Skylar', voiceSource: 'premade' },
    })
    expect(tagLabelled(render(), 'Preview voice')).not.toContain('disabled=""')
    expect(render()).toContain('Skylar')
  })

  // Cartesia supports emotion for English only.
  it('offers emotion for English and disables it for another language', () => {
    expect(tagLabelled(render(), 'Emotion')).not.toContain('disabled=""')
    useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS, language: 'de' } })
    const html = render()
    expect(tagLabelled(html, 'Emotion')).toContain('disabled=""')
    expect(html).toContain('English only')
  })

  it("offers speed and volume within Cartesia's limits", () => {
    const html = render()
    expect(tagLabelled(html, 'Speed')).toContain('min="0.6"')
    expect(tagLabelled(html, 'Speed')).toContain('max="1.5"')
    expect(tagLabelled(html, 'Volume')).toContain('min="0.5"')
    expect(tagLabelled(html, 'Volume')).toContain('max="2"')
  })

  it('explains itself when no Cartesia key is configured', () => {
    vi.stubEnv('VITE_CARTESIA_API_KEY', '')
    expect(render()).toContain('VITE_CARTESIA_API_KEY')
  })
})
