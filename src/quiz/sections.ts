import type { QuizQuestionDraft, QuizSection } from './types'

/*
  Runs a quiz's tests one model call at a time, in order. Pure apart from the
  injected `write`, so the rules — order, what earlier tests pass on to avoid,
  resuming after a failure, cancel — are testable without React or a model.
*/

export interface SectionRequest {
  section: QuizSection
  count: number
}

export interface BuiltSection {
  section: QuizSection
  questions: QuizQuestionDraft[]
  /** How many fewer than `requested` survived validation. */
  shortfall: number
  requested: number
}

/** The model's reply for a test held no usable question. */
export class EmptySectionError extends Error {
  constructor() {
    super('No usable questions were written for this test.')
    this.name = 'EmptySectionError'
  }
}

/** Test `index` failed; `written` holds the tests finished before it, kept for a resume. */
export class SectionFailure extends Error {
  index: number
  section: QuizSection
  written: BuiltSection[]
  override cause: unknown

  constructor(index: number, section: QuizSection, written: BuiltSection[], cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'SectionFailure'
    this.index = index
    this.section = section
    this.written = written
    this.cause = cause
  }
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

/**
 * Writes `requests[written.length …]` in order and returns every test,
 * including the ones passed in `written` (kept by identity). A failure throws
 * `SectionFailure` carrying what was finished; a cancel throws an AbortError
 * (or whatever `write` threw once the signal is aborted), never a
 * `SectionFailure`, so the caller can tell the two apart.
 */
export async function generateSections(opts: {
  requests: SectionRequest[]
  written: BuiltSection[]
  write: (
    request: SectionRequest,
    index: number,
    avoid: string[],
  ) => Promise<{ questions: QuizQuestionDraft[]; shortfall: number }>
  onProgress?: (index: number) => void
  signal?: AbortSignal
}): Promise<BuiltSection[]> {
  const { requests, write, onProgress, signal } = opts
  const built = [...opts.written]

  for (let index = built.length; index < requests.length; index++) {
    if (signal?.aborted) throw abortError()
    const request = requests[index]
    onProgress?.(index)
    const avoid = built.flatMap((b) => b.questions.map((q) => q.prompt))
    let result: { questions: QuizQuestionDraft[]; shortfall: number }
    try {
      result = await write(request, index, avoid)
    } catch (err) {
      if (signal?.aborted) throw err
      throw new SectionFailure(index, request.section, built, err)
    }
    if (signal?.aborted) throw abortError()
    if (result.questions.length === 0) {
      throw new SectionFailure(index, request.section, built, new EmptySectionError())
    }
    built.push({
      section: request.section,
      questions: result.questions,
      shortfall: result.shortfall,
      requested: request.count,
    })
  }
  return built
}
