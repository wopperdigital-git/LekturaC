import { AIProviderError, type NarrationSlide } from '@/ai/provider'
import { narrationSlides } from '@/ai/narrationPrompt'
import type { Card } from '@/engine/contentBlocks'
import { sameSlides, type GeneratedScript } from '@/engine/narration'
import { describeError } from '@/store/presentationStore'
import { abortError, type JobSpec } from './jobsStore'
import { narrationTimeline } from './timelines'

/*
  Narration scripts for chosen slides, in the background: the work the Narration tab used to do
  in place, where leaving the editor (Present, Back) silently cancelled it. Like the deck, quiz
  and video it now outlives the page, with Cancel in the corner panel or the tab.

  The chosen slides are ids, read into positions at the start of each run from the deck as it
  is then, so Try again after a reorder still writes the slides that were chosen. The model
  answers by position, so if the slides change while it writes, nothing is applied (the tab's
  old `sameSlides` rule). Only the chosen positions are ever written: `apply` merges through
  `mergeNarration`, the feature's core invariant. Narration is never card content, so this is
  the same carve-out as before, not a rewrite of `cards`.
*/

export class SlidesChangedError extends Error {
  constructor() {
    super('The slides changed while the scripts were being written, so nothing was applied. Try again.')
    this.name = 'SlidesChangedError'
  }
}

export class SlidesGoneError extends Error {
  constructor() {
    super('The slides you chose were deleted, so there was nothing to write.')
    this.name = 'SlidesGoneError'
  }
}

export interface NarrationJobInput {
  presentationId: string
  title: string
  /** The slides to write for, by card id. */
  targetIds: string[]
}

export interface NarrationJobDeps {
  /** The deck's cards as they are now, sorted by `orderIndex`. */
  cards(deckId: string): Promise<Card[]>
  write(title: string, slides: NarrationSlide[], signal: AbortSignal): Promise<{ scripts: GeneratedScript[] }>
  /** Writes the scripts into the deck, only at `targets` (0-based positions). */
  apply(deckId: string, scripts: GeneratedScript[], targets: ReadonlySet<number>): Promise<void>
}

export function narrationJobSpec(input: NarrationJobInput, deps: NarrationJobDeps): JobSpec {
  const count = input.targetIds.length
  return {
    kind: 'narration',
    deckId: input.presentationId,
    title: input.title,
    timeline: narrationTimeline(count, 'write').timeline,
    async run({ signal, report }) {
      report({ ...narrationTimeline(count, 'write'), cancellable: true })
      const cards = await deps.cards(input.presentationId)
      const wanted = new Set(input.targetIds)
      const targets = new Set(cards.flatMap((c, i) => (wanted.has(c.id) ? [i] : [])))
      if (targets.size === 0) throw new SlidesGoneError()
      const startIds = cards.map((c) => c.id)

      const { scripts } = await deps.write(input.title, narrationSlides(cards, targets), signal)
      if (signal.aborted) throw abortError()
      const nowIds = (await deps.cards(input.presentationId)).map((c) => c.id)
      if (!sameSlides(startIds, nowIds)) throw new SlidesChangedError()
      if (signal.aborted) throw abortError()

      report({ ...narrationTimeline(count, 'save'), cancellable: false })
      await deps.apply(input.presentationId, scripts, targets)
      return { deckId: input.presentationId }
    },
    describe(err) {
      if (err instanceof SlidesChangedError || err instanceof SlidesGoneError) return err.message
      if (err instanceof AIProviderError && err.kind === 'capacity') return 'The AI is busy. Try again in a minute.'
      return describeError(err)
    },
  }
}
