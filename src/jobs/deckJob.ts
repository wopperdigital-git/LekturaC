import { AIProviderError, type GenerationBrief } from '@/ai/provider'
import type { PipelineOptions, PipelineResult } from '@/generation/pipeline'
import { abortError, type JobSpec } from './jobsStore'
import { deckTimeline } from './timelines'

/*
  A deck from a brief, in the background: the work CreatePage used to do in place. The brief
  stays a draft until the deck exists, so a failure can always go back to it ("Edit brief").
  Once the insert starts the job cannot be cancelled: the rows are being written.
*/

export interface DeckJobInput {
  topic: string
  brief: GenerationBrief
  requestedCount: number | 'auto'
  draftId: string
}

export interface DeckJobDeps {
  generate(topic: string, brief: GenerationBrief, options: PipelineOptions): Promise<PipelineResult>
  insert(deck: PipelineResult['deck'], requestedCount: number | 'auto', result: PipelineResult): Promise<string>
  deleteDraft(id: string): void
}

export function deckJobSpec(input: DeckJobInput, deps: DeckJobDeps): JobSpec {
  return {
    kind: 'deck',
    deckId: null,
    title: input.topic,
    timeline: deckTimeline('research', null).timeline,
    editHref: `/new?draft=${encodeURIComponent(input.draftId)}`,
    async run({ signal, report }) {
      let repairSlides: number | null = null
      report(deckTimeline('research', null))
      const result = await deps.generate(input.topic, input.brief, {
        signal,
        onStage: (stage, detail) => {
          if (stage === 'repair') repairSlides = detail?.slides ?? 0
          report(deckTimeline(stage, repairSlides))
        },
      })
      // Cancel landed while the pipeline was resolving: Cancel promises no deck.
      if (signal.aborted) throw abortError()
      report({ ...deckTimeline('save', repairSlides), cancellable: false })
      const deckId = await deps.insert(result.deck, input.requestedCount, result)
      deps.deleteDraft(input.draftId)
      return { deckId }
    },
    describe: (err) => (err instanceof AIProviderError ? err.message : 'Generation failed. Try again.'),
  }
}
