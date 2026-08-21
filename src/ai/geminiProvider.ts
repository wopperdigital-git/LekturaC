import {
  AIProviderError,
  generatedDeckSchema,
  kindForStatus,
  type AIProvider,
  type GeneratedDeck,
  type GenerationBrief,
} from './provider'
import { DECK_SYSTEM_PROMPT, buildDeckUserPrompt } from './prompts'
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

async function callGemini(
  apiKey: string,
  systemInstruction: string,
  contents: GeminiContent[],
  maxOutputTokens: number,
  signal?: AbortSignal,
): Promise<string> {
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
          temperature: 0.7,
          maxOutputTokens,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (res.ok) {
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
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
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= MAX_RETRIES) {
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

export class GeminiProvider implements AIProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateDeck(
    topic: string,
    brief: GenerationBrief,
    signal?: AbortSignal,
  ): Promise<GeneratedDeck> {
    if (!this.apiKey.trim()) {
      throw new AIProviderError('No Gemini API key configured. Add VITE_GEMINI_API_KEY to your .env file.', {
        kind: 'auth',
      })
    }

    const userPrompt = buildDeckUserPrompt(topic, brief)
    const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: userPrompt }] }]

    // Scales with the requested slide count so large decks don't get cut off
    // mid-JSON — no fixed cap on how many cards a request can ask for. When the
    // model is choosing the count itself ('auto'), budget for the top of the
    // range it's told to consider (see buildDeckUserPrompt).
    const maxOutputTokens =
      brief.slideCount === 'auto' ? 8192 : Math.min(8192, Math.max(4096, brief.slideCount * 260 + 800))

    const first = await callGemini(this.apiKey, DECK_SYSTEM_PROMPT, contents, maxOutputTokens, signal)
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
    const second = await callGemini(
      this.apiKey,
      DECK_SYSTEM_PROMPT,
      retryContents,
      maxOutputTokens,
      signal,
    )
    const secondResult = tryParseDeck(second)
    if ('deck' in secondResult) return secondResult.deck

    throw new AIProviderError('The AI returned content that could not be parsed into a deck. Try again.', {
      kind: 'response',
    })
  }
}
