import {
  AIProviderError,
  generatedDeckSchema,
  type AIProvider,
  type GeneratedDeck,
  type GenerationBrief,
} from './provider'
import { DECK_SYSTEM_PROMPT, buildDeckUserPrompt } from './prompts'

// Groq's free tier has a per-model TPM (tokens/minute) cap that's tight for
// this model (~8000 on prior testing) — large/auto-sized decks can hit it.
// Swap the model below if you see 429s; this is meant as a temporary
// fallback while Gemini is unavailable, not a permanent replacement.
const MODEL = 'llama-3.3-70b-versatile'
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

interface GroqMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function callGroq(
  apiKey: string,
  messages: GroqMessage[],
  maxTokens: number,
): Promise<string> {
  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.error?.message || (await res.text().catch(() => '')) || res.statusText
    throw new AIProviderError(`Groq API error (${res.status}): ${message}`)
  }

  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string') {
    const finishReason = data?.choices?.[0]?.finish_reason
    throw new AIProviderError(
      `Groq API returned an unexpected response shape${finishReason ? ` (finish_reason: ${finishReason})` : ''}`,
    )
  }
  return text
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

export class GroqProvider implements AIProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateDeck(topic: string, brief: GenerationBrief): Promise<GeneratedDeck> {
    if (!this.apiKey.trim()) {
      throw new AIProviderError('No Groq API key configured. Add VITE_GROQ_API_KEY to your .env file.')
    }

    const userPrompt = buildDeckUserPrompt(topic, brief)
    const messages: GroqMessage[] = [
      { role: 'system', content: DECK_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]

    // Same scaling as the Gemini provider so slide count still governs
    // budget consistently regardless of which provider is active.
    const maxTokens =
      brief.slideCount === 'auto' ? 8192 : Math.min(8192, Math.max(4096, brief.slideCount * 260 + 800))

    const first = await callGroq(this.apiKey, messages, maxTokens)
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
    const second = await callGroq(this.apiKey, retryMessages, maxTokens)
    const secondResult = tryParseDeck(second)
    if ('deck' in secondResult) return secondResult.deck

    throw new AIProviderError('The AI returned content that could not be parsed into a deck. Try again.')
  }
}
