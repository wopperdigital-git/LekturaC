import { z } from 'zod'

/**
 * One slide's narration: the script a voice will read, and the AI's version of
 * it.
 *
 * Two strings rather than a string and an `edited` flag. Everything the UI asks
 * about a script — is it edited, will regenerate rewrite it, can it be reset —
 * is derivable from these two, and a derived value cannot fall out of sync with
 * the thing it describes.
 *
 * `generated` is what makes Reset literal: without it, "reset" could only clear
 * the field and wait for the next generation to refill it.
 */
export const narrationSchema = z.object({
  text: z.string(),
  generated: z.string().optional(),
})

export type Narration = z.infer<typeof narrationSchema>

export type NarrationStatus = 'empty' | 'generated' | 'edited'

/**
 * What the panel's status chip shows for one slide.
 *
 * A blank `text` reads as `empty` even when `generated` survives, because the
 * chip predicts what "Generate all" will do — and a blanked script is rewritten.
 * Calling it `edited` would be a lie the user only discovers afterwards.
 */
export function narrationStatus(n: Narration | undefined): NarrationStatus {
  if (!n || n.text.trim() === '') return 'empty'
  if (n.text === n.generated) return 'generated'
  return 'edited'
}

/** Will "Generate all scripts" write over this slide? */
export function isRegenerable(n: Narration | undefined): boolean {
  return narrationStatus(n) !== 'edited'
}

/** Is there a generated version to go back to, different from what is there now? */
export function isResettable(n: Narration | undefined): boolean {
  return n !== undefined && n.generated !== undefined && n.text !== n.generated
}

/**
 * One stored `narration` value as the app's `Narration`.
 *
 * The column defaults to `'{}'`, so every row written before migration 0008
 * reads back as an empty object — which is a card with no script, not a card
 * with an empty one. Same distinction `parseAdjusts` draws, and for the same
 * reason: an empty-but-present script would show a whole deck as narrated.
 */
export function parseNarration(raw: unknown): Narration | undefined {
  const parsed = narrationSchema.safeParse(raw)
  if (!parsed.success) return undefined
  if (parsed.data.text === '' && parsed.data.generated === undefined) return undefined
  return parsed.data
}

/**
 * One script from the model, addressed by the 1-based slide number the prompt
 * showed it. Named `slide` rather than `index` precisely so it cannot be
 * mistaken for an array index at a call site.
 */
export interface GeneratedScript {
  slide: number
  text: string
}

/**
 * Folds generated scripts into a deck, in slide order.
 *
 * `cards` MUST already be sorted by `orderIndex`: `slide` is the 1-based
 * position the model was shown, and this is the single place that number
 * becomes an array index. `allowed` holds 0-based indices — the same array
 * positions, one conversion apart, which is why `slide` is never called
 * `index` anywhere near here.
 *
 * **The guard is the whole guarantee of the feature, and it is anchored to the
 * user's selection.** A script is written **only** to a slide in `allowed`,
 * whatever the model returned.
 *
 * That wording is a deliberate move from what this used to say. The rule was
 * once "never overwrite a hand-edited script", which this function decided for
 * itself from `isRegenerable`. Once the generate dialog offers a checklist, a
 * ticked edited slide is explicit consent, and a checkbox whose box silently
 * does nothing is worse than no checkbox — so the protection moved up to the
 * selection the user actually made. Nothing is written that they did not pick;
 * `isRegenerable` now only decides which boxes start ticked (see
 * `GenerateScriptsModal`), never what may be written.
 *
 * The prompt asks the model to leave unselected slides alone, but a prompt is a
 * request and this is the invariant: losing hand-written words is
 * unrecoverable, since nothing here can be generated a second time.
 */
export function mergeNarration<T extends { narration?: Narration }>(
  cards: T[],
  scripts: GeneratedScript[],
  allowed: ReadonlySet<number>,
): T[] {
  const byIndex = new Map<number, string>()
  for (const s of scripts) byIndex.set(s.slide - 1, s.text)

  return cards.map((card, i) => {
    const text = byIndex.get(i)
    if (text === undefined || !allowed.has(i)) return card
    return { ...card, narration: { text, generated: text } }
  })
}
