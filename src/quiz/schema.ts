import { z } from 'zod'

/**
 * What the model returns, deliberately loose per question.
 *
 * A strict schema would fail the whole reply (and spend the one retry) over a
 * single malformed question. Only the envelope is strict here — `slide` and
 * `prompt` must exist because nothing can be salvaged without them. Whether
 * the rest suits the requested type is `build.ts`'s call, and a question that
 * doesn't is dropped and reported as a shortfall.
 */
export const quizResponseSchema = z.object({
  questions: z
    .array(
      z.object({
        slide: z.number().int(),
        prompt: z.string(),
        choices: z.array(z.string()).optional(),
        answerIndex: z.number().int().optional(),
        answer: z.union([z.string(), z.boolean()]).optional(),
        accepted: z.array(z.string()).optional(),
      }),
    )
    .min(1),
})

export type QuizResponse = z.infer<typeof quizResponseSchema>
