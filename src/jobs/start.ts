import { FallbackProvider, PROVIDER_CHAIN, QUIZ_CHAIN, generateQuizWithFallback } from '@/ai/fallbackProvider'
import { quizSlides } from '@/ai/quizPrompt'
import { headingTextOf, type Card } from '@/engine/contentBlocks'
import { generatePresentation } from '@/generation/pipeline'
import { deleteDraft } from '@/lib/briefDrafts'
import { createQuiz } from '@/quiz/api'
import { buildQuestions } from '@/quiz/build'
import type { SectionRequest } from '@/quiz/sections'
import { insertGeneratedDeck } from '@/store/presentationStore'
import { deckJobSpec, type DeckJobInput } from './deckJob'
import { useJobsStore } from './jobsStore'
import { quizJobSpec } from './quizJob'
import { videoJobSpec, type VideoJobInput } from './videoJob'

/** The real dependencies for each job. Every start returns false when a job of that kind is running. */

export function startDeckJob(input: DeckJobInput): boolean {
  return useJobsStore.getState().start(
    deckJobSpec(input, {
      generate: (topic, brief, options) => generatePresentation(new FallbackProvider(PROVIDER_CHAIN), topic, brief, options),
      insert: async (deck, requestedCount, result) => (await insertGeneratedDeck(deck, requestedCount, result)).id,
      deleteDraft,
    }),
  )
}

export function startQuizJob(input: { presentationId: string; title: string; cards: Card[]; requests: SectionRequest[] }): boolean {
  const slides = quizSlides(input.cards)
  const cardRefs = input.cards.map((c, i) => ({ id: c.id, heading: headingTextOf(c, i) }))
  const seed = crypto.randomUUID()
  return useJobsStore.getState().start(
    quizJobSpec(
      { presentationId: input.presentationId, title: input.title, requests: input.requests },
      {
        write: async (request, index, avoid, signal) => {
          const response = await generateQuizWithFallback(
            QUIZ_CHAIN,
            { title: input.title, slides, count: request.count, config: request.section.config, avoid },
            signal,
          )
          return buildQuestions({ response, config: request.section.config, count: request.count, cards: cardRefs, seed: `${seed}:${index}` })
        },
        create: createQuiz,
      },
    ),
  )
}

export function startVideoJob(input: VideoJobInput): boolean {
  return useJobsStore.getState().start(
    videoJobSpec(input, {
      // Through import() only: this file must not pull the encoder into the entry bundle.
      generate: async (o) => (await import('@/video/generate')).generateVideoForDeck(o),
    }),
  )
}
