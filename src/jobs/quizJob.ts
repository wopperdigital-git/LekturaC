import { AIProviderError } from '@/ai/provider'
import type { SectionToSave } from '@/quiz/api'
import { EmptySectionError, SectionFailure, generateSections, type BuiltSection, type SectionRequest } from '@/quiz/sections'
import type { QuizQuestionDraft } from '@/quiz/types'
import { describeError } from '@/store/presentationStore'
import type { JobSpec } from './jobsStore'
import { quizTimeline } from './timelines'

/*
  A quiz from a deck, in the background: the work QuizModal used to do in place. Tests are
  written one call at a time; the ones finished before a failure are kept in this closure, so
  Try again resumes at the failed test, and a failed save retries the save alone. Saving is one
  `create_quiz` call and cannot be cancelled once sent.
*/

export interface QuizJobInput {
  presentationId: string
  title: string
  requests: SectionRequest[]
}

export interface QuizJobDeps {
  write(
    request: SectionRequest,
    index: number,
    avoid: string[],
    signal: AbortSignal,
  ): Promise<{ questions: QuizQuestionDraft[]; shortfall: number }>
  create(input: { presentationId: string; title: string; deckTitle: string; sections: SectionToSave[] }): Promise<{ id: string }>
}

export function friendlyError(err: unknown, saving: boolean): string {
  if (err instanceof AIProviderError && err.kind === 'capacity') {
    return 'The free AI model is busy. Try again in a minute.'
  }
  const message = describeError(err)
  return saving && /create_quiz/i.test(message) ? `${message} Run migration 0016 in Supabase.` : message
}

export function failureMessage(failure: SectionFailure): string {
  if (failure.cause instanceof EmptySectionError) {
    return `The AI couldn't write questions for ${failure.section.title}. Try again or add more content.`
  }
  return `${failure.section.title}: ${friendlyError(failure.cause, false)}`
}

export function quizJobSpec(input: QuizJobInput, deps: QuizJobDeps): JobSpec {
  const titles = input.requests.map((r) => r.section.title)
  /** Tests finished so far; survives a failed attempt so the next one resumes. */
  let written: BuiltSection[] = []

  return {
    kind: 'quiz',
    deckId: input.presentationId,
    title: input.title,
    timeline: quizTimeline(titles, 0).timeline,
    async run({ signal, report }) {
      report({ ...quizTimeline(titles, written.length), cancellable: true })
      try {
        written = await generateSections({
          requests: input.requests,
          written,
          signal,
          onProgress: (index) => report(quizTimeline(titles, index)),
          write: (request, index, avoid) => deps.write(request, index, avoid, signal),
        })
      } catch (err) {
        if (err instanceof SectionFailure) written = err.written
        throw err
      }
      report({ ...quizTimeline(titles, 'save'), cancellable: false })
      await deps.create({
        presentationId: input.presentationId,
        title: `${input.title} — quiz`,
        deckTitle: input.title,
        sections: written.map((b) => ({ section: b.section, questions: b.questions })),
      })
      return { deckId: input.presentationId }
    },
    describe: (err) => (err instanceof SectionFailure ? failureMessage(err) : friendlyError(err, true)),
  }
}
