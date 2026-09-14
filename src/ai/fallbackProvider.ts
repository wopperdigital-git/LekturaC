import {
  AIProviderError,
  type AIProvider,
  type GeneratedDeck,
  type GenerationBrief,
  type NarrationResponse,
  type NarrationSlide,
} from './provider'
import { GroqProvider } from './groqProvider'
import { GeminiProvider } from './geminiProvider'

/** A provider plus a human-readable name, used only for the console breadcrumb. */
export interface NamedProvider {
  name: string
  provider: AIProvider
}

const GROQ_API_KEY = (import.meta.env.VITE_GROQ_API_KEY ?? '').trim()
const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim()

/**
 * The app's provider chain, built once: Groq first, Gemini behind it.
 *
 * A provider whose key is missing is left OUT rather than added and allowed to
 * fail, so dropping VITE_GROQ_API_KEY makes this a Gemini-only app with no code
 * change. `.trim()` matters: a key blanked rather than deleted is not a key, and
 * an empty-but-present one would otherwise stay in the chain and throw `auth`,
 * which by design does not fail over.
 *
 * Shared by the create flow and the narration page — two copies of this drifted
 * once already.
 */
export const PROVIDER_CHAIN: NamedProvider[] = [
  ...(GROQ_API_KEY ? [{ name: 'Groq', provider: new GroqProvider(GROQ_API_KEY) }] : []),
  ...(GEMINI_API_KEY ? [{ name: 'Gemini', provider: new GeminiProvider(GEMINI_API_KEY) }] : []),
]

/**
 * Was this failure the provider saying "not right now", as opposed to
 * "your request is wrong"?
 *
 * Only `capacity` qualifies. Failing over on an `auth` error would paper over a
 * misconfigured key — the deck would quietly come from the backup every time
 * and the real problem would never surface. Failing over on `request` or
 * `response` just spends a second provider's quota on input that will fail
 * there too.
 */
function isFailoverable(err: unknown): boolean {
  return err instanceof AIProviderError && err.kind === 'capacity'
}

/** User-initiated cancellation, which must never trigger a second attempt. */
function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * Tries providers in order, moving to the next only when the current one is out
 * of capacity.
 *
 * The motivating case: Groq's free tier has a tight per-minute token cap that a
 * large deck can exhaust faster than `ai/retry.ts` can wait out. Each provider
 * has already spent its own retries by the time it throws, so reaching the next
 * one here means the first genuinely could not serve the request.
 *
 * Cancellation is checked before falling through — otherwise hitting Cancel
 * during a Groq request would immediately start a Gemini one, and the deck the
 * user walked away from would still arrive.
 */
export class FallbackProvider implements AIProvider {
  private chain: NamedProvider[]

  constructor(chain: NamedProvider[]) {
    if (chain.length === 0) {
      throw new Error('FallbackProvider needs at least one provider')
    }
    this.chain = chain
  }

  async generateDeck(
    topic: string,
    brief: GenerationBrief,
    signal?: AbortSignal,
  ): Promise<GeneratedDeck> {
    for (let i = 0; i < this.chain.length; i++) {
      const { name, provider } = this.chain[i]
      const isLast = i === this.chain.length - 1
      try {
        return await provider.generateDeck(topic, brief, signal)
      } catch (err) {
        if (isLast || isAbort(err, signal) || !isFailoverable(err)) throw err
        // Worth a breadcrumb: the user sees a normal (if slower) generation, so
        // without this there's nothing to explain where the deck came from or
        // why the primary is being leaned on less than expected.
        console.warn(
          `[ai] ${name} is out of capacity (${err instanceof AIProviderError ? err.status : '?'}); falling back to ${this.chain[i + 1].name}`,
        )
      }
    }
    // Unreachable: the loop either returns or rethrows on the last provider.
    throw new AIProviderError('No AI provider was able to generate a deck.')
  }

  /**
   * Same chain, same rules as `generateDeck`: only a capacity failure moves to
   * the next provider, and cancellation never does.
   */
  async generateNarration(
    title: string,
    slides: NarrationSlide[],
    signal?: AbortSignal,
  ): Promise<NarrationResponse> {
    for (let i = 0; i < this.chain.length; i++) {
      const { name, provider } = this.chain[i]
      const isLast = i === this.chain.length - 1
      try {
        return await provider.generateNarration(title, slides, signal)
      } catch (err) {
        if (isLast || isAbort(err, signal) || !isFailoverable(err)) throw err
        console.warn(
          `[ai] ${name} is out of capacity (${err instanceof AIProviderError ? err.status : '?'}); falling back to ${this.chain[i + 1].name} for narration`,
        )
      }
    }
    throw new AIProviderError('No AI provider was able to write narration.')
  }
}
