import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_THEME } from '@/lib/theme-tokens'
import { EMPTY_TEXT_STYLE } from '@/engine/textStyle'
import type { Card } from '@/engine/contentBlocks'
import type { VideoDeck } from '@/video/generate'
import { DEFAULT_SETTINGS } from '@/voice/settingsRow'
import { READING_SCRIPTS } from '@/voice/scripts'
import { FACE_NOT_SET_UP } from '@/lib/setupCopy'
import { useVoiceStore } from '@/voice/voiceStore'
import { useBookendsStore } from '@/avatar/bookendsStore'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { CloneVoiceModal, VideoTile, VoiceGroup } from './CloneVoiceModal'

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
  vi.stubEnv('VITE_WAVESPEED_API_KEY', 'ws_test')
  useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS }, loaded: true, warning: null, error: null, status: 'idle' })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  Object.assign(useVoiceStore.getInitialState(), { loaded: false })
  Object.assign(useBookendsStore.getInitialState(), { deckId: null, loaded: false })
})

// The modal only counts the slides here; drawing them is the browser-only code in src/video.
const DECK: VideoDeck = {
  presentationId: 'p1',
  title: 'Deck',
  cards: [{ id: 'c1' }] as unknown as Card[],
  theme: DEFAULT_THEME,
  textStyle: EMPTY_TEXT_STYLE,
}

const render = (deck: VideoDeck = DECK, initialStep?: 'voice' | 'sound' | 'face' | 'video') =>
  renderToStaticMarkup(<CloneVoiceModal deck={deck} onClose={() => {}} initialStep={initialStep} />)

// Generate video is only on the last step; every other step's footer offers Next.
const renderLast = (deck: VideoDeck = DECK) => render(deck, 'video')

const stubEncoders = () => {
  vi.stubGlobal('VideoEncoder', class {})
  vi.stubGlobal('AudioEncoder', class {})
}

// A chosen voice that is also the saved one. The modal reads `loaded` through a hook, which server rendering
// takes from the store's *initial* state (false, and out of reach of setState), so that object is edited here
// and put back in afterEach; without it Generate stays off for "the saved voice could not be read".
const withVoice = () => {
  useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS, voiceId: 'v1', voiceName: 'Skylar', voiceSource: 'premade' } })
  Object.assign(useVoiceStore.getInitialState(), { loaded: true })
  // Likewise the intro and outro: Generate waits until they have been read for this deck.
  Object.assign(useBookendsStore.getInitialState(), { deckId: 'p1', loaded: true })
}

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
    for (const heading of ['>Voice<', '>Record your voice<', '>Sound<', '>Preview<']) {
      expect(html).toContain(heading)
    }
    expect(html).toContain('role="dialog"')
  })

  // Consent is a one-time dialog opened by the first press on Record (CloneConsentModal.test.tsx),
  // not a checkbox on the tab, so nothing about it is drawn until then.
  it('has no consent checkbox on the record tab, and does not ask before Record is pressed', () => {
    const html = render()
    expect(html).not.toContain('This is my own voice, and I agree to it being copied.')
    expect(html).not.toContain('>Before you record<')
  })

  it('shows the English passage to read, timed at about twenty seconds', () => {
    const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')
    const html = render()
    expect(html).toContain(escape(READING_SCRIPTS.en))
    expect(html).toContain('about 20 seconds')
  })

  // English only: no language picker, and a voice saved in another language is read as English.
  it('has no language picker, and treats a setting saved in another language as English', () => {
    expect(render()).not.toContain('aria-label="Voice language"')
    useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS, language: 'fr' } })
    const html = render()
    expect(html).not.toContain('Bonjour à tous')
    expect(html).toContain('Hello, this is how your narration will sound.')
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
    // The rail and the row's tick say which voice is chosen; there is no "Selected:" line under the list.
    expect(render()).not.toContain('Selected:')
  })

  // Cartesia supports emotion for English only, which is now the only language.
  it('always offers emotion', () => {
    expect(tagLabelled(render(), 'Emotion')).not.toContain('disabled=""')
    useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS, language: 'de' } })
    expect(tagLabelled(render(), 'Emotion')).not.toContain('disabled=""')
  })

  it("offers speed and volume within Cartesia's limits", () => {
    const html = render()
    expect(tagLabelled(html, 'Speed')).toContain('min="0.6"')
    expect(tagLabelled(html, 'Speed')).toContain('max="1.5"')
    expect(tagLabelled(html, 'Volume')).toContain('min="0.5"')
    expect(tagLabelled(html, 'Volume')).toContain('max="2"')
  })

  it('explains itself when no Cartesia key is configured, without naming a key variable', () => {
    vi.stubEnv('VITE_CARTESIA_API_KEY', '')
    const html = render()
    expect(html).toContain('Cartesia key')
    expect(html).not.toContain('VITE_')
  })

  // Named for what it makes: "Generate Presentation" is also what makes a deck at /new.
  it('is titled Narrated video and offers Generate video, not Generate Presentation or Save voice', () => {
    const html = renderLast()
    expect(html).toContain('>Narrated video<')
    expect(html).toContain('Generate video')
    expect(html).not.toContain('Generate Presentation')
    expect(html).not.toContain('Save voice')
  })

  // The saved voice is marked as known here, so `canSaveVoice` is satisfied and the missing voice is the
  // only thing left to stop the button. The footer's blocker is a <p>; the Preview row's copy is a <span>.
  it('cannot generate until a voice is chosen, and the footer says why', () => {
    stubEncoders()
    Object.assign(useVoiceStore.getInitialState(), { loaded: true })
    const html = renderLast()
    expect(tagLabelled(html, 'Generate video')).toContain('disabled=""')
    expect(html).toMatch(/<p role="status"[^>]*>Choose a voice first\.<\/p>/)
  })

  // Most people pick a voice; recording sits behind the second tab, still mounted so a
  // recording in progress survives a switch, and the notice is still read before Record.
  it('opens on Pick a voice, with Record your voice as a second tab', () => {
    const html = render()
    expect(html).toMatch(/<button[^>]*id="voice-tab-pick"[^>]*aria-selected="true"/)
    expect(html).toMatch(/<button[^>]*id="voice-tab-record"[^>]*aria-selected="false"/)
    expect(html).toMatch(/<div id="voice-panel-pick"[^>]*role="tabpanel"(?![^>]*hidden)[^>]*>/)
    expect(html).toMatch(/<div id="voice-panel-record"[^>]*hidden=""/)
  })

  it('numbers its steps in order: voice, settings, video, with Generate after them', () => {
    const html = renderLast()
    const at = (needle: string) => html.indexOf(needle)
    expect(at('id="voice-voice"')).toBeLessThan(at('id="voice-settings"'))
    expect(at('id="voice-settings"')).toBeLessThan(at('id="voice-video"'))
    expect(at('id="voice-video"')).toBeLessThan(at('aria-label="Generate video"'))
  })

  it('can generate once a voice is chosen, the browser can encode and the deck has slides', () => {
    stubEncoders()
    withVoice()
    expect(tagLabelled(renderLast(), 'Generate video')).not.toContain('disabled=""')
  })

  // The rule itself is `bookendsReady` (unit-tested in video/ui.test.ts); these two check the modal uses it,
  // each in the environment where it can be seen: with a database the gate waits, without one it does not.
  it.skipIf(!supabaseConfigured)("waits for this deck's intro and outro to be read before Generate is on", () => {
    stubEncoders()
    withVoice()
    Object.assign(useBookendsStore.getInitialState(), { deckId: 'other', loaded: true })
    expect(tagLabelled(renderLast(), 'Generate video')).toContain('disabled=""')
  })

  it.skipIf(supabaseConfigured)('does not wait for the intro and outro when there is no database', () => {
    stubEncoders()
    withVoice()
    Object.assign(useBookendsStore.getInitialState(), { deckId: 'other', loaded: false })
    expect(tagLabelled(renderLast(), 'Generate video')).not.toContain('disabled=""')
  })

  it('cannot generate in a browser without WebCodecs, and says so', () => {
    withVoice()
    const html = renderLast()
    expect(tagLabelled(html, 'Generate video')).toContain('disabled=""')
    expect(html).toContain('cannot encode video')
  })

  it('cannot generate for a deck with no slides', () => {
    stubEncoders()
    withVoice()
    const html = renderLast({ ...DECK, cards: [] })
    expect(tagLabelled(html, 'Generate video')).toContain('disabled=""')
    expect(html).toContain('no slides')
  })

  it('says there is no video yet before one is generated', () => {
    expect(render()).toContain('No video yet')
  })

  /* ---- 3. Talking intro & outro ---- */
  // renderToStaticMarkup escapes quotes and ampersands, so the copy is compared in its escaped form.
  const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')
  const faceSwitch = (html: string) => {
    const tag = html.match(/<input[^>]*id="voice-face-switch"[^>]*>/)?.[0]
    if (!tag) throw new Error('no talking intro switch in the markup')
    return tag
  }

  it('explains that talking intros are not set up, and turns the switch off, when there is no WaveSpeed key', () => {
    vi.stubEnv('VITE_WAVESPEED_API_KEY', '')
    const html = render()
    expect(html).toContain(escaped(FACE_NOT_SET_UP))
    expect(faceSwitch(html)).toContain('disabled=""')
    expect(html).not.toContain('VITE_')
  })

  it('asks for a photo and for consent when the key is set and there is no photo yet', () => {
    const html = render()
    expect(html).toContain('Add a photo of your face first.')
    expect(faceSwitch(html)).toContain('disabled=""')
    expect(html).toContain('This is my face, or I have permission to use it.')
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"/)
    expect(html).toContain('Upload photo')
    expect(html).not.toContain('VITE_')
  })

  it('puts the talking intro step between the settings and the video', () => {
    const html = render()
    const at = (needle: string) => html.indexOf(needle)
    expect(at('id="voice-settings"')).toBeLessThan(at('id="voice-face"'))
    expect(at('id="voice-face"')).toBeLessThan(at('id="voice-video"'))
    expect(html).toMatch(/id="voice-face"[^>]*>Step 3: Talking intro &amp; outro</)
    expect(html).toMatch(/id="voice-video"[^>]*>Step 4: Video</)
  })

  /* ---- the step rail ---- */
  const section = (html: string, id: string) => html.match(new RegExp(`<section id="voice-step-${id}"[^>]*>`))?.[0] ?? ''

  it('shows one step at a time, opening on the voice, with every step still in the markup', () => {
    const html = render()
    expect(section(html, 'voice')).not.toContain('hidden')
    for (const id of ['sound', 'face', 'video']) expect(section(html, id)).toContain('hidden=""')
  })

  it('opens on the step it is asked for', () => {
    const html = render(DECK, 'video')
    expect(section(html, 'video')).not.toContain('hidden')
    expect(section(html, 'voice')).toContain('hidden=""')
  })

  it('lists the four steps in a rail, marking the current one, each with what is chosen there', () => {
    useVoiceStore.setState({ settings: { ...DEFAULT_SETTINGS, voiceId: 'v1', voiceName: 'Skylar', voiceSource: 'premade' } })
    const html = render()
    const rail = html.match(/<nav aria-label="Video steps"[\s\S]*?<\/nav>/)?.[0] ?? ''
    const at = (needle: string) => rail.indexOf(needle)
    expect(at('>Voice<')).toBeGreaterThan(-1)
    expect(at('>Voice<')).toBeLessThan(at('>Sound<'))
    expect(at('>Sound<')).toBeLessThan(at('>Intro &amp; outro<'))
    expect(at('>Intro &amp; outro<')).toBeLessThan(at('>Video<'))
    expect(rail.match(/aria-current="step"/g)).toHaveLength(1)
    expect(rail).toMatch(/aria-current="step"[^>]*aria-controls="voice-step-voice"/)
    expect(rail).toContain('>Skylar<')
    expect(rail).toContain('1.00× · Default')
    expect(rail).toContain('None yet')
  })

  // One footer for every step: Back from the second step on, Next until the last, and Generate video
  // only on the last, so the button that spends credits is pressed once the whole setup has been seen.
  it('offers Next until the last step, Generate video only on the last, and Back after the first', () => {
    const footer = (step: 'voice' | 'sound' | 'face' | 'video') => {
      const html = render(DECK, step)
      return { next: />Next</.test(html), back: />Back</.test(html), generate: html.includes('aria-label="Generate video"') }
    }
    expect(footer('voice')).toEqual({ next: true, back: false, generate: false })
    expect(footer('sound')).toEqual({ next: true, back: true, generate: false })
    expect(footer('face')).toEqual({ next: true, back: true, generate: false })
    expect(footer('video')).toEqual({ next: false, back: true, generate: true })
  })

  // The ✕ in the title row is the only way out offered; there is no second Close button.
  it('has no Close button beside the footer actions, only the ✕', () => {
    for (const step of ['voice', 'video'] as const) {
      const html = render(DECK, step)
      expect(html).not.toContain('>Close<')
      expect(html.match(/aria-label="Close"/g)).toHaveLength(1)
    }
  })

  // While the voice is being chosen, "Choose a voice first" is noise; it is said where Generate is.
  // A blocker the user cannot fix by finishing the steps (the browser) is said on every step.
  it('says a missing voice only on the last step, but a browser that cannot encode on every step', () => {
    stubEncoders()
    Object.assign(useVoiceStore.getInitialState(), { loaded: true })
    const status = /<p role="status"[^>]*>Choose a voice first\.<\/p>/
    expect(render()).not.toMatch(status)
    expect(renderLast()).toMatch(status)
    vi.unstubAllGlobals()
    expect(render()).toContain('cannot encode video')
  })

  it('names the slides that have no script, since they play in silence', () => {
    const cards = [
      { id: 'c1', narration: { text: 'Hello there', generated: 'Hello there' } },
      { id: 'c2' },
      { id: 'c3', narration: { text: '  ', generated: '' } },
    ] as unknown as Card[]
    const html = render({ ...DECK, cards }, 'video')
    expect(html).toContain('Slides 2 and 3')
    expect(html).toContain('in silence')
    expect(html).toMatch(/3 slides/)
  })

  it('lets the intro and outro words be edited in the talking intro step, when talking intros are set up', () => {
    const html = render()
    expect(html).toContain('id="video-bookend-intro"')
    expect(html).toContain('id="video-bookend-outro"')
    expect(html).toContain('Hi! Today we&#x27;re looking at Deck.')
    vi.stubEnv('VITE_WAVESPEED_API_KEY', '')
    expect(render()).not.toContain('id="video-bookend-intro"')
  })
})

describe('VoiceGroup', () => {
  const VOICES = [
    { id: 'v1', name: 'Yan', tagline: '', gender: '' },
    { id: 'v2', name: 'Mo', tagline: '', gender: '' },
  ] as unknown as Parameters<typeof VoiceGroup>[0]['voices']
  const group = (props: Partial<Parameters<typeof VoiceGroup>[0]> = {}) =>
    renderToStaticMarkup(<VoiceGroup title="Your voices" voices={VOICES} selectedId="v1" onPick={() => {}} {...props} />)

  // The delete button sits at the right of each own voice's row: always shown on the chosen one,
  // and on the others only while hovered or focused.
  it('puts a delete button on every own voice, shown on the chosen row and hidden until hover on the rest', () => {
    const html = group({ onDelete: () => {} })
    expect(tagLabelled(html, 'Delete Yan')).toContain('opacity-100')
    expect(tagLabelled(html, 'Delete Yan')).not.toContain('opacity-0')
    expect(tagLabelled(html, 'Delete Mo')).toContain('opacity-0 group-hover:opacity-100')
    expect(tagLabelled(html, 'Delete Mo')).toContain('focus-visible:opacity-100')
  })

  it('has no delete button for voices that cannot be deleted', () => {
    expect(group()).not.toContain('aria-label="Delete')
  })

  // Hearing a voice is one press on its row, beside the delete button, not a link under the list.
  it('puts a play button on every row, before the delete button, that turns into Stop for the voice being heard', () => {
    const html = group({ onDelete: () => {}, onPlay: () => {}, playingId: 'v2', playPhase: 'playing' })
    expect(tagLabelled(html, 'Hear Yan')).toContain('type="button"')
    expect(html.indexOf('aria-label="Hear Yan"')).toBeLessThan(html.indexOf('aria-label="Delete Yan"'))
    expect(tagLabelled(html, 'Stop Mo')).toContain('type="button"')
    expect(html).not.toContain('aria-label="Hear Mo"')
  })

  it('folds its rows away behind its title when it can be collapsed', () => {
    const open = group({ open: true, onOpenChange: () => {} })
    expect(open).toMatch(/<button[^>]*aria-expanded="true"[^>]*>/)
    expect(open).toMatch(/<div id="voice-group-your-voices">/)
    const closed = group({ open: false, onOpenChange: () => {} })
    expect(closed).toMatch(/<button[^>]*aria-expanded="false"[^>]*>/)
    expect(closed).toMatch(/<div id="voice-group-your-voices" hidden="">/)
    // Without a toggle the title is plain text and the rows always show.
    expect(group()).not.toContain('aria-expanded')
  })

  it('disables the delete buttons when asked', () => {
    expect(tagLabelled(group({ onDelete: () => {}, deleteDisabled: true }), 'Delete Yan')).toContain('disabled=""')
  })
})

describe('VideoTile', () => {
  const view = {
    record: { path: 'u1/p1/a.mp4', contentType: 'video/mp4' as const, durationSeconds: 124, generatedAt: '2026-11-23T23:05:21.000Z' },
    url: 'https://signed/a.mp4',
    downloadUrl: null,
  }
  const tile = (props: { latest?: boolean; playing?: boolean } = {}) =>
    renderToStaticMarkup(<VideoTile view={view} latest={props.latest ?? false} playing={props.playing ?? false} onPlay={() => {}} />)

  // The picture comes from the file itself, a moment in; it is decoration, so it is hidden from screen readers and focus.
  it('shows the video’s own first picture with its length, and is one button', () => {
    const html = tile()
    expect(html).toMatch(/<video[^>]*src="https:\/\/signed\/a\.mp4#t=0\.1"[^>]*>/)
    expect(html).toMatch(/<video[^>]*aria-hidden="true"/)
    expect(html).toContain('2:04')
    expect(html.match(/<button/g)).toHaveLength(1)
  })

  it('marks the video in the player, and the latest one', () => {
    expect(tile({ playing: true })).toContain('aria-pressed="true"')
    expect(tile({ playing: true })).toContain('>Playing<')
    expect(tile()).toContain('aria-pressed="false"')
    expect(tile({ latest: true })).toContain('Latest')
    expect(tile()).not.toContain('Latest')
  })
})
