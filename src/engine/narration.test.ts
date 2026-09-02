import { describe, expect, it } from 'vitest'
import {
  isRegenerable,
  isResettable,
  mergeNarration,
  narrationStatus,
  parseNarration,
  type Narration,
} from './narration'

describe('narrationStatus', () => {
  it('is empty when there is no narration at all', () => {
    expect(narrationStatus(undefined)).toBe('empty')
  })

  it('is generated when the text still matches what the AI wrote', () => {
    expect(narrationStatus({ text: 'Hello there.', generated: 'Hello there.' })).toBe('generated')
  })

  it('is edited when the text has diverged from the generated copy', () => {
    expect(narrationStatus({ text: 'My words.', generated: 'AI words.' })).toBe('edited')
  })

  it('is edited when text was typed by hand with nothing generated', () => {
    expect(narrationStatus({ text: 'Typed from scratch.' })).toBe('edited')
  })

  /*
    The chip has to predict what "Generate all" will do. A blanked script IS
    rewritten, so reporting it as `edited` would be a lie the user only
    discovers after pressing the button.
  */
  it('is empty when the text is blank even though a generated copy survives', () => {
    expect(narrationStatus({ text: '   ', generated: 'AI words.' })).toBe('empty')
  })
})

describe('isRegenerable', () => {
  it('regenerates a slide that has never been written', () => {
    expect(isRegenerable(undefined)).toBe(true)
  })

  it('regenerates a slide still holding the AI version untouched', () => {
    expect(isRegenerable({ text: 'AI words.', generated: 'AI words.' })).toBe(true)
  })

  it('regenerates a deliberately blanked slide', () => {
    expect(isRegenerable({ text: '', generated: 'AI words.' })).toBe(true)
  })

  it('never regenerates a hand-edited slide', () => {
    expect(isRegenerable({ text: 'My words.', generated: 'AI words.' })).toBe(false)
  })
})

describe('isResettable', () => {
  it('offers reset once an edit has diverged from the generated copy', () => {
    expect(isResettable({ text: 'My words.', generated: 'AI words.' })).toBe(true)
  })

  it('still offers reset on a blanked slide, so blanking cannot lose the AI copy', () => {
    expect(isResettable({ text: '', generated: 'AI words.' })).toBe(true)
  })

  it('offers nothing to reset to when the AI never wrote this slide', () => {
    expect(isResettable({ text: 'Typed from scratch.' })).toBe(false)
  })

  it('offers nothing when the text already is the generated copy', () => {
    expect(isResettable({ text: 'AI words.', generated: 'AI words.' })).toBe(false)
  })
})

describe('parseNarration', () => {
  it('reads a stored value back', () => {
    expect(parseNarration({ text: 'a', generated: 'b' })).toEqual({ text: 'a', generated: 'b' })
  })

  /*
    The column defaults to '{}', so every row written before migration 0008
    reads back as an empty object. "Has a narration column" is not the same
    question as "has a script" — the same distinction `parseAdjusts` draws.
  */
  it('maps the default empty object to undefined', () => {
    expect(parseNarration({})).toBeUndefined()
  })

  it('maps malformed values to undefined rather than throwing', () => {
    expect(parseNarration(null)).toBeUndefined()
    expect(parseNarration('a script')).toBeUndefined()
    expect(parseNarration({ text: 42 })).toBeUndefined()
  })
})

describe('mergeNarration', () => {
  const cards = (): { id: string; narration?: Narration }[] => [
    { id: 'a' },
    { id: 'b', narration: { text: 'My words.', generated: 'Old AI words.' } },
    { id: 'c', narration: { text: 'Old AI words.', generated: 'Old AI words.' } },
  ]

  it('writes a script into a slide that had none', () => {
    const out = mergeNarration(cards(), [{ slide: 1, text: 'Fresh.' }])
    expect(out[0].narration).toEqual({ text: 'Fresh.', generated: 'Fresh.' })
  })

  it('rewrites a slide still holding an untouched generated script', () => {
    const out = mergeNarration(cards(), [{ slide: 3, text: 'New AI words.' }])
    expect(out[2].narration).toEqual({ text: 'New AI words.', generated: 'New AI words.' })
  })

  /*
    THE load-bearing rule. The prompt asks the model to leave edited slides
    alone, but a prompt is a request; this is the invariant. Deleting the
    guard in mergeNarration must fail this test.
  */
  it('drops a script aimed at a hand-edited slide', () => {
    const out = mergeNarration(cards(), [{ slide: 2, text: 'Model tried to overwrite.' }])
    expect(out[1].narration).toEqual({ text: 'My words.', generated: 'Old AI words.' })
  })

  it('ignores a slide number that matches no card', () => {
    const out = mergeNarration(cards(), [{ slide: 99, text: 'Nowhere.' }])
    expect(out).toEqual(cards())
  })

  it('ignores a slide number below the first slide', () => {
    const out = mergeNarration(cards(), [{ slide: 0, text: 'Nowhere.' }])
    expect(out).toEqual(cards())
  })

  it('leaves the input array untouched', () => {
    const input = cards()
    mergeNarration(input, [{ slide: 1, text: 'Fresh.' }])
    expect(input[0].narration).toBeUndefined()
  })

  /*
    `applyGeneratedNarration` (presentationStore.ts) detects a no-op response —
    every returned script landed on an already-edited slide — by comparing
    elements for reference equality against the sorted input, so it can skip
    the undo push and the deck-wide write. That shortcut is only valid because
    every untouched card comes back as the SAME object, not an equal copy —
    pin that here so a future rewrite of the map to always spread can't
    silently break it.
  */
  it('returns the identical object for a card it did not rewrite, not merely an equal one', () => {
    const input = cards()
    const out = mergeNarration(input, [{ slide: 2, text: 'Model tried to overwrite.' }])
    expect(out[0]).toBe(input[0])
    expect(out[1]).toBe(input[1])
    expect(out[2]).toBe(input[2])
  })

  it('returns a NEW object for a card whose script was actually written', () => {
    const input = cards()
    const out = mergeNarration(input, [{ slide: 1, text: 'Fresh.' }])
    expect(out[0]).not.toBe(input[0])
  })
})
