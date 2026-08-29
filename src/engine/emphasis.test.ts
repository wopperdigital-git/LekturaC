import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { applyEmphasis, stripEmphasis } from './emphasis'

/*
  The model's asterisks become bold marks exactly once, at ingest.

  Worth pinning in a suite this narrow because the offsets are the whole risk:
  a mark is a character range over the *stripped* string, so an off-by-two from
  the removed delimiters silently bolds the wrong characters, and a regex that
  is a shade too greedy eats arithmetic and stray punctuation out of decks
  nobody was trying to format.
*/

describe('stripEmphasis', () => {
  it('leaves text with no emphasis completely alone', () => {
    expect(stripEmphasis('Plain heading')).toEqual({ text: 'Plain heading', marks: [] })
  })

  it('bolds a single-asterisk run and removes the delimiters', () => {
    // Offsets are over the result, not the input: 'Revenue ' is 8 characters.
    expect(stripEmphasis('Revenue *doubled* this year')).toEqual({
      text: 'Revenue doubled this year',
      marks: [{ start: 8, end: 15, type: 'bold' }],
    })
  })

  it('treats the double-asterisk form as bold too', () => {
    expect(stripEmphasis('**Everything** changed')).toEqual({
      text: 'Everything changed',
      marks: [{ start: 0, end: 10, type: 'bold' }],
    })
  })

  it('handles several runs in one string, each measured after the last', () => {
    const { text, marks } = stripEmphasis('*a* and *b*')
    expect(text).toBe('a and b')
    expect(marks).toEqual([
      { start: 0, end: 1, type: 'bold' },
      { start: 6, end: 7, type: 'bold' },
    ])
  })

  /*
    The cases that must NOT match. Every one of these appears in real generated
    copy, and turning any of them into bold would eat characters off the slide.
  */
  it('ignores asterisks that are not emphasis', () => {
    for (const text of ['2 * 3 = 6', 'a * b', 'star * alone', '* *', 'trailing *']) {
      expect(stripEmphasis(text)).toEqual({ text, marks: [] })
    }
  })

  it('does not span across a run boundary', () => {
    // Not one mark from the first asterisk to the last.
    const { text, marks } = stripEmphasis('*one* plain *two*')
    expect(text).toBe('one plain two')
    expect(marks).toHaveLength(2)
  })
})

describe('applyEmphasis', () => {
  it('returns no inline record when a deck has no emphasis', () => {
    const blocks: ContentBlock[] = [{ type: 'heading', text: 'Clean' }]
    const result = applyEmphasis(blocks)
    expect(result.inline).toBeUndefined()
    // Untouched blocks keep their identity, so nothing downstream sees a change.
    expect(result.blocks[0]).toBe(blocks[0])
  })

  it('keys marks by the same textRef the layouts render with', () => {
    const { blocks, inline } = applyEmphasis([
      { type: 'heading', text: 'The *big* number' },
      { type: 'bulletList', items: ['plain', 'a **bold** point'] },
    ])

    expect(blocks[0]).toEqual({ type: 'heading', text: 'The big number' })
    expect(blocks[1]).toEqual({ type: 'bulletList', items: ['plain', 'a bold point'] })
    expect(inline).toEqual({
      '0:text': { marks: [{ start: 4, end: 7, type: 'bold' }] },
      '1:items:1': { marks: [{ start: 2, end: 6, type: 'bold' }] },
    })
  })

  it('covers every text field of a block, not just the first', () => {
    const { blocks, inline } = applyEmphasis([
      { type: 'stat', value: '*42%*', label: 'of *decks*' },
    ])
    expect(blocks[0]).toEqual({ type: 'stat', value: '42%', label: 'of decks' })
    expect(Object.keys(inline ?? {})).toEqual(['0:value', '0:label'])
  })

  /*
    The read boundary runs this on every deck, including ones already converted
    and ones the user has formatted by hand — so both have to survive it.
  */
  // A real generated line: a work's title emphasised, an en dash and a year
  // alongside it. The dash and the parentheses must survive untouched.
  it('converts a title inside a real numbered-list item', () => {
    const { blocks, inline } = applyEmphasis([
      {
        type: 'bulletList',
        items: ['*The Stranger* (1942) – a novel that dramatizes the absurd'],
      },
    ])

    expect(blocks[0]).toEqual({
      type: 'bulletList',
      items: ['The Stranger (1942) – a novel that dramatizes the absurd'],
    })
    expect(inline).toEqual({
      '0:items:0': { marks: [{ start: 0, end: 12, type: 'bold' }] },
    })
  })

  it('is idempotent: a converted card passes through unchanged', () => {
    const once = applyEmphasis([{ type: 'heading', text: 'The *big* number' }])
    const twice = applyEmphasis(once.blocks, once.inline)

    expect(twice.blocks).toEqual(once.blocks)
    expect(twice.inline).toEqual(once.inline)
  })

  it('leaves a run that already carries marks completely alone', () => {
    // Those offsets describe the stored string; removing two delimiters from
    // under them would slide every one onto the wrong characters.
    const existing = { '0:text': { marks: [{ start: 0, end: 3, type: 'bold' as const }] } }
    const { blocks, inline } = applyEmphasis([{ type: 'heading', text: 'The *big* number' }], existing)

    expect(blocks[0]).toEqual({ type: 'heading', text: 'The *big* number' })
    expect(inline).toEqual(existing)
  })

  /*
    The half-saved conversion, and the reason the rule above is "marks that are
    not this conversion's own" rather than "any marks at all".

    `toggleTextMark` and `setInlineStyle` used to persist `inline` without
    `blocks`, so the marks computed at the read boundary could reach the row
    while the un-stripped text stayed behind. Reading that back hit the skip and
    froze it: asterisks on screen for good, every mark one character off per
    delimiter ahead of it. Both halves are written together now, but decks that
    already went through it still have to come back.
  */
  it('heals a run whose marks landed in the row without the stripped text', () => {
    const blocks: ContentBlock[] = [{ type: 'heading', text: 'The *big* number' }]
    // Exactly what a previous read wrote — this function's own output.
    const halfSaved = applyEmphasis(blocks).inline

    const healed = applyEmphasis(blocks, halfSaved)

    expect(healed.blocks[0]).toEqual({ type: 'heading', text: 'The big number' })
    expect(healed.inline?.['0:text'].marks).toEqual([{ start: 4, end: 7, type: 'bold' }])
  })

  it('heals only the run that was half-saved, not its neighbours', () => {
    const blocks: ContentBlock[] = [
      { type: 'bulletList', items: ['*one* here', '*two* here'] },
    ]
    const halfSaved = { '0:items:1': applyEmphasis(blocks).inline!['0:items:1'] }

    const { blocks: healed } = applyEmphasis(blocks, halfSaved)

    expect(healed[0]).toEqual({ type: 'bulletList', items: ['one here', 'two here'] })
  })

  it('keeps a style already stored on a run it converts', () => {
    const existing = { '0:text': { style: { align: 'center' as const } } }
    const { inline } = applyEmphasis([{ type: 'heading', text: 'The *big* number' }], existing)

    expect(inline?.['0:text']).toEqual({
      style: { align: 'center' },
      marks: [{ start: 4, end: 7, type: 'bold' }],
    })
  })

  it('never rewrites an image block, whose strings are not slide text', () => {
    const blocks: ContentBlock[] = [{ type: 'image', url: 'https://x/a*b*c.png', alt: '*alt*' }]
    const result = applyEmphasis(blocks)
    expect(result.blocks[0]).toBe(blocks[0])
    expect(result.inline).toBeUndefined()
  })
})

/*
  The asterisks the pair matcher leaves behind.

  `stripEmphasis` only removes delimiters that match, which is right for
  deciding what is *bold* but leaves everything a model emits one-sided or
  malformed sitting on the slide as punctuation. The sweep removes those, and
  the line it draws is "pressed against a letter" — see `dropStrayDelimiters`.
*/
describe('stray delimiters', () => {
  const textOf = (blocks: ContentBlock[]) => (blocks[0] as { text: string }).text

  it('removes a delimiter that never found its partner', () => {
    const { blocks } = applyEmphasis([{ type: 'heading', text: '*The Stranger (1942)' }])
    expect(textOf(blocks)).toBe('The Stranger (1942)')
  })

  it('removes the odd delimiters around a triple-asterisk run, and bolds it', () => {
    const { blocks, inline } = applyEmphasis([{ type: 'heading', text: 'a ***loud*** word' }])
    expect(textOf(blocks)).toBe('a loud word')
    expect(inline?.['0:text'].marks).toEqual([{ start: 2, end: 6, type: 'bold' }])
  })

  it('drops a markdown list marker the layout already numbers', () => {
    const { blocks } = applyEmphasis([
      { type: 'bulletList', items: ['* first point', '* second point'] },
    ])
    expect((blocks[0] as { items: string[] }).items).toEqual(['first point', 'second point'])
  })

  it('keeps arithmetic, spaced or not', () => {
    const { blocks } = applyEmphasis([{ type: 'heading', text: 'either 2 * 3 or 5*3' }])
    expect(textOf(blocks)).toBe('either 2 * 3 or 5*3')
  })

  it('keeps a lone asterisk standing on its own as a footnote mark', () => {
    const { blocks } = applyEmphasis([{ type: 'heading', text: 'Revenue grew 40% *' }])
    expect(textOf(blocks)).toBe('Revenue grew 40% *')
  })

  it('keeps the bold on the right characters when a stray sits before it', () => {
    const { blocks, inline } = applyEmphasis([{ type: 'heading', text: '*Note: **read** this' }])
    expect(textOf(blocks)).toBe('Note: read this')
    const marks = inline?.['0:text'].marks ?? []
    expect(textOf(blocks).slice(marks[0].start, marks[0].end)).toBe('read')
  })

  it('still leaves a hand-formatted run completely alone', () => {
    const existing = { '0:text': { marks: [{ start: 0, end: 3, type: 'bold' as const }] } }
    const { blocks } = applyEmphasis([{ type: 'heading', text: '*The Stranger' }], existing)
    expect(textOf(blocks)).toBe('*The Stranger')
  })
})
