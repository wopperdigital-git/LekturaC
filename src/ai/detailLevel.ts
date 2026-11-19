/**
 * How much each detail level puts on a slide.
 *
 * Before this table the deck prompt, the repair prompt and the
 * `BODY_TOO_DENSE` validator all held one fixed set of limits (20-40 visible
 * words, 55 at most, 8-word bullets) whatever the brief asked for, and the
 * "detailed" instruction itself said to stay inside them — so Balanced and
 * Detailed decks came out the same and a fuller slide was trimmed back by
 * repair. Every one of those now reads its numbers from here, so the prompt,
 * the repair call and the validator cannot disagree about a level.
 *
 * Balanced keeps the old numbers exactly.
 */
export type DetailLevel = 'simplified' | 'balanced' | 'detailed'

export interface DensityRules {
  /** Target range of visible words (everything on a slide but its heading). */
  visibleWords: readonly [number, number]
  /** Past this a slide is flagged `BODY_TOO_DENSE` (medium, repaired). */
  maxVisibleWords: number
  /**
   * Under this a content slide is flagged `BODY_TOO_THIN` (medium, repaired);
   * `null` for levels where a short slide is fine. Set well below the target
   * floor on purpose: a false flag buys a repair call.
   */
  minVisibleWords: number | null
  bulletItems: readonly [number, number]
  bulletWords: number
  paragraphWords: number
  /** Level-specific writing rules, one per line, for both prompts. */
  rules: readonly string[]
}

/**
 * How long the explanatory paragraph a detailed slide pairs with a structure
 * may be — shorter than a stand-alone paragraph, so list + paragraph still
 * fits under the level's `maxVisibleWords`.
 */
export const DETAILED_PAIRED_PARAGRAPH_WORDS = 30

/** The longest run of consecutive `point` blocks a slide should carry (`POINT_RUN_TOO_LONG`, low). */
export const MAX_POINT_RUN = 6

/** The most lines a `code` block should hold (`CODE_TOO_LONG`, low). */
export const CODE_MAX_LINES = 12

/** The longest line a `code` block should hold, in characters (`CODE_TOO_LONG`, low). */
export const CODE_MAX_LINE_CHARS = 60

export const DENSITY: Record<DetailLevel, DensityRules> = {
  simplified: {
    visibleWords: [10, 30],
    maxVisibleWords: 40,
    minVisibleWords: null,
    bulletItems: [3, 4],
    bulletWords: 6,
    paragraphWords: 25,
    rules: [
      'One idea per slide, stated plainly. No sub-points, qualifiers or secondary detail on the slide.',
      'Everyday words only; define nothing on the slide that needs defining; leave it out instead.',
      'A stat\'s label is a few plain words.',
    ],
  },
  balanced: {
    visibleWords: [20, 40],
    maxVisibleWords: 55,
    minVisibleWords: null,
    bulletItems: [3, 5],
    bulletWords: 8,
    paragraphWords: 35,
    rules: [
      'Include real specifics, but say the one thing that matters most, well. Leave out supporting detail that does not serve plan.keyMessage.',
    ],
  },
  detailed: {
    visibleWords: [50, 90],
    maxVisibleWords: 110,
    minVisibleWords: 30,
    // A full list plus its paired paragraph must fit under maxVisibleWords:
    // 5 x 14 + 30 = 100 <= 110 (detailLevel.test.ts checks it), or the prompt
    // asks for a slide the validator then trims.
    bulletItems: [3, 5],
    bulletWords: 14,
    paragraphWords: 60,
    rules: [
      'Every slide after the title slide explains, not just names: put the specific (a number, a named example, a date, a definition) AND the reason or mechanism behind it on the slide itself, so the audience can learn the point from the slide without the speaker.',
      'Bullet items are full informative phrases, each carrying its own specific, e.g. "Lithium-ion packs lose roughly 2% of capacity a year in mild climates", not "Battery degradation".',
      `Pair a structure (stats, a comparison, a timeline, a list) with a one-to-two-sentence "paragraph" of ${DETAILED_PAIRED_PARAGRAPH_WORDS} words or fewer that says what it means or why it happens.`,
      "A stat's label says what was measured, where and when. Timeline steps and comparison items are full clauses, never one-word labels.",
      'Still one main idea per slide: depth means more explanation of that idea, never a second unrelated point.',
    ],
  },
}

/**
 * The SLIDE DENSITY section both the deck and the repair prompt carry. The
 * system prompts point at it instead of stating numbers of their own.
 */
export function densitySection(level: DetailLevel): string {
  const d = DENSITY[level]
  return `SLIDE DENSITY (detail level: ${level}; these limits override any other word or item count)
- Visible text (everything except the heading) is ${d.visibleWords[0]}-${d.visibleWords[1]} words, ${d.maxVisibleWords} at most. The title slide, timelines and quotes are exempt from this range, and a call to action or a story's insight or closing line may be shorter.
- Bullet lists run ${d.bulletItems[0]}-${d.bulletItems[1]} items, each ${d.bulletWords} words or fewer.
- A "paragraph" runs ${d.paragraphWords} words or fewer.
- A run of "point" blocks holds at most ${Math.min(d.bulletItems[1], MAX_POINT_RUN)} points, each with label and meaning together ${d.bulletWords} words or fewer, the label 1-3 words.
- A "callout" is one sentence of ${d.bulletWords + 6} words or fewer.
- A "code" block is ${CODE_MAX_LINES} lines or fewer, each ${CODE_MAX_LINE_CHARS} characters or fewer.
${d.rules.map((rule) => `- ${rule}`).join('\n')}`
}
