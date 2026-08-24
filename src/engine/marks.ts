import { z } from 'zod'

/*
  Character-level formatting for one run of text.

  A mark is a half-open character range `[start, end)` carrying one inline
  style. Marks live *beside* the text rather than inside it: `ContentBlock`
  keeps its plain `string` fields exactly as the AI generates and zod validates
  them, and the editor stores marks separately on the card. A node tree would
  have meant rewriting the generation schema, the validation retry path, and
  every layout's text rendering at once.

  The cost of that choice, and the reason `shiftMarks` exists: offsets are not
  self-maintaining. Any edit to the text has to move the marks that sit after
  the edit point, or they silently drift onto the wrong characters.

  Only bold and italic are marks. Font family, size and alignment are
  deliberately *not* — they are properties of a whole text element in every
  editor worth copying, and per-character alignment is not a thing.
*/

export const MARK_TYPES = ['bold', 'italic'] as const
export type MarkType = (typeof MARK_TYPES)[number]

export const markSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  type: z.enum(MARK_TYPES),
})

export type Mark = z.infer<typeof markSchema>

export interface TextRange {
  start: number
  end: number
}

const isEmpty = (m: { start: number; end: number }) => m.end <= m.start

/**
 * Merges touching or overlapping marks of the same type and drops empty ones.
 *
 * Without this, toggling bold across a selection that already contains bold
 * runs accumulates fragments — `[0,3)` `[3,7)` `[7,9)` instead of `[0,9)` —
 * which still renders correctly but grows the stored array without bound as
 * the user keeps editing.
 */
export function normalizeMarks(marks: Mark[]): Mark[] {
  const out: Mark[] = []
  for (const type of MARK_TYPES) {
    const ofType = marks
      .filter((m) => m.type === type && !isEmpty(m))
      .sort((a, b) => a.start - b.start || a.end - b.end)

    let current: Mark | null = null
    for (const mark of ofType) {
      if (current && mark.start <= current.end) {
        current.end = Math.max(current.end, mark.end)
      } else {
        if (current) out.push(current)
        current = { ...mark }
      }
    }
    if (current) out.push(current)
  }
  return out.sort((a, b) => a.start - b.start || a.type.localeCompare(b.type))
}

/** True when every character in `range` already carries `type` — the toolbar's pressed state. */
export function hasMarkThroughout(marks: Mark[], range: TextRange, type: MarkType): boolean {
  if (isEmpty(range)) return false
  let covered = range.start
  for (const mark of normalizeMarks(marks).filter((m) => m.type === type)) {
    if (mark.start > covered) break
    covered = Math.max(covered, mark.end)
    if (covered >= range.end) return true
  }
  return covered >= range.end
}

/**
 * Adds or removes `type` across `range`.
 *
 * `on` is resolved by the caller from `hasMarkThroughout`, which gives the
 * usual editor behaviour: a selection that is entirely bold turns plain, and a
 * partially-bold one turns fully bold rather than inverting each run.
 */
export function applyMark(
  marks: Mark[],
  range: TextRange,
  type: MarkType,
  on: boolean,
): Mark[] {
  if (isEmpty(range)) return normalizeMarks(marks)

  const untouched = marks.filter((m) => m.type !== type)
  const rebuilt: Mark[] = []

  for (const mark of marks.filter((m) => m.type === type)) {
    // Keep whatever lies outside the range; the part inside is decided by `on`.
    if (mark.start < range.start) {
      rebuilt.push({ type, start: mark.start, end: Math.min(mark.end, range.start) })
    }
    if (mark.end > range.end) {
      rebuilt.push({ type, start: Math.max(mark.start, range.end), end: mark.end })
    }
  }

  if (on) rebuilt.push({ type, start: range.start, end: range.end })
  return normalizeMarks([...untouched, ...rebuilt])
}

/**
 * Moves marks to stay on the same characters after an edit.
 *
 * `removed` characters starting at `at` were deleted and `inserted` put in
 * their place. Marks entirely before the edit are untouched; those after shift
 * by the length delta; those spanning it are clipped. Text inserted at the
 * boundary of a mark is deliberately left *outside* it, so typing after a bold
 * word does not silently continue in bold.
 */
export function shiftMarks(
  marks: Mark[],
  at: number,
  removed: number,
  inserted: number,
): Mark[] {
  const delta = inserted - removed
  const removalEnd = at + removed

  const moved = marks.map((mark) => {
    const move = (pos: number) => {
      if (pos <= at) return pos
      if (pos >= removalEnd) return pos + delta
      // Inside the removed span: collapse onto the edit point.
      return at
    }
    return { ...mark, start: move(mark.start), end: move(mark.end) }
  })

  return normalizeMarks(moved.filter((m) => !isEmpty(m)))
}

export interface TextSegment {
  text: string
  bold: boolean
  italic: boolean
}

/**
 * Splits `text` into the runs a renderer can emit as spans.
 *
 * Boundaries come from every mark edge, so a run is by construction uniform in
 * styling and the segment list is the shortest one that can represent the
 * marks.
 */
export function textSegments(text: string, marks: Mark[] | undefined): TextSegment[] {
  const active = (marks ?? []).filter((m) => !isEmpty(m) && m.start < text.length)
  if (active.length === 0) return [{ text, bold: false, italic: false }]

  const edges = new Set<number>([0, text.length])
  for (const mark of active) {
    edges.add(Math.max(0, Math.min(text.length, mark.start)))
    edges.add(Math.max(0, Math.min(text.length, mark.end)))
  }
  const points = [...edges].sort((a, b) => a - b)

  const segments: TextSegment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    const end = points[i + 1]
    if (end <= start) continue
    segments.push({
      text: text.slice(start, end),
      bold: active.some((m) => m.type === 'bold' && m.start <= start && m.end >= end),
      italic: active.some((m) => m.type === 'italic' && m.start <= start && m.end >= end),
    })
  }
  return segments
}

/*
  Addressing one editable run of text inside a card.

  A card has many text fields across its blocks, and Level 3 needs to name the
  exact one the user clicked so its marks and element style can be stored and
  looked up. The key is derived from position — block index, field name, and an
  item index for the two array fields — rather than being a generated id,
  because blocks carry no ids of their own and inventing them would mean
  migrating every existing row.

  The tradeoff that follows: reordering or deleting *blocks within a card* would
  invalidate these keys. Nothing in the app does that today — cards are
  generated whole and only ever deleted or reordered as units — but a
  block-level editor would need to remap them.
*/
export function textRef(blockIndex: number, field: string, itemIndex?: number): string {
  return itemIndex === undefined ? `${blockIndex}:${field}` : `${blockIndex}:${field}:${itemIndex}`
}
