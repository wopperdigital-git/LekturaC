import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPOUND_DECK_MODEL, DECK_MODEL, GroqProvider } from './groqProvider'
import { quizMaxTokens } from './quizPrompt'
import type { QuizRequest } from '@/quiz/types'

const REQUEST: QuizRequest = {
  title: 'Biology',
  slides: [{ slide: 1, heading: 'Cells', lines: ['Cells are small'] }],
  count: 3,
  config: { type: 'true_false', notation: 'word' },
}

const GOOD = JSON.stringify({ questions: [{ slide: 1, prompt: 'Cells are small.', answer: true }] })

function ok(content: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null },
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => '',
  } as unknown as Response
}

function failure(status: number, message: string): Response {
  return {
    ok: false,
    status,
    statusText: 'err',
    headers: { get: () => null },
    json: async () => ({ error: { message } }),
    text: async () => '',
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GroqProvider.generateQuiz', () => {
  it('returns the parsed reply on the first try, in JSON mode on the deck model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(GOOD))
    vi.stubGlobal('fetch', fetchMock)

    const res = await new GroqProvider('key').generateQuiz(REQUEST)

    expect(res.questions).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.model).toBe(DECK_MODEL)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.max_tokens).toBe(quizMaxTokens(3))
    expect(body.messages[1].content).toContain('exactly 3')
  })

  it('uses the model the instance was built with (the compound link)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(GOOD))
    vi.stubGlobal('fetch', fetchMock)
    await new GroqProvider('key', { deckModel: COMPOUND_DECK_MODEL }).generateQuiz(REQUEST)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe(COMPOUND_DECK_MODEL)
  })

  it('tolerates a fenced reply (groq/compound wraps its JSON)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok('**Quiz**\n```json\n' + GOOD + '\n```')))
    const res = await new GroqProvider('key').generateQuiz(REQUEST)
    expect(res.questions).toHaveLength(1)
  })

  it('retries once with the validation errors, then succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('{"questions":[]}')).mockResolvedValueOnce(ok(GOOD))
    vi.stubGlobal('fetch', fetchMock)

    const res = await new GroqProvider('key').generateQuiz(REQUEST)

    expect(res.questions).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(retryBody.messages).toHaveLength(4)
    expect(retryBody.messages[3].content).toContain('failed schema validation')
  })

  it('throws a response-kind error when the retry is also unusable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok('not json at all')))
    await expect(new GroqProvider('key').generateQuiz(REQUEST)).rejects.toMatchObject({
      name: 'AIProviderError',
      kind: 'response',
    })
  })

  it('surfaces an auth failure after one call and does not retry it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(failure(401, 'bad key'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new GroqProvider('key').generateQuiz(REQUEST)).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('threads the AbortSignal into fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(GOOD))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await new GroqProvider('key').generateQuiz(REQUEST, controller.signal)
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('refuses to call the network with a blank key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(new GroqProvider('  ').generateQuiz(REQUEST)).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
