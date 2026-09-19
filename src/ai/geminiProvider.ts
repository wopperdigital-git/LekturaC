import {
  AIProviderError,
  generatedDeckSchema,
  kindForStatus,
  narrationResponseSchema,
  type AIProvider,
  type DeckContext,
  type EvidencePack,
  type GeneratedDeck,
  type GenerationBrief,
  type NarrationResponse,
  type NarrationSlide,
  type QualityFlag,
  type RepairResponse,
} from './provider'
import { DECK_SYSTEM_PROMPT, buildDeckUserPrompt, geminiDeckMaxTokens } from './prompts'
import {
  NARRATION_SYSTEM_PROMPT,
  buildNarrationUserPrompt,
  narrationMaxTokens,
} from './narrationPrompt'
import { RESEARCH_SYSTEM_PROMPT, buildResearchUserPrompt, parseEvidencePack } from './researchPrompt'
import { REPAIR_MAX_TOKENS, REPAIR_SYSTEM_PROMPT, buildRepairUserPrompt, parseRepairResponse } from './repairPrompt'
import { MAX_RETRIES, RETRYABLE_STATUS, backoffDelayMs, sleep } from './retry'

// "-latest" alias instead of a pinned version — new API keys lose access to
// older pinned model generations over time (e.g. gemini-2.5-flash 404s for
// new users now), so track whatever Google currently points this at.
const MODEL = 'gemini-flash-latest'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

interface GeminiContent {
  role: 'user' | 'model'
  parts: [{ text: string }]
}

/**
 * `jsonMode` and `tools` are mutually exclusive on Gemini's API too —
 * `responseMimeType: application/json` is disallowed alongside `tools`
 * (design spec "Measured constraints") — so, as with Groq, these are separate
 * flags rather than one combined shape.
 */
interface CallGeminiOptions {
  maxOutputTokens: number
  jsonMode: boolean
  tools?: { google_search: Record<string, never> }[]
  temperature: number
  /**
   * Overrides `ai/retry.ts`'s `MAX_RETRIES` for this call. Research and repair
   * pass `0` — both are best-effort steps the pipeline degrades gracefully
   * around (see `generation/pipeline.ts`), so waiting out a full round of
   * backoff for a call that's allowed to just fail over wastes the time the
   * spinner is showing the user. Deck and narration omit this and keep the
   * full policy, the same split `groqProvider.ts` makes.
   */
  maxRetries?: number
}

async function callGemini(
  apiKey: string,
  systemInstruction: string,
  contents: GeminiContent[],
  options: CallGeminiOptions,
  signal?: AbortSignal,
): Promise<string> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxOutputTokens,
          ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
        ...(options.tools ? { tools: options.tools } : {}),
      }),
    })

    if (res.ok) {
      const data = await res.json()
      // With google_search grounding the reply can arrive split across
      // several parts rather than one — join them all rather than reading
      // only parts[0], or a research call would silently see a truncated
      // fragment of its own JSON.
      const parts = data?.candidates?.[0]?.content?.parts
      const text = Array.isArray(parts)
        ? parts.map((p: { text?: unknown }) => (typeof p?.text === 'string' ? p.text : '')).join('')
        : undefined
      if (typeof text !== 'string') {
        const finishReason = data?.candidates?.[0]?.finishReason
        throw new AIProviderError(
          `Gemini API returned an unexpected response shape${finishReason ? ` (finishReason: ${finishReason})` : ''}`,
          { kind: 'response' },
        )
      }
      return text
    }

    const body = await res.json().catch(() => null)
    const message = body?.error?.message || (await res.text().catch(() => '')) || res.statusText
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= maxRetries) {
      throw new AIProviderError(`Gemini API error (${res.status}): ${message}`, {
        kind: kindForStatus(res.status),
        status: res.status,
      })
    }
    await sleep(backoffDelayMs(attempt, res.headers.get('retry-after')), signal)
  }
}

function tryParseDeck(raw: string): { deck: GeneratedDeck } | { error: string } {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    return { error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
  const result = generatedDeckSchema.safeParse(json)
  if (result.success) return { deck: result.data }
  return { error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}

function tryParseNarration(raw: string): { data: NarrationResponse } | { error: string } {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    return { error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
  const result = narrationResponseSchema.safeParse(json)
  if (result.success) return { data: result.data }
  return { error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}

function noKeyError(): AIProviderError {
  return new AIProviderError('No Gemini API key configured. Add VITE_GEMINI_API_KEY to your .env file.', {
    kind: 'auth',
  })
}

export class GeminiProvider implements AIProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateDeck(
    topic: string,
    brief: GenerationBrief,
    signal?: AbortSignal,
    context?: DeckContext,
  ): Promise<GeneratedDeck> {
    if (!this.apiKey.trim()) throw noKeyError()

    const userPrompt = buildDeckUserPrompt(topic, brief, context)
    const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: userPrompt }] }]

    const options: CallGeminiOptions = {
      // Gemini's own budget, not Groq's `deckMaxTokens` — see
      // `geminiDeckMaxTokens`'s own comment for why the two must not share one.
      maxOutputTokens: geminiDeckMaxTokens(brief.slideCount),
      jsonMode: true,
      temperature: 0.7,
    }

    const first = await callGemini(this.apiKey, DECK_SYSTEM_PROMPT, contents, options, signal)
    const firstResult = tryParseDeck(first)
    if ('deck' in firstResult) return firstResult.deck

    // One retry: tell the model exactly what validation failed so it can fix it,
    // rather than blindly regenerating and possibly making the same mistake.
    const retryContents: GeminiContent[] = [
      ...contents,
      { role: 'model', parts: [{ text: first }] },
      {
        role: 'user',
        parts: [
          {
            text: `That response failed schema validation with these errors: ${firstResult.error}. Reply again with ONLY the corrected JSON object, no other text.`,
          },
        ],
      },
    ]
    const second = await callGemini(this.apiKey, DECK_SYSTEM_PROMPT, retryContents, options, signal)
    const secondResult = tryParseDeck(second)
    if ('deck' in secondResult) return secondResult.deck

    throw new AIProviderError('The AI returned content that could not be parsed into a deck. Try again.', {
      kind: 'response',
    })
  }

  async research(
    topic: string,
    brief: GenerationBrief,
    today: string,
    signal?: AbortSignal,
  ): Promise<EvidencePack> {
    if (!this.apiKey.trim()) throw noKeyError()

    const contents: GeminiContent[] = [
      { role: 'user', parts: [{ text: buildResearchUserPrompt(topic, brief, today) }] },
    ]

    const raw = await callGemini(
      this.apiKey,
      RESEARCH_SYSTEM_PROMPT,
      contents,
      {
        // 2000 measured too tight on Groq's equivalent reasoning model; raised
        // in step with it so a 4-8 finding JSON always has room after whatever
        // up-front reasoning this provider does too.
        maxOutputTokens: 4000,
        jsonMode: false,
        tools: [{ google_search: {} }],
        temperature: 0.3,
        // Best effort — see CallGeminiOptions.maxRetries.
        maxRetries: 0,
      },
      signal,
    )

    const pack = parseEvidencePack(raw)
    if (!pack) {
      throw new AIProviderError('Research returned no usable evidence', { kind: 'response' })
    }
    return pack
  }

  async repairSlides(
    deck: GeneratedDeck,
    targets: number[],
    flags: QualityFlag[],
    context: DeckContext,
    signal?: AbortSignal,
  ): Promise<RepairResponse> {
    if (!this.apiKey.trim()) throw noKeyError()

    const contents: GeminiContent[] = [
      { role: 'user', parts: [{ text: buildRepairUserPrompt(deck, targets, flags, context) }] },
    ]
    const options: CallGeminiOptions = {
      maxOutputTokens: REPAIR_MAX_TOKENS,
      jsonMode: true,
      temperature: 0.7,
      // Best effort — see CallGeminiOptions.maxRetries.
      maxRetries: 0,
    }

    const first = await callGemini(this.apiKey, REPAIR_SYSTEM_PROMPT, contents, options, signal)
    const firstResult = parseRepairResponse(first)
    if (firstResult) return firstResult

    // One self-correcting retry, as the deck and narration paths do.
    const retryContents: GeminiContent[] = [
      ...contents,
      { role: 'model', parts: [{ text: first }] },
      {
        role: 'user',
        parts: [
          {
            text: 'That response failed schema validation. Reply again with ONLY the corrected JSON object, no other text.',
          },
        ],
      },
    ]
    const second = await callGemini(this.apiKey, REPAIR_SYSTEM_PROMPT, retryContents, options, signal)
    const secondResult = parseRepairResponse(second)
    if (secondResult) return secondResult

    throw new AIProviderError('The AI returned repairs that could not be parsed. Try again.', {
      kind: 'response',
    })
  }

  async generateNarration(
    title: string,
    slides: NarrationSlide[],
    signal?: AbortSignal,
  ): Promise<NarrationResponse> {
    if (!this.apiKey.trim()) throw noKeyError()

    const contents: GeminiContent[] = [
      { role: 'user', parts: [{ text: buildNarrationUserPrompt(title, slides) }] },
    ]
    const options: CallGeminiOptions = {
      maxOutputTokens: narrationMaxTokens(slides.length),
      jsonMode: true,
      temperature: 0.7,
    }

    const first = await callGemini(this.apiKey, NARRATION_SYSTEM_PROMPT, contents, options, signal)
    const firstResult = tryParseNarration(first)
    if ('data' in firstResult) return firstResult.data

    const retryContents: GeminiContent[] = [
      ...contents,
      { role: 'model', parts: [{ text: first }] },
      {
        role: 'user',
        parts: [
          {
            text: `That response failed schema validation with these errors: ${firstResult.error}. Reply again with ONLY the corrected JSON object, no other text.`,
          },
        ],
      },
    ]
    const second = await callGemini(this.apiKey, NARRATION_SYSTEM_PROMPT, retryContents, options, signal)
    const secondResult = tryParseNarration(second)
    if ('data' in secondResult) return secondResult.data

    throw new AIProviderError('The AI returned narration that could not be parsed. Try again.', {
      kind: 'response',
    })
  }
}
