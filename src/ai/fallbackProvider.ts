import {
  AIProviderError,
  type AIProvider,
  type DeckContext,
  type EvidencePack,
  type GeneratedDeck,
  type GenerationBrief,
  type NarrationResponse,
  type NarrationSlide,
  type QualityFlag,
  type QuizProvider,
  type RepairResponse,
} from './provider'
import { GroqProvider, COMPOUND_DECK_MODEL } from './groqProvider'
import { GeminiProvider } from './geminiProvider'
import { AnthropicProvider } from './anthropicProvider'
import type { QuizRequest } from '@/quiz/types'
import type { QuizResponse } from '@/quiz/schema'

/** A provider plus a human-readable name, used only for the console breadcrumb. */
export interface Named<P> {
  name: string
  provider: P
}
export type NamedProvider = Named<AIProvider>
export type NamedQuizProvider = Named<QuizProvider>

const ANTHROPIC_API_KEY = (import.meta.env.VITE_ANTHROPIC_API_KEY ?? '').trim()
const GROQ_API_KEY = (import.meta.env.VITE_GROQ_API_KEY ?? '').trim()
const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim()

/**
 * The app's provider chain, built once: Claude first, then Groq
 * (`openai/gpt-oss-120b`/`openai/gpt-oss-20b`), then a second Groq link on
 * `groq/compound` for deck/repair/narration only, then Gemini.
 *
 * The second Groq link exists because a 2026-09-20 catalog probe found the
 * first link's models can each run out on their own: `openai/gpt-oss-20b`
 * (research) hit its 20,000 tokens/day quota, and there is no other
 * general-purpose model on this account's catalog that both fits the output
 * budget and honours JSON mode (`qwen/qwen3.8-27b`'s 1000 tokens/minute
 * output cap is under a single 5-slide deck's `deckMaxTokens`). `groq/compound`
 * measured a schema-valid deck through the real prompts in 8.3s, so it's a
 * second, independent shot on the same key for deck/repair/narration before
 * falling through to Gemini.
 *
 * Research on this link is a different story. Live probes the same day
 * showed `groq/compound-mini` returns 413 ("Request Entity Too Large") for
 * ANY prompt whose built-in search actually runs — a trivial "Say hi"
 * succeeds, but a real research query fails identically at `max_tokens` 4000,
 * 2000, 1000 and 800, with or without a system message, with or without
 * temperature. That rules out retrying with a smaller budget: the injected
 * search results themselves exceed what this tier accepts, every time. So
 * this entry passes `supportsResearch: false` (`GroqModelOptions`, see
 * `groqProvider.ts`), which makes `research()` throw a `capacity` error
 * before any network call — `capacity` is exactly what `FallbackProvider`
 * treats as "try the next link" (see `isFailoverable` below), so a deck's
 * research step reaches Gemini with no wasted round-trip rather than
 * spending one on a request that fails the same way every time.
 *
 * A provider whose key is missing is left OUT rather than added and allowed to
 * fail, so dropping VITE_GROQ_API_KEY makes this a Gemini-only app with no code
 * change — and since both Groq links share the one `VITE_GROQ_API_KEY`, a
 * missing key drops both of them, not just the first. Same rule for
 * VITE_ANTHROPIC_API_KEY: absent, Claude is simply not in the chain and Groq
 * becomes the primary. `.trim()` matters: a key blanked rather than deleted is
 * not a key, and an empty-but-present one would otherwise stay in the chain and
 * throw `auth`, which by design does not fail over.
 *
 * Shared by the create flow and the narration page — two copies of this drifted
 * once already.
 */
export const PROVIDER_CHAIN: NamedProvider[] = [
  ...(ANTHROPIC_API_KEY ? [{ name: 'Anthropic', provider: new AnthropicProvider(ANTHROPIC_API_KEY) }] : []),
  ...(GROQ_API_KEY
    ? [
        { name: 'Groq', provider: new GroqProvider(GROQ_API_KEY) },
        {
          name: 'Groq compound',
          provider: new GroqProvider(GROQ_API_KEY, {
            deckModel: COMPOUND_DECK_MODEL,
            supportsResearch: false,
          }),
        },
      ]
    : []),
  ...(GEMINI_API_KEY ? [{ name: 'Gemini', provider: new GeminiProvider(GEMINI_API_KEY) }] : []),
]

/**
 * Quizzes use the FREE model only, so this chain is the two Groq links and
 * nothing else — never Anthropic (billed per token) or Gemini. Empty without
 * `VITE_GROQ_API_KEY`; the editor disables the Quiz button in that case.
 */
export const QUIZ_CHAIN: NamedQuizProvider[] = GROQ_API_KEY
  ? [
      { name: 'Groq', provider: new GroqProvider(GROQ_API_KEY) },
      {
        name: 'Groq compound',
        provider: new GroqProvider(GROQ_API_KEY, { deckModel: COMPOUND_DECK_MODEL, supportsResearch: false }),
      },
    ]
  : []

export function generateQuizWithFallback(
  chain: NamedQuizProvider[],
  request: QuizRequest,
  signal?: AbortSignal,
): Promise<QuizResponse> {
  if (chain.length === 0) {
    return Promise.reject(
      new AIProviderError('Quiz generation needs VITE_GROQ_API_KEY in your .env file.', { kind: 'auth' }),
    )
  }
  return runWithFailover(chain, 'quiz', (provider) => provider.generateQuiz(request, signal), signal)
}

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
 * The one failover loop: try links in order, move on only when the current one
 * is out of capacity, never after a cancel. `label` is used only for the
 * console breadcrumb; `'deck'` is omitted from the breadcrumb to keep its
 * original wording, since it was the only method before this helper existed.
 * Shared by `FallbackProvider` and the quiz chain, so the two cannot drift.
 */
export async function runWithFailover<P, T>(
  chain: Named<P>[],
  label: string,
  call: (provider: P) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  for (let i = 0; i < chain.length; i++) {
    const { name, provider } = chain[i]
    const isLast = i === chain.length - 1
    try {
      return await call(provider)
    } catch (err) {
      if (isLast || isAbort(err, signal) || !isFailoverable(err)) throw err
      // Worth a breadcrumb: the user sees a normal (if slower) generation, so
      // without this there's nothing to explain where the result came from or
      // why the primary is being leaned on less than expected.
      console.warn(
        `[ai] ${name} is out of capacity (${err instanceof AIProviderError ? err.status : '?'}); falling back to ${chain[i + 1].name}${label === 'deck' ? '' : ` for ${label}`}`,
      )
    }
  }
  // Unreachable for a non-empty chain: the loop either returns or rethrows on the last link.
  throw new AIProviderError(`No AI provider was able to complete ${label}.`)
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

  /** Delegates to the shared `runWithFailover` loop; every `AIProvider` method goes through it. */
  private run<T>(
    label: string,
    call: (provider: AIProvider) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return runWithFailover(this.chain, label, call, signal)
  }

  async generateDeck(
    topic: string,
    brief: GenerationBrief,
    signal?: AbortSignal,
    context?: DeckContext,
  ): Promise<GeneratedDeck> {
    return this.run('deck', (provider) => provider.generateDeck(topic, brief, signal, context), signal)
  }

  /** Same chain, same rules as `generateDeck`. */
  async research(
    topic: string,
    brief: GenerationBrief,
    today: string,
    signal?: AbortSignal,
  ): Promise<EvidencePack> {
    return this.run('research', (provider) => provider.research(topic, brief, today, signal), signal)
  }

  /** Same chain, same rules as `generateDeck`. */
  async repairSlides(
    deck: GeneratedDeck,
    targets: number[],
    flags: QualityFlag[],
    context: DeckContext,
    signal?: AbortSignal,
  ): Promise<RepairResponse> {
    return this.run(
      'repair',
      (provider) => provider.repairSlides(deck, targets, flags, context, signal),
      signal,
    )
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
    return this.run('narration', (provider) => provider.generateNarration(title, slides, signal), signal)
  }
}
