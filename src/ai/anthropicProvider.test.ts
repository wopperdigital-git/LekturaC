import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AuthenticationError, PermissionDeniedError, RateLimitError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { AnthropicProvider } from './anthropicProvider'
import type { GenerationBrief } from './prompts'
import type { DeckContext, GeneratedDeck, QualityFlag, NarrationSlide } from './provider'
import { REPAIR_MAX_TOKENS } from './repairPrompt'
import { narrationMaxTokens } from './narrationPrompt'

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

function textResponse(json: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(json) }] }
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
      const retryMessages = parseMock.mock.calls[1][0].messages
      const retryUserMessage = retryMessages[retryMessages.length - 1]
      expect(retryUserMessage.role).toBe('user')
      expect(retryUserMessage.content).toContain('failed schema validation')
      expect(retryUserMessage.content).toContain('heading')
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

    it('sends effort low, REPAIR_MAX_TOKENS, and maxRetries 0', async () => {
      parseMock.mockResolvedValueOnce(textResponse({ repairs: [{ slide: 1, card: validCard }] }))
      const provider = new AnthropicProvider('key')

      await provider.repairSlides(deck, targets, flags, context)

      const params = parseMock.mock.calls[0][0]
      const options = parseMock.mock.calls[0][1]
      expect(params.output_config.effort).toBe('low')
      expect(params.max_tokens).toBe(REPAIR_MAX_TOKENS)
      expect(options.maxRetries).toBe(0)
    })

    it('retries once on an unparseable response, then throws kind response if the retry also fails', async () => {
      const notJson = { content: [{ type: 'text', text: 'not JSON at all, no braces here' }] }
      parseMock.mockResolvedValueOnce(notJson).mockResolvedValueOnce(notJson)
      const provider = new AnthropicProvider('key')

      await expect(provider.repairSlides(deck, targets, flags, context)).rejects.toMatchObject({ kind: 'response' })
      expect(parseMock).toHaveBeenCalledTimes(2)
    })

    // Regression guard for the specific bug the reviewer caught: an earlier
    // version gave `card` a `z.record(z.string(), z.unknown())` shape, which
    // the SDK's JSON Schema transform turns into an object with NO declared
    // properties and `additionalProperties: false` — i.e. only `{}` is
    // accepted, so a real call would very likely emit an empty card and
    // repair would silently no-op. `card` must have the real card structure.
    it('gives the structured-output schema a real structural shape for card, not an empty/unconstrained object', async () => {
      parseMock.mockResolvedValueOnce(textResponse({ repairs: [{ slide: 1, card: validCard }] }))
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

    it('sends effort low and a Claude-widened max_tokens ceiling', async () => {
      parseMock.mockResolvedValueOnce({ parsed_output: { scripts: [{ slide: 1, text: 'script text' }] }, content: [] })
      const provider = new AnthropicProvider('key')

      await provider.generateNarration('Title', slides)

      const params = parseMock.mock.calls[0][0]
      const options = parseMock.mock.calls[0][1]
      expect(params.output_config.effort).toBe('low')
      expect(params.max_tokens).toBe(Math.max(narrationMaxTokens(slides.length), 16000))
      expect('maxRetries' in options).toBe(false)
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
