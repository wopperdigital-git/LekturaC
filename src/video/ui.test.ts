import { describe, expect, it } from 'vitest'
import { canCancelVideo, canStartGenerate, faceBlocker, faceRequest, generateBlocker, stageRows } from './ui'
import { FACE_NOT_SET_UP } from '@/lib/setupCopy'

const ok = { webCodecs: true, hasDeck: true, slideCount: 3, voiceChosen: true }

describe('generateBlocker', () => {
  it('is null when everything is in place', () => {
    expect(generateBlocker(ok)).toBeNull()
  })

  it('explains what is missing', () => {
    expect(generateBlocker({ ...ok, webCodecs: false })).toMatch(/cannot encode video/i)
    expect(generateBlocker({ ...ok, hasDeck: false })).toMatch(/saved deck/i)
    expect(generateBlocker({ ...ok, slideCount: 0 })).toMatch(/no slides/i)
    expect(generateBlocker({ ...ok, voiceChosen: false })).toMatch(/choose a voice/i)
  })

  // The browser is the hardest blocker to fix, so it is the one named when several apply.
  it('names the browser first', () => {
    expect(generateBlocker({ webCodecs: false, hasDeck: true, slideCount: 0, voiceChosen: false })).toMatch(/cannot encode video/i)
  })
})

describe('stageRows', () => {
  it('lists the four stages in order, all pending before anything is reported', () => {
    const rows = stageRows(null)
    expect(rows.map((r) => r.stage)).toEqual(['narrating', 'rendering', 'encoding', 'uploading'])
    expect(rows.every((r) => r.state === 'pending')).toBe(true)
  })

  it('marks earlier stages done, the current one active with its count, later ones pending', () => {
    const rows = stageRows({ stage: 'rendering', done: 2, total: 5 })
    expect(rows.map((r) => r.state)).toEqual(['done', 'active', 'pending', 'pending'])
    expect(rows[1].detail).toBe('2/5')
    expect(rows[0].detail).toBeNull()
  })

  it('shows no count for a single-step stage', () => {
    expect(stageRows({ stage: 'uploading', done: 0, total: 1 })[3].detail).toBeNull()
  })
})

describe('stageRows with the face', () => {
  it('adds the animating row second, only when the face is on', () => {
    const rows = stageRows(null, true)
    expect(rows.map((r) => r.stage)).toEqual(['narrating', 'animating', 'rendering', 'encoding', 'uploading'])
    expect(rows[1].label).toBe('Animating your intro & outro')
    expect(stageRows(null)).toHaveLength(4)
    expect(stageRows(null, false).map((r) => r.stage)).not.toContain('animating')
  })

  it('marks narrating done and animating active with its count', () => {
    const rows = stageRows({ stage: 'animating', done: 1, total: 2 }, true)
    expect(rows.map((r) => r.state)).toEqual(['done', 'active', 'pending', 'pending', 'pending'])
    expect(rows[1].detail).toBe('1/2')
  })
})

describe('faceBlocker', () => {
  const good = { configured: true, hasPhoto: true, introText: 'Hi', outroText: '' }

  it('is null when set up, with a photo and some text', () => {
    expect(faceBlocker(good)).toBeNull()
    expect(faceBlocker({ ...good, introText: '', outroText: 'Bye' })).toBeNull()
  })

  it('names the blockers in order', () => {
    const none = { configured: false, hasPhoto: false, introText: '', outroText: '' }
    expect(faceBlocker(none)).toBe(FACE_NOT_SET_UP)
    expect(faceBlocker({ ...none, configured: true })).toBe('Add a photo of your face first.')
    expect(faceBlocker({ ...none, configured: true, hasPhoto: true })).toBe(
      'Write an intro or an outro in the Narrate tab first.',
    )
  })

  it('counts whitespace as no text', () => {
    expect(faceBlocker({ ...good, introText: '  \n', outroText: ' ' })).toBe(
      'Write an intro or an outro in the Narrate tab first.',
    )
  })
})

describe('canCancelVideo', () => {
  // The upload cannot be aborted, so it is the point of no return.
  it('is true until the video is being saved', () => {
    expect(canCancelVideo(null)).toBe(true)
    expect(canCancelVideo({ stage: 'narrating', done: 0, total: 3 })).toBe(true)
    expect(canCancelVideo({ stage: 'encoding', done: 0, total: 1 })).toBe(true)
    expect(canCancelVideo({ stage: 'uploading', done: 0, total: 1 })).toBe(false)
  })
})

describe('canStartGenerate', () => {
  const good = {
    configured: true,
    blocker: null,
    ready: true,
    savedVoiceKnown: true,
    saving: false,
    generating: false,
    cloning: false,
    recording: false,
  }

  it('is true when everything is in place', () => {
    expect(canStartGenerate(good)).toBe(true)
  })

  // A clone finishing mid-run would re-pick the voice under a run already using the old one, so a clone
  // or a recording in progress is as much a stop as the rest.
  it.each([
    ['configured', { configured: false }],
    ['blocker', { blocker: 'Choose a voice first.' }],
    ['ready', { ready: false }],
    ['savedVoiceKnown', { savedVoiceKnown: false }],
    ['saving', { saving: true }],
    ['generating', { generating: true }],
    ['cloning', { cloning: true }],
    ['recording', { recording: true }],
  ])('is false when %s stops it', (_name, patch) => {
    expect(canStartGenerate({ ...good, ...patch })).toBe(false)
  })
})

describe('faceRequest', () => {
  const texts = { intro: 'Hi!', outro: 'Bye!' }

  it('makes a plain video when the switch was off or blocked on screen, whatever the blocker now', () => {
    expect(faceRequest({ effectiveOn: false, blockerNow: 'Add a photo of your face first.', ...texts })).toEqual({ kind: 'off' })
    expect(faceRequest({ effectiveOn: false, blockerNow: null, ...texts })).toEqual({ kind: 'off' })
  })

  it('stops with the reason when the switch was on but is now blocked', () => {
    expect(faceRequest({ effectiveOn: true, blockerNow: 'Write an intro or an outro in the Narrate tab first.', ...texts })).toEqual({
      kind: 'blocked',
      message: 'Write an intro or an outro in the Narrate tab first.',
    })
  })

  it('asks for the clips with the texts when the switch is on and nothing stops it', () => {
    expect(faceRequest({ effectiveOn: true, blockerNow: null, ...texts })).toEqual({
      kind: 'on',
      bookends: { intro: 'Hi!', outro: 'Bye!' },
    })
  })
})
