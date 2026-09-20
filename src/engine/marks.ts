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

  Two kinds of mark. *Flag* marks — bold, italic, underline — are either on or
  off over a range. *Value* marks — colour, font and size — carry a value, so a
  range is "in Georgia" or "at 140%" rather than merely marked. Alignment is
  deliberately neither: it belongs to a whole paragraph, and per-character
  alignment is not a thing.

  A value mark's size is a multiple of the text around it, not an absolute, for
  the same reason an element's is a multiple of its theme's: an absolute point
  size would flatten the deck's hierarchy, and a word set at 140% stays 140% of
  its heading or its body wherever the theme sends it.
*/

export const FLAG_MARK_TYPES = ['bold', 'italic', 'underline'] as const
export const VALUE_MARK_TYPES = ['color', 'fontFamily', 'fontScale'] as const
export const MARK_TYPES = [...FLAG_MARK_TYPES, ...VALUE_MARK_TYPES] as const
export type FlagMarkType = (typeof FLAG_MARK_TYPES)[number]
export type ValueMarkType = (typeof VALUE_MARK_TYPES)[number]
export type MarkType = (typeof MARK_TYPES)[number]

/** What a value mark carries: a `#rrggbb`, a font stack, or a size multiple. */
export type MarkValue = string | number

/**
 * How far a run's size may be scaled against the text around it. Wider than an
 * element's own range (`MIN_FONT_SCALE`/`MAX_FONT_SCALE`): setting one word at
 * double size is an ordinary thing to do, and setting a whole heading at double
 * is not.
 */
export const MIN_RUN_SCALE = 0.5
export const MAX_RUN_SCALE = 3
export const RUN_SCALE_STEP = 0.1

/** Held to the run range and rounded, so repeated stepping does not drift. */
export function clampRunScale(scale: number): number {
  return Math.round(Math.min(MAX_RUN_SCALE, Math.max(MIN_RUN_SCALE, scale)) * 100) / 100
}

export const markSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  type: z.enum(MARK_TYPES),
  /** Present on value marks only. Every mark stored before value marks existed has none, and is a flag. */
  value: z.union([z.string(), z.number()]).optional(),
})

export type Mark = z.infer<typeof markSchema>

export interface TextRange {
  start: number
  end: number
}

const isEmpty = (m: { start: number; end: number }) => m.end <= m.start

/**
 * Merges touching or overlapping marks of the same type *and value* and drops
 * empty ones.
 *
 * Without this, toggling bold across a selection that already contains bold
 * runs accumulates fragments — `[0,3)` `[3,7)` `[7,9)` instead of `[0,9)` —
 * which still renders correctly but grows the stored array without bound as
 * the user keeps editing. The value is part of the identity: two touching red
 * ranges are one range, but a red one beside a blue one must stay two.
 */
export function normalizeMarks(marks: Mark[]): Mark[] {
  const out: Mark[] = []
  for (const type of MARK_TYPES) {
    const ofType = marks.filter((m) => m.type === type && !isEmpty(m))
    const values = new Set(ofType.map((m) => String(m.value ?? '')))

    for (const value of values) {
      const group = ofType
        .filter((m) => String(m.value ?? '') === value)
        .sort((a, b) => a.start - b.start || a.end - b.end)

      let current: Mark | null = null
      for (const mark of group) {
        if (current && mark.start <= current.end) {
          current.end = Math.max(current.end, mark.end)
        } else {
          if (current) out.push(current)
          current = { ...mark }
        }
      }
      if (current) out.push(current)
    }
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
  type: FlagMarkType,
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
 * Sets a value mark over `range` — or clears it with `null`.
 *
 * Unlike a flag, a value has no "toggle": choosing red for a word that is
 * already blue makes it red, so whatever value the range held is *replaced*, not
 * merged into. What lies outside the range keeps its own value, clipped to the
 * edges of the new one.
 */
export function applyValueMark(
  marks: Mark[],
  range: TextRange,
  type: ValueMarkType,
  value: MarkValue | null,
): Mark[] {
  if (isEmpty(range)) return normalizeMarks(marks)

  const untouched = marks.filter((m) => m.type !== type)
  const rebuilt: Mark[] = []

  for (const mark of marks.filter((m) => m.type === type)) {
    if (mark.start < range.start) {
      rebuilt.push({ ...mark, end: Math.min(mark.end, range.start) })
    }
    if (mark.end > range.end) {
      rebuilt.push({ ...mark, start: Math.max(mark.start, range.end) })
    }
  }

  if (value !== null) rebuilt.push({ type, start: range.start, end: range.end, value })
  return normalizeMarks([...untouched, ...rebuilt])
}

/**
 * The value a selection is showing for `type`: that of the character it starts
 * on, or `null` when that character has none.
 *
 * The first character rather than "all of them or nothing": a selection that
 * straddles two values has no single answer, and the toolbar still has to show
 * one. What the start reads as is predictable, and it is what most editors do.
 */
export function markValueAt(marks: Mark[], range: TextRange, type: ValueMarkType): MarkValue | null {
  const covering = marks.filter((m) => m.type === type && !isEmpty(m) && m.start <= range.start && m.end > range.start)
  return covering.length > 0 ? (covering[covering.length - 1].value ?? null) : null
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
  underline: boolean
  /** Present only where a value mark covers the segment. */
  color?: string
  fontFamily?: string
  fontScale?: number
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
  if (active.length === 0) return [{ text, bold: false, italic: false, underline: false }]

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
    const covers = (m: Mark) => m.start <= start && m.end >= end
    const segment: TextSegment = {
      text: text.slice(start, end),
      bold: active.some((m) => m.type === 'bold' && covers(m)),
      italic: active.some((m) => m.type === 'italic' && covers(m)),
      underline: active.some((m) => m.type === 'underline' && covers(m)),
    }
    // The last covering mark wins, so a stored overlap resolves the same way
    // every time. Only set when there is one, which keeps a plain segment plain.
    const valueOf = (type: ValueMarkType) => active.filter((m) => m.type === type && covers(m)).pop()?.value
    const color = valueOf('color')
    const fontFamily = valueOf('fontFamily')
    const fontScale = valueOf('fontScale')
    if (typeof color === 'string') segment.color = color
    if (typeof fontFamily === 'string') segment.fontFamily = fontFamily
    if (typeof fontScale === 'number') segment.fontScale = fontScale
    segments.push(segment)
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
