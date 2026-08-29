import type { ContentBlock } from './contentBlocks'
import type { Card } from './contentBlocks'
import { shiftMarks, textRef, type Mark } from './marks'

/*
  Turning the asterisks a model writes into real bold.

  Models emphasise with markdown whatever the prompt asks of them, so decks
  arrived with literal `*asterisks*` sitting on the slide. This converts them
  once, at the moment a generated deck is created: the delimiters come off the
  text and a bold mark takes their place over the characters they wrapped.

  Done at ingest rather than at render, and that is the load-bearing choice.
  Marks address characters by offset (see `marks.ts`), so stripping delimiters
  at render would mean the stored string and the drawn string disagree about
  where every character is — the editor's caret, its selection ranges and every
  existing mark would land in the wrong place the moment a run contained one.
  Converting once means the text is clean everywhere afterwards, and the result
  is indistinguishable from bold the user applied by hand.

  Only bold. `*x*` is italic in markdown, but the ask was bold and a deck full
  of asterisks is the problem being solved, so both forms map to bold rather
  than leaving one of them on screen as punctuation.
*/

/**
 * Which fields of each block hold text a reader sees.
 *
 * A `Record` over the union rather than a switch with a default, so a new block
 * type is a type error here instead of silently keeping its asterisks. `image`
 * is deliberately empty: `url`, `alt` and `prompt` are not runs of slide text,
 * and a URL is exactly the kind of string that can carry a stray asterisk.
 */
const TEXT_FIELDS: Record<ContentBlock['type'], readonly string[]> = {
  heading: ['text'],
  paragraph: ['text'],
  bulletList: ['items'],
  stat: ['value', 'label'],
  image: [],
  quote: ['text', 'attribution'],
  timelineStep: ['label', 'text'],
  comparisonGroup: ['heading', 'items'],
}

/*
  `**bold**` first, then `*bold*` — alternation is tried left to right at each
  position, so the double form cannot be mistaken for an empty single one.

  Both require the run to *start and end* with a non-space and to contain no
  asterisk of its own. That is what keeps arithmetic and stray punctuation out
  of it: `2 * 3` has spaces inside, `* *` is nothing but a space, and a lone
  unmatched `*` never finds its partner. A model writing a genuine emphasis
  never puts a space against the delimiter.

  The edges are `[^*\s]` rather than `\S`, and the difference is not cosmetic:
  `\S` matches an asterisk, so in `*Note: **read** this` the leading stray
  paired with the *first half* of the `**` and bolded `Note: ` instead of
  `read`. Spelling the edge as "neither space nor asterisk" makes the run
  genuinely asterisk-free and leaves the stray for the sweep below.
*/
const EMPHASIS = /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*/g

/** Whether two mark lists are the same runs of the same types, in the same order. */
function sameMarks(a: readonly Mark[], b: readonly Mark[]): boolean {
  return (
    a.length === b.length &&
    a.every((m, i) => m.start === b[i].start && m.end === b[i].end && m.type === b[i].type)
  )
}

/** One string with its delimiters removed, and the bold marks that replace them. */
export function stripEmphasis(text: string): { text: string; marks: Mark[] } {
  const marks: Mark[] = []
  let out = ''
  let last = 0

  for (const match of text.matchAll(EMPHASIS)) {
    const inner = match[1] ?? match[2]
    const at = match.index ?? 0
    out += text.slice(last, at)
    // Measured against the text being built, never the original: the offsets
    // have to describe the string after the delimiters are gone.
    const start = out.length
    out += inner
    marks.push({ start, end: out.length, type: 'bold' })
    last = at + match[0].length
  }

  out += text.slice(last)
  return { text: out, marks }
}

/*
  Asterisks the pair matcher above will never claim.

  `stripEmphasis` only removes delimiters that *match*, which leaves the messy
  half of what models actually emit: a run closed on one side only
  (`*The Stranger` with no partner), the odd count in `***word***`, a `* ` list
  marker at the head of a bullet the layout is already numbering. None of those
  are emphasis, so none of them get converted — and every one of them shows up
  on the slide as punctuation nobody wrote.

  Removed only where the asterisk is pressed against a **letter**, which is what
  separates a stray delimiter from a real one. `2 * 3` keeps its spaces, `5*3`
  has digits on both sides, and a lone `*` standing as a footnote mark touches
  nothing — all three survive. `*The` and `Sisyphus*` do not.

  Marks move with the text through `shiftMarks`, right to left so each earlier
  offset is still valid when it is used. Removing characters from under a mark
  any other way is exactly the drift this module exists to avoid.
*/
const LETTER = /\p{L}/u

function dropStrayDelimiters(text: string, marks: Mark[]): { text: string; marks: Mark[] } {
  const strays: { at: number; length: number }[] = []

  for (const match of text.matchAll(/\*+/g)) {
    const at = match.index ?? 0
    const before = text[at - 1]
    const after = text[at + match[0].length]
    // A markdown list marker leading the run: the layout draws its own bullet.
    const listMarker = at === 0 && (after === ' ' || after === '\t')
    if (listMarker || LETTER.test(before ?? '') || LETTER.test(after ?? '')) {
      strays.push({ at, length: match[0].length })
    }
  }

  let out = text
  let moved = marks
  for (let i = strays.length - 1; i >= 0; i--) {
    const { at, length } = strays[i]
    out = out.slice(0, at) + out.slice(at + length)
    moved = shiftMarks(moved, at, length, 0)
  }

  // A leading marker leaves its separating space behind; the run should not
  // start with one.
  const trimmed = out.replace(/^[ \t]+/, '')
  if (trimmed !== out) moved = shiftMarks(moved, 0, out.length - trimmed.length, 0)

  return { text: trimmed, marks: moved }
}

/**
 * Rewrites a card's blocks with their emphasis converted to marks.
 *
 * Returns the `inline` record the marks belong in — keyed by `textRef`, exactly
 * as the editor writes it, so nothing downstream can tell the difference
 * between this and bold somebody applied themselves. `undefined` when a card
 * has no emphasis and no existing entries, which keeps an untouched card empty.
 *
 * Idempotent, which is what lets it run both when a deck is created *and* every
 * time one is read: converted text has no delimiters left to find, so a second
 * pass changes nothing.
 *
 * `existing` is the card's current `inline`. A run that **already carries
 * marks** is left completely alone, delimiters and all, and that rule is the
 * load-bearing one: those marks are character offsets into the text as it is
 * stored, so stripping two delimiters out from under them would slide every one
 * of them onto the wrong characters. Formatting somebody applied by hand
 * outranks tidying up asterisks.
 */
export function applyEmphasis(
  blocks: ContentBlock[],
  existing?: Card['inline'],
): {
  blocks: ContentBlock[]
  inline: Card['inline']
} {
  const inline: NonNullable<Card['inline']> = { ...existing }

  const next = blocks.map((block, index) => {
    let changed = false
    const patch: Record<string, unknown> = {}

    const convert = (field: string, value: string, itemIndex?: number): string => {
      const ref = textRef(index, field, itemIndex)

      const stripped = stripEmphasis(value)
      const carried = existing?.[ref]?.marks
      /*
        This run still has delimiters *and* already carries marks, which a
        finished conversion can never produce — a converted run has no
        delimiters left to find. It is a conversion that was only half saved:
        `toggleTextMark` and `setInlineStyle` write `inline` without `blocks`,
        so the marks computed here at the read boundary could reach the row
        while the un-stripped text stayed behind. Reading that back used to hit
        the skip below and freeze it: asterisks on screen forever, with every
        mark sitting one character off per delimiter ahead of it.

        Recognised exactly rather than guessed at: those marks were produced by
        this function from this very string, so they are identical to the ones
        `stripEmphasis` just computed. Stripping the text now makes them
        correct — they already describe the stripped string. Anything else is
        formatting somebody applied by hand, and it still wins.
      */
      const halfSaved = carried !== undefined && sameMarks(carried, stripped.marks)
      /*
        Hand-applied formatting wins: its offsets describe the stored string.

        Compared against the *pair matcher's* output alone, before the stray
        sweep below — those are the marks a previous read would have written,
        so that is what a half-saved row carries. Comparing against the swept
        result would stop recognising a corrupted run the moment it also held a
        stray asterisk, and leave it broken for good.
      */
      if (!halfSaved && (carried?.length ?? 0) > 0) return value

      const cleaned = dropStrayDelimiters(stripped.text, stripped.marks)
      if (cleaned.text === value && cleaned.marks.length === 0) return value

      changed = true
      // Any style already on this run is kept; only the marks are added — and
      // only when there are any, so removing a stray asterisk from unformatted
      // text does not invent an empty entry for it.
      if (cleaned.marks.length > 0) inline[ref] = { ...existing?.[ref], marks: cleaned.marks }
      return cleaned.text
    }

    for (const field of TEXT_FIELDS[block.type]) {
      const value = (block as unknown as Record<string, unknown>)[field]
      if (typeof value === 'string') {
        patch[field] = convert(field, value)
      } else if (Array.isArray(value)) {
        patch[field] = value.map((item, i) =>
          typeof item === 'string' ? convert(field, item, i) : item,
        )
      }
    }

    return changed ? ({ ...block, ...patch } as ContentBlock) : block
  })

  return { blocks: next, inline: Object.keys(inline).length > 0 ? inline : undefined }
}
