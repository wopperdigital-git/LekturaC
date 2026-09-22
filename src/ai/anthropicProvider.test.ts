import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  APIError,
  APIUserAbortError,
  AnthropicError,
} from '@anthropic-ai/sdk'
import { AnthropicProvider } from './anthropicProvider'
import { DECK_SYSTEM_PROMPT, type GenerationBrief } from './prompts'
import type { DeckContext, GeneratedDeck, QualityFlag, NarrationSlide } from './provider'
import { REPAIR_MAX_TOKENS, REPAIR_SYSTEM_PROMPT } from './repairPrompt'
import { NARRATION_SYSTEM_PROMPT, narrationMaxTokens } from './narrationPrompt'
import { RESEARCH_SYSTEM_PROMPT } from './researchPrompt'

/** No `messages` entry may carry `role: 'system'` — see `anthropicProvider.ts`'s header comment (C1). */
function hasNoSystemRoleMessage(messages: Array<{ role: string }>): boolean {
  return messages.every((m) => m.role !== 'system')
}

/*
  Mocks the default export (the `Anthropic` client constructor) with a fake
  `messages.parse`, while keeping every other export — the error classes this
  file's `mapError` does `instanceof` checks against — real. That way a test
  can construct a genuine `AuthenticationError`/`RateLimitError`/etc and the
  provider's own `instanceof` checks (also reading from this same mocked
  module) see the identical class.

  `@anthropic-ai/sdk/helpers/zod` is deliberately NOT mocked: it's a pure
  function that turns a zod schema into JSON Schema, so letting it run for
  real costs nothing and exercises the actual `output_config.format` shape
  `anthropicProvider.ts` builds.
*/
const parseMock = vi.fn()
const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  class MockAnthropic {
    apiKey: string
    constructor(opts: { apiKey: string }) {
      this.apiKey = opts.apiKey
    }
    messages = { parse: parseMock, create: createMock }
  }
  return {
    ...actual,
    default: MockAnthropic,
  }
})

const brief: GenerationBrief = {
  audience: 'engineers',
  detailLevel: 'balanced',
  tone: 'professional',
  slideCount: 5,
  guidance: '',
}

const validCard = {
  plan: {
    purpose: 'hook',
    audienceQuestion: 'Why does this matter?',
    keyMessage: 'The key message',
    visualType: 'text',
    layoutFamily: 'list',
    transition: '',
    importance: 'essential',
  },
  blocks: [{ type: 'heading', text: 'A Heading' }],
  visualStyle: 'structured',
  speakerNotes: 'Some speaker notes.',
  claims: [],
}

const validDeck = {
  title: 'A Deck',
  blueprint: 'inform',
  brief: {
    objective: 'Explain the thing',
    audienceKnowledgeLevel: 'beginner',
    presentationType: 'informational',
    freshnessRequired: false,
    keyQuestions: [],
  },
  cards: [validCard],
}

// Fails the REAL `generatedDeckSchema`'s refine (first block must be a
// heading) while still being a well-formed object the mirror schema would
// happily accept — the exact "mirror and real schema disagree" case the
// design's one retry exists for.
const invalidDeckOutput = {
  ...validDeck,
  cards: [{ ...validCard, blocks: [{ type: 'paragraph', text: 'Not a heading' }] }],
}

beforeEach(() => {
  parseMock.mockReset()
  createMock.mockReset()
})

const validSource = {
  id: 's1',
  title: 'A Source',
  publisher: 'A Publisher',
  url: 'https://example.com',
  publicationDate: '2026',
  sourceType: 'news',
}

const validFinding = {
  statement: 'A statement',
  value: '1',
  unit: '',
  geography: '',
  population: '',
  year: 2026,
  definition: '',
  sourceIds: ['s1'],
  confidence: 0.9,
}

describe('AnthropicProvider', () => {
  describe('no key configured', () => {
    it('throws kind auth before any SDK call', async () => {
      const provider = new AnthropicProvider('')
      await expect(provider.generateDeck('topic', brief)).rejects.toMatchObject({ kind: 'auth' })
      expect(parseMock).not.toHaveBeenCalled()
    })
  })

  describe('generateDeck', () => {
    it('sends model, effort medium, max_tokens 16000, thinking adaptive, and output_config.format', async () => {
      parseMock.mockResolvedValueOnce({ parsed_output: validDeck, content: [] })
      const provider = new AnthropicProvider('key', { deckModel: 'claude-sonnet-5' })

      await provider.generateDeck('topic', brief)

      expect(parseMock).toHaveBeenCalledTimes(1)
      const params = parseMock.mock.calls[0][0]
      expect(params.model).toBe('claude-sonnet-5')
      expect(params.max_tokens).toBe(16000)
      expect(params.thinking).toEqual({ type: 'adaptive' })
      expect(params.output_config.effort).toBe('medium')
      expect(params.output_config.format).toBeTruthy()
      expect(params.output_config.format.type).toBe('json_schema')
      // C1: the system prompt is a top-level request param, never a
      // `{ role: 'system' }` message — `claude-sonnet-5` returns a 400 for
      // the latter.
      expect(params.system).toBe(DECK_SYSTEM_PROMPT)
      expect(hasNoSystemRoleMessage(params.messages)).toBe(true)
    })

    it('omits maxRetries from the request options', async () => {
      parseMock.mockResolvedValueOnce({ parsed_output: validDeck, content: [] })
      const provider = new AnthropicProvider('key')

      await provider.generateDeck('topic', brief)

      const options = parseMock.mock.calls[0][1]
      expect('maxRetries' in options).toBe(false)
    })

    it('retries exactly once with the zod errors, then returns the corrected deck', async () => {
      parseMock
        .mockResolvedValueOnce({ parsed_output: invalidDeckOutput, content: [] })
        .mockResolvedValueOnce({ parsed_output: validDeck, content: [] })
      const provider = new AnthropicProvider('key')

      const result = await provider.generateDeck('topic', brief)

      expect(result).toEqual(validDeck)
      expect(parseMock).toHaveBeenCalledTimes(2)
      const retryParams = parseMock.mock.calls[1][0]
      const retryMessages = retryParams.messages
      const retryUserMessage = retryMessages[retryMessages.length - 1]
      expect(retryUserMessage.role).toBe('user')
      expect(retryUserMessage.content).toContain('failed schema validation')
      expect(retryUserMessage.content).toContain('heading')
      expect(retryParams.system).toBe(DECK_SYSTEM_PROMPT)
      expect(hasNoSystemRoleMessage(retryMessages)).toBe(true)
    })

    it('throws kind response when the retry also fails schema validation', async () => {
      parseMock
        .mockResolvedValueOnce({ parsed_output: invalidDeckOutput, content: [] })
        .mockResolvedValueOnce({ parsed_output: invalidDeckOutput, content: [] })
      const provider = new AnthropicProvider('key')

      await expect(provider.generateDeck('topic', brief)).rejects.toMatchObject({ kind: 'response' })
      expect(parseMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('repairSlides', () => {
    const deck: GeneratedDeck = validDeck as GeneratedDeck
    const targets = [0]
    const flags: QualityFlag[] = [
      { type: 'TITLE_TOO_LONG', severity: 'high', slideIndex: 0, message: 'too long', suggestedAction: 'shorten it' },
    ]
    const context: DeckContext = { evidence: null, today: '2026-09-22' }

    it('sends effort low, REPAIR_MAX_TOKENS, maxRetries 0, system as a top-level param, and no system-role message', async () => {
      parseMock.mockResolvedValueOnce({ parsed_output: { repairs: [{ slide: 1, card: validCard }] }, content: [] })
      const provider = new AnthropicProvider('key')

      const result = await provider.repairSlides(deck, targets, flags, context)

      expect(result).toEqual({ repairs: [{ slide: 1, card: validCard }] })
      const params = parseMock.mock.calls[0][0]
      const options = parseMock.mock.calls[0][1]
      expect(params.output_config.effort).toBe('low')
      expect(params.max_tokens).toBe(REPAIR_MAX_TOKENS)
      expect(options.maxRetries).toBe(0)
      expect(params.system).toBe(REPAIR_SYSTEM_PROMPT)
      expect(hasNoSystemRoleMessage(params.messages)).toBe(true)
    })

    // M2: `client.messages.parse()` itself throws (an `AnthropicError`, per
    // `helpers/zod`'s `parse` closure) when the model's text fails the
    // `output_config.format` schema — the code never gets a chance to see a
    // parsed-but-invalid `parsed_output` to retry against, so there is no
    // self-correcting retry branch here (unlike `generateDeck`/
    // `generateNarration`). This exercises exactly that reachable path: the
    // throw maps through `mapError`'s `AnthropicError` branch to `kind:
    // 'response'`, in a single call with no retry.
    it('maps a structured-output parse failure (client.messages.parse throwing) to kind response, without retrying', async () => {
      parseMock.mockRejectedValueOnce(new AnthropicError('Failed to parse structured output: invalid'))
      const provider = new AnthropicProvider('key')

      await expect(provider.repairSlides(deck, targets, flags, context)).rejects.toMatchObject({ kind: 'response' })
      expect(parseMock).toHaveBeenCalledTimes(1)
    })

    it('throws kind response when parse succeeds but parsed_output is null', async () => {
      parseMock.mockResolvedValueOnce({ parsed_output: null, content: [] })
      const provider = new AnthropicProvider('key')

      await expect(provider.repairSlides(deck, targets, flags, context)).rejects.toMatchObject({ kind: 'response' })
      expect(parseMock).toHaveBeenCalledTimes(1)
    })

    // Regression guard for the specific bug the reviewer caught: an earlier
    // version gave `card` a `z.record(z.string(), z.unknown())` shape, which
    // the SDK's JSON Schema transform turns into an object with NO declared
    // properties and `additionalProperties: false` — i.e. only `{}` is
    // accepted, so a real call would very likely emit an empty card and
    // repair would silently no-op. `card` must have the real card structure.
    it('gives the structured-output schema a real structural shape for card, not an empty/unconstrained object', async () => {
      parseMock.mockResolvedValueOnce({ parsed_output: { repairs: [{ slide: 1, card: validCard }] }, content: [] })
      const provider = new AnthropicProvider('key')

      await provider.repairSlides(deck, targets, flags, context)

      const params = parseMock.mock.calls[0][0]
      const cardSchema = params.output_config.format.schema.properties.repairs.items.properties.card

      expect(cardSchema).toBeTruthy()
      const cardProperties = Object.keys(cardSchema.properties ?? {})
      expect(cardProperties).toEqual(
        expect.arrayContaining(['plan', 'blocks', 'visualStyle', 'speakerNotes', 'claims']),
      )
    })
  })

  describe('generateNarration', () => {
    const slides: NarrationSlide[] = [{ slide: 1, heading: 'Heading', lines: ['a line'], write: true }]

    it('sends effort low, a Claude-widened max_tokens ceiling, system as a top-level param, and no system-role message', async () => {
      parseMock.mockResolvedValueOnce({ parsed_output: { scripts: [{ slide: 1, text: 'script text' }] }, content: [] })
      const provider = new AnthropicProvider('key')

      await provider.generateNarration('Title', slides)

      const params = parseMock.mock.calls[0][0]
      const options = parseMock.mock.calls[0][1]
      expect(params.output_config.effort).toBe('low')
      expect(params.max_tokens).toBe(Math.max(narrationMaxTokens(slides.length), 16000))
      expect('maxRetries' in options).toBe(false)
      expect(params.system).toBe(NARRATION_SYSTEM_PROMPT)
      expect(hasNoSystemRoleMessage(params.messages)).toBe(true)
    })
  })

  describe('error mapping', () => {
    it('maps AuthenticationError to kind auth', async () => {
      parseMock.mockRejectedValueOnce(new AuthenticationError(401, {}, 'bad key', new Headers()))
      const provider = new AnthropicProvider('key')
      await expect(provider.generateDeck('topic', brief)).rejects.toMatchObject({ kind: 'auth' })
    })

    it('maps PermissionDeniedError to kind auth', async () => {
      parseMock.mockRejectedValueOnce(new PermissionDeniedError(403, {}, 'forbidden', new Headers()))
      const provider = new AnthropicProvider('key')
      await expect(provider.generateDeck('topic', brief)).rejects.toMatchObject({ kind: 'auth' })
    })

    it('maps RateLimitError to kind capacity', async () => {
      parseMock.mockRejectedValueOnce(new RateLimitError(429, {}, 'rate limited', new Headers()))
      const provider = new AnthropicProvider('key')
      await expect(provider.generateDeck('topic', brief)).rejects.toMatchObject({ kind: 'capacity' })
    })

    // Regression guard: `mapError` previously hand-picked which `APIError`
    // statuses to check (529, 413, then a 400-500 range) instead of
    // consulting `kindForStatus` for every status, so 503 fell through to the
    // generic `kind: 'unknown'` fallback despite `kindForStatus(503)` already
    // being `'capacity'`.
    it('maps a 503 (service unavailable) APIError to kind capacity', async () => {
      parseMock.mockRejectedValueOnce(new APIError(503, {}, 'service unavailable', new Headers()))
      const provider = new AnthropicProvider('key')
      await expect(provider.generateDeck('topic', brief)).rejects.toMatchObject({ kind: 'capacity' })
    })

    it('maps a 529 (overloaded) APIError to kind capacity', async () => {
      parseMock.mockRejectedValueOnce(new APIError(529, {}, 'overloaded', new Headers()))
      const provider = new AnthropicProvider('key')
      await expect(provider.generateDeck('topic', brief)).rejects.toMatchObject({ kind: 'capacity' })
    })

    it('a pre-aborted signal / APIUserAbortError rejects without retrying', async () => {
      parseMock.mockRejectedValueOnce(new APIUserAbortError())
      const provider = new AnthropicProvider('key')
      const controller = new AbortController()
      controller.abort()

      await expect(provider.generateDeck('topic', brief, controller.signal)).rejects.toBeTruthy()
      expect(parseMock).toHaveBeenCalledTimes(1)
    })

    // I3: `client.messages.parse()` throws a plain `AnthropicError` (not an
    // `APIError` subclass — see `@anthropic-ai/sdk/helpers/zod`'s `parse`
    // closure) when the model's text fails `JSON.parse` or fails the zod
    // schema handed to `output_config.format`. Before this fix that fell
    // through `mapError`'s `instanceof APIError` check (false — `APIError`
    // extends `AnthropicError`, not the reverse) into the generic `kind:
    // 'unknown'` branch, leaking the raw SDK/zod message to the user via
    // `CreatePage.tsx`'s `setError(err.message)`.
    it('maps a plain AnthropicError (structured-output parse/validation failure) to kind response, with a friendly message', async () => {
      parseMock.mockRejectedValueOnce(new AnthropicError('Failed to parse structured output: ZodError: ...'))
      const provider = new AnthropicProvider('key')

      const rejection = provider.generateDeck('topic', brief)
      await expect(rejection).rejects.toMatchObject({ kind: 'response' })
      await expect(rejection).rejects.not.toThrow(/ZodError/)
      // The `maps RateLimitError to kind capacity` test above is also the
      // regression guard for this fix's ordering requirement: `RateLimitError`
      // (and every other `APIError` subclass) extends `AnthropicError` too, so
      // the `AnthropicError` catch-all must sit after every specific check —
      // if it didn't, that test would now fail with `kind: 'response'`.
    })
  })

  describe('research', () => {
    it('throws kind auth before any SDK call when no key is configured', async () => {
      const provider = new AnthropicProvider('')
      await expect(provider.research('topic', brief, '2026-09-22')).rejects.toMatchObject({ kind: 'auth' })
      expect(createMock).not.toHaveBeenCalled()
    })

    it('sends the web_search_20260209 tool with max_uses 4 and maxRetries 0', async () => {
      createMock.mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify({ sources: [validSource], findings: [validFinding], disagreements: [] }) }],
      })
      const provider = new AnthropicProvider('key', { researchModel: 'claude-sonnet-5' })

      await provider.research('topic', brief, '2026-09-22')

      expect(createMock).toHaveBeenCalledTimes(1)
      const params = createMock.mock.calls[0][0]
      const options = createMock.mock.calls[0][1]
      expect(params.model).toBe('claude-sonnet-5')
      expect(params.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }])
      expect(options.maxRetries).toBe(0)
      // C1: system prompt as a top-level param, no `{ role: 'system' }` message.
      expect(params.system).toBe(RESEARCH_SYSTEM_PROMPT)
      expect(hasNoSystemRoleMessage(params.messages)).toBe(true)
      // C2: `temperature` is entirely absent — `claude-sonnet-5` returns a 400
      // for any value other than 1.0.
      expect('temperature' in params).toBe(false)
    })

    // M4: a server-tool (web search) error comes back as a normal 200 with a
    // `web_search_tool_result` block whose `.content` is a single error
    // object, not the usual list of results — `textOf()` can't see it, so
    // this is surfaced as a console warning instead (diagnostic only; control
    // flow is unaffected and `parseEvidencePack` still runs on whatever text
    // came back).
    it('warns on a web_search_tool_result error shape without throwing or changing the result', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      createMock.mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [
          { type: 'web_search_tool_result', tool_use_id: 'tool1', content: { error_code: 'max_uses_exceeded' } },
          { type: 'text', text: JSON.stringify({ sources: [validSource], findings: [validFinding], disagreements: [] }) },
        ],
      })
      const provider = new AnthropicProvider('key')

      const result = await provider.research('topic', brief, '2026-09-22')

      expect(result.findings).toHaveLength(1)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('web_search_tool_result'),
        { error_code: 'max_uses_exceeded' },
      )
      warnSpy.mockRestore()
    })

    it('does not warn when web_search_tool_result carries the normal list-of-results success shape', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      createMock.mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [
          { type: 'web_search_tool_result', tool_use_id: 'tool1', content: [{ type: 'web_search_result', url: 'https://example.com', title: 't' }] },
          { type: 'text', text: JSON.stringify({ sources: [validSource], findings: [validFinding], disagreements: [] }) },
        ],
      })
      const provider = new AnthropicProvider('key')

      await provider.research('topic', brief, '2026-09-22')

      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    // The model's JSON can legitimately be split across a pause boundary: the
    // first (paused) turn emits the opening of the object, the resumed turn
    // emits the rest. Only concatenating both turns' text yields valid JSON
    // here — a bug that dropped the first turn's text would fail this.
    it('resumes once on pause_turn, merging both turns into a single parseEvidencePack call', async () => {
      createMock
        .mockResolvedValueOnce({
          stop_reason: 'pause_turn',
          content: [
            { type: 'server_tool_use', id: 'tool1', name: 'web_search', input: {} },
            { type: 'text', text: `{"sources":[${JSON.stringify(validSource)}],"findings":[` },
          ],
        })
        .mockResolvedValueOnce({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: `${JSON.stringify(validFinding)}],"disagreements":[]}` }],
        })
      const provider = new AnthropicProvider('key')

      const result = await provider.research('topic', brief, '2026-09-22')

      expect(createMock).toHaveBeenCalledTimes(2)
      expect(result.sources).toHaveLength(1)
      expect(result.findings).toHaveLength(1)

      // The second call's messages must include the first call's full
      // assistant turn (content blocks and all) pushed back, not just its text.
      const secondCallMessages = createMock.mock.calls[1][0].messages
      const pushedAssistantTurn = secondCallMessages[secondCallMessages.length - 1]
      expect(pushedAssistantTurn.role).toBe('assistant')
      expect(pushedAssistantTurn.content.some((b: { type: string }) => b.type === 'server_tool_use')).toBe(true)
    })

    it('stops after the capped number of resumptions when still pause_turn', async () => {
      createMock.mockResolvedValue({
        stop_reason: 'pause_turn',
        content: [{ type: 'text', text: 'still searching, no JSON yet' }],
      })
      const provider = new AnthropicProvider('key')

      await expect(provider.research('topic', brief, '2026-09-22')).rejects.toMatchObject({ kind: 'response' })

      // 1 initial call + 3 resumptions = 4 total, never more.
      expect(createMock).toHaveBeenCalledTimes(4)
    })

    it('throws kind response when parseEvidencePack finds no usable evidence', async () => {
      createMock.mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'no JSON object anywhere in this reply' }],
      })
      const provider = new AnthropicProvider('key')

      await expect(provider.research('topic', brief, '2026-09-22')).rejects.toMatchObject({ kind: 'response' })
      expect(createMock).toHaveBeenCalledTimes(1)
    })

    it('maps a research SDK error the same way as the other methods', async () => {
      createMock.mockRejectedValueOnce(new RateLimitError(429, {}, 'rate limited', new Headers()))
      const provider = new AnthropicProvider('key')

      await expect(provider.research('topic', brief, '2026-09-22')).rejects.toMatchObject({ kind: 'capacity' })
    })
  })
})
