import { describe, expect, it } from 'vitest'
import { EmptySectionError, SectionFailure, generateSections, type BuiltSection, type SectionRequest } from './sections'
import type { QuizQuestionDraft, QuizSection } from './types'

function section(title: string): QuizSection {
  return { title, instructions: '', config: { type: 'true_false', notation: 'word' } }
}

function draft(prompt: string): QuizQuestionDraft {
  return { slideNumber: 1, slideHeading: 'H', cardId: 'c1', prompt, choices: [], answer: true }
}

const REQUESTS: SectionRequest[] = [
  { section: section('Test 1'), count: 2 },
  { section: section('Test 2'), count: 1 },
  { section: section('Test 3'), count: 1 },
]

describe('generateSections', () => {
  it('writes every test in order, passing earlier prompts to avoid', async () => {
    const calls: { index: number; avoid: string[] }[] = []
    const progress: number[] = []
    const built = await generateSections({
      requests: REQUESTS,
      written: [],
      onProgress: (i) => progress.push(i),
      write: async (req, index, avoid) => {
        calls.push({ index, avoid })
        return { questions: [draft(`${req.section.title} q`)], shortfall: req.count - 1 }
      },
    })
    expect(built.map((b) => b.section.title)).toEqual(['Test 1', 'Test 2', 'Test 3'])
    expect(built.map((b) => [b.requested, b.shortfall])).toEqual([[2, 1], [1, 0], [1, 0]])
    expect(calls.map((c) => c.avoid)).toEqual([[], ['Test 1 q'], ['Test 1 q', 'Test 2 q']])
    expect(progress).toEqual([0, 1, 2])
  })

  it('resumes after the tests already written', async () => {
    const done: BuiltSection[] = [{ section: section('Test 1'), questions: [draft('kept')], shortfall: 0, requested: 2 }]
    const indices: number[] = []
    const built = await generateSections({
      requests: REQUESTS,
      written: done,
      write: async (_req, index, avoid) => {
        indices.push(index)
        expect(avoid[0]).toBe('kept')
        return { questions: [draft(`q${index}`)], shortfall: 0 }
      },
    })
    expect(indices).toEqual([1, 2])
    expect(built[0]).toBe(done[0])
    expect(built).toHaveLength(3)
  })

  it('reports a failing test with the tests written before it', async () => {
    const boom = new Error('busy')
    const err = await generateSections({
      requests: REQUESTS,
      written: [],
      write: async (_req, index) => {
        if (index === 1) throw boom
        return { questions: [draft(`q${index}`)], shortfall: 0 }
      },
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SectionFailure)
    const failure = err as SectionFailure
    expect(failure.index).toBe(1)
    expect(failure.section.title).toBe('Test 2')
    expect(failure.cause).toBe(boom)
    expect(failure.written.map((b) => b.section.title)).toEqual(['Test 1'])
  })

  it('treats a test with no valid questions as a failure of that test', async () => {
    const err = await generateSections({
      requests: REQUESTS,
      written: [],
      write: async () => ({ questions: [], shortfall: 2 }),
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SectionFailure)
    expect((err as SectionFailure).index).toBe(0)
    expect((err as SectionFailure).cause).toBeInstanceOf(EmptySectionError)
  })

  it('stops with an AbortError, not a SectionFailure, once the signal is aborted', async () => {
    const controller = new AbortController()
    const err = await generateSections({
      requests: REQUESTS,
      written: [],
      signal: controller.signal,
      write: async (_req, index) => {
        if (index === 0) controller.abort()
        return { questions: [draft('q')], shortfall: 0 }
      },
    }).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(SectionFailure)
    expect((err as Error).name).toBe('AbortError')
  })

  it('passes a cancel from inside write through as-is', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('Aborted', 'AbortError')
    const err = await generateSections({
      requests: REQUESTS,
      written: [],
      signal: controller.signal,
      write: async () => {
        controller.abort()
        throw abortError
      },
    }).catch((e: unknown) => e)
    expect(err).toBe(abortError)
  })
})
