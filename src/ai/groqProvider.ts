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
import { DECK_SYSTEM_PROMPT, buildDeckUserPrompt, deckMaxTokens } from './prompts'
import {
  NARRATION_SYSTEM_PROMPT,
  buildNarrationUserPrompt,
  narrationMaxTokens,
} from './narrationPrompt'
import { RESEARCH_SYSTEM_PROMPT, buildResearchUserPrompt, parseEvidencePack } from './researchPrompt'
import { REPAIR_MAX_TOKENS, REPAIR_SYSTEM_PROMPT, buildRepairUserPrompt, parseRepairResponse } from './repairPrompt'
import { MAX_RETRIES, RETRYABLE_STATUS, backoffDelayMs, sleep } from './retry'

// Was `llama-3.3-70b-versatile` until Groq decommissioned it (the endpoint
// now 404s with "model does not exist"). `openai/gpt-oss-120b` is the current
// pick: it's the largest general-purpose model on the catalog and it honours
// `response_format: json_object`, which this provider depends on — verified
// against /v1/models and a live JSON-mode call. `qwen/qwen3.6-27b` was the
// other candidate and fails JSON validation, so don't reach for it.
//
// Groq's free tier also has a per-model TPM (tokens/minute) cap that's tight
// (~8000 on prior testing) — large/auto-sized decks can hit it. That's what
// the shared retry policy is for: a saturated TPM window is transient, and
// Groq sends a `Retry-After` saying when it reopens. Meant as a temporary
// fallback while Gemini is unavailable, not a permanent replacement.
//
// The AbortSignal *is* honoured (threaded into fetch), which the create flow
// depends on: cancelling a generation has to actually stop the request, or a
// deck the user walked away from lands minutes later and hijacks navigation.
const MODEL = 'openai/gpt-oss-120b'

// Research uses the smaller model deliberately (design spec "Measured
// constraints"): a single browser_search query measured 62.7k prompt tokens
// on the 120b writer model and a `max_tokens: 3000` call on it failed with
// `context_length_exceeded`. The 20b model handled the same query in 13.8k
// prompt tokens. Groq's rate limits are per-model, so research spending its
// own model's window never eats into the writer's.
const RESEARCH_MODEL = 'openai/gpt-oss-20b'

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

interface GroqMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * `jsonMode` and `tools` are mutually exclusive on Groq's API — "json mode
 * cannot be combined with tool/function calling" (design spec "Measured
 * constraints") — so the two are separate flags rather than one shared
 * "response shape" enum: a caller asking for both is a bug this type can't
 * prevent, but nothing here ever does.
 */
interface CallGroqOptions {
  model: string
  maxTokens: number
  jsonMode: boolean
  tools?: { type: string }[]
  temperature: number
}

async function callGroq(
  apiKey: string,
  messages: GroqMessage[],
  options: CallGroqOptions,
  signal?: AbortSignal,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        ...(options.tools ? { tools: options.tools } : {}),
      }),
    })

    if (res.ok) {
      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content
      if (typeof text !== 'string') {
        const finishReason = data?.choices?.[0]?.finish_reason
        throw new AIProviderError(
          `Groq API returned an unexpected response shape${finishReason ? ` (finish_reason: ${finishReason})` : ''}`,
          { kind: 'response' },
        )
      }
      return text
    }

    const body = await res.json().catch(() => null)
    const message = body?.error?.message || (await res.text().catch(() => '')) || res.statusText
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= MAX_RETRIES) {
      throw new AIProviderError(`Groq API error (${res.status}): ${message}`, {
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
  return new AIProviderError('No Groq API key configured. Add VITE_GROQ_API_KEY to your .env file.', {
    kind: 'auth',
  })
}

export class GroqProvider implements AIProvider {
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
    const messages: GroqMessage[] = [
      { role: 'system', content: DECK_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]

    const options: CallGroqOptions = {
      model: MODEL,
      maxTokens: deckMaxTokens(brief.slideCount),
      jsonMode: true,
      temperature: 0.7,
    }

    const first = await callGroq(this.apiKey, messages, options, signal)
    const firstResult = tryParseDeck(first)
    if ('deck' in firstResult) return firstResult.deck

    // One retry: tell the model exactly what validation failed so it can fix it,
    // rather than blindly regenerating and possibly making the same mistake.
    const retryMessages: GroqMessage[] = [
      ...messages,
      { role: 'assistant', content: first },
      {
        role: 'user',
        content: `That response failed schema validation with these errors: ${firstResult.error}. Reply again with ONLY the corrected JSON object, no other text.`,
      },
    ]
    const second = await callGroq(this.apiKey, retryMessages, options, signal)
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

    const messages: GroqMessage[] = [
      { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
      { role: 'user', content: buildResearchUserPrompt(topic, brief, today) },
    ]

    const raw = await callGroq(
      this.apiKey,
      messages,
      {
        model: RESEARCH_MODEL,
        maxTokens: 2000,
        jsonMode: false,
        tools: [{ type: 'browser_search' }],
        temperature: 0.3,
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

    const messages: GroqMessage[] = [
      { role: 'system', content: REPAIR_SYSTEM_PROMPT },
      { role: 'user', content: buildRepairUserPrompt(deck, targets, flags, context) },
    ]
    const options: CallGroqOptions = {
      model: MODEL,
      maxTokens: REPAIR_MAX_TOKENS,
      jsonMode: true,
      temperature: 0.7,
    }

    const first = await callGroq(this.apiKey, messages, options, signal)
    const firstResult = parseRepairResponse(first)
    if (firstResult) return firstResult

    // One self-correcting retry, as the deck and narration paths do.
    const retryMessages: GroqMessage[] = [
      ...messages,
      { role: 'assistant', content: first },
      {
        role: 'user',
        content: 'That response failed schema validation. Reply again with ONLY the corrected JSON object, no other text.',
      },
    ]
    const second = await callGroq(this.apiKey, retryMessages, options, signal)
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

    const messages: GroqMessage[] = [
      { role: 'system', content: NARRATION_SYSTEM_PROMPT },
      { role: 'user', content: buildNarrationUserPrompt(title, slides) },
    ]
    const options: CallGroqOptions = {
      model: MODEL,
      maxTokens: narrationMaxTokens(slides.length),
      jsonMode: true,
      temperature: 0.7,
    }

    const first = await callGroq(this.apiKey, messages, options, signal)
    const firstResult = tryParseNarration(first)
    if ('data' in firstResult) return firstResult.data

    // One retry with the exact validation errors, as the deck path does.
    const retryMessages: GroqMessage[] = [
      ...messages,
      { role: 'assistant', content: first },
      {
        role: 'user',
        content: `That response failed schema validation with these errors: ${firstResult.error}. Reply again with ONLY the corrected JSON object, no other text.`,
      },
    ]
    const second = await callGroq(this.apiKey, retryMessages, options, signal)
    const secondResult = tryParseNarration(second)
    if ('data' in secondResult) return secondResult.data

    throw new AIProviderError('The AI returned narration that could not be parsed. Try again.', {
      kind: 'response',
    })
  }
}
