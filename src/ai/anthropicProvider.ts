import { z } from 'zod'
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
import { DECK_SYSTEM_PROMPT, buildDeckUserPrompt } from './prompts'
import { NARRATION_SYSTEM_PROMPT, buildNarrationUserPrompt, narrationMaxTokens } from './narrationPrompt'
import { REPAIR_MAX_TOKENS, REPAIR_SYSTEM_PROMPT, buildRepairUserPrompt } from './repairPrompt'
import { RESEARCH_SYSTEM_PROMPT, buildResearchUserPrompt, parseEvidencePack } from './researchPrompt'
import { deckOutputSchema, generatedCardOutputSchema } from './deckOutputSchema'
import type { ZodError } from 'zod'

/*
  Claude as a content-generation provider, alongside `GroqProvider` and
  `GeminiProvider`. Mirrors `groqProvider.ts`'s shape (constructor, one
  self-correcting retry on a schema failure) — read that file first if this
  one is confusing.

  All four `AIProvider` methods are implemented here, including `research()`
  (Claude's own `web_search` server tool, not Groq's), and this class is
  wired into `FallbackProvider`/`PROVIDER_CHAIN` (`ai/fallbackProvider.ts`)
  as the first link in the chain.

  The system prompt for every method goes through the top-level `system`
  request parameter, never a `{ role: 'system' }` message: `claude-sonnet-5`
  rejects a mid-`messages` system role with a 400, and even on the small set
  of models that accept one, it can't be `messages[0]` anyway. `AnthropicMessage`
  below is typed to only `'user' | 'assistant'` so this can't regress silently.

  The SDK (`@anthropic-ai/sdk`, and its `helpers/zod` subpath) is never
  imported at module top level, the same discipline `export/pptx.ts` uses for
  `pptxgenjs`: it's a real dependency someone who never uses Claude shouldn't
  carry in their bundle. Every reference to it — even a type — goes through a
  dynamic `import()`, so nothing here appears in the main chunk.
*/

// `VITE_ANTHROPIC_MODEL` lets a `.env` override the model without a code
// change, same as every other env-driven knob in `ai/`; falls back to
// Anthropic's current default model otherwise. `.trim() || fallback` (not
// `?? fallback`) so a present-but-blank `VITE_ANTHROPIC_MODEL=` line — which
// `.env.example` ships right next to a real value — degrades to the default
// instead of resolving to `model: ''`, matching the `.trim()` convention
// every API key constant in `fallbackProvider.ts` already uses.
const DEFAULT_MODEL = (import.meta.env.VITE_ANTHROPIC_MODEL ?? '').trim() || 'claude-sonnet-5'

export interface AnthropicModelOptions {
  deckModel?: string
  researchModel?: string
}

/**
 * Message shape for every method's `messages` array except `research()`'s
 * (see `AnthropicResearchMessage` below). No `'system'` role — see this
 * file's header comment — so a `{ role: 'system' }` message can't be
 * reintroduced without a type error.
 */
interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * The `Anthropic` client's instance type, derived purely at the type level
 * from a dynamic `import()` expression — this is a type query, not an import
 * statement, so it adds nothing to the file's runtime imports and nothing to
 * the bundle. The actual class comes from the `import()` call in `getClient()`.
 */
type AnthropicClient = InstanceType<(typeof import('@anthropic-ai/sdk'))['default']>

/**
 * Message shape for `research()`'s own `messages` array. Unlike
 * `AnthropicMessage` (plain `content: string`, which is all every other
 * method here ever needs), a `pause_turn` resumption has to push a real
 * assistant turn straight back — search results, server-tool-use blocks,
 * whatever Claude emitted, not just its text — so `content` needs the SDK's
 * real `string | Array<ContentBlockParam>` shape. Extracted purely at the
 * type level off `AnthropicClient` itself (the same "type query, not an
 * import" trick as `AnthropicClient`'s own definition above), rather than
 * imported from `@anthropic-ai/sdk`'s value exports, so nothing here adds to
 * the module's runtime imports.
 */
type AnthropicResearchMessage = Parameters<AnthropicClient['messages']['create']>[0]['messages'][number]

/**
 * `repairResponseSchema`'s own `card` field is `z.unknown()` — deliberately
 * unconstrained there, since a repair reply's card is validated by
 * `parseRepairResponse` (against the real deck schema, elsewhere), not by
 * this schema. Anthropic's structured output rejects that directly:
 * `zodOutputFormat` converts every schema node to JSON Schema, and a node
 * with no `type` (what `z.unknown()` produces) fails with "JSON schema must
 * have a type defined if anyOf/oneOf/allOf are not used" — reproduced
 * directly against the installed SDK (`@anthropic-ai/sdk@0.127.0`).
 *
 * A `z.record(z.string(), z.unknown())` does NOT fix this the way it looks
 * like it should: the SDK's JSON Schema transform keeps only explicitly
 * declared `properties` (a record declares none) and unconditionally sets
 * `additionalProperties: false`, so the resulting schema only accepts `{}` —
 * confirmed by running `zodOutputFormat` on that variant and inspecting the
 * emitted schema. A real call would then very likely emit `"card": {}` for
 * every repair, which the real (unconstrained) `repairResponseSchema` would
 * happily accept, silently no-op-ing every repair.
 *
 * So `card` here is the real card shape — `generatedCardOutputSchema`, the
 * same per-card mirror `deckOutputSchema` uses — not a loosened stand-in.
 * This is only what's offered to the SDK as a generation-time shape hint;
 * `repairSlides` below reads `response.parsed_output` directly rather than
 * re-parsing against the real (looser) `repairResponseSchema` — see its own
 * comment for why that's safe here.
 */
const repairOutputSchema = z.object({
  repairs: z.array(z.object({ slide: z.number().int().positive(), card: generatedCardOutputSchema })).default([]),
})

function noKeyError(): AIProviderError {
  return new AIProviderError('No Anthropic API key configured. Add VITE_ANTHROPIC_API_KEY to your .env file.', {
    kind: 'auth',
  })
}

function formatZodErrors(error: ZodError): string {
  return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
}

/**
 * Concatenates every `text` content block of a message response.
 *
 * Loosely typed on purpose: the real `Message.content` union has several
 * non-text block shapes (thinking, tool-use, …) this file never imports a
 * type for, so this just duck-types "does this look like a text block" rather
 * than importing `@anthropic-ai/sdk`'s `ContentBlock` type at module scope.
 */
function textOf(response: { content: unknown }): string {
  const blocks = response.content
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block): block is { type: string; text?: unknown } => {
      return typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text'
    })
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('')
}

/** One turn's web search results, split into how many worked and what broke. */
interface SearchResultStats {
  succeeded: number
  /** One entry per failed `web_search_tool_result`, e.g. `'max_uses_exceeded'`. */
  errors: string[]
}

/**
 * Server-tool (web search) errors don't raise an exception — they come back
 * as a normal 200 response with a `web_search_tool_result` content block
 * whose `.content` is a single error object (e.g. `{error_code:
 * 'max_uses_exceeded'}`) instead of the usual list of `web_search_result`s.
 * `textOf()` only reads `text` blocks, so a turn where every search failed
 * looks identical (no findings) to one that succeeded and genuinely found
 * nothing — both end up as `parseEvidencePack` returning `null`.
 *
 * Pure and per-turn on purpose: `research()` accumulates this across every
 * turn (initial call plus resumptions) and logs ONE summary at the end,
 * rather than one opaque `console.warn` per failed block — a live run's
 * console should say "5 succeeded, 1 failed (max_uses_exceeded)", not six
 * unreadable `Object` references with no totals to compare them against.
 */
function searchResultStats(response: { content: unknown }): SearchResultStats {
  const blocks = response.content
  if (!Array.isArray(blocks)) return { succeeded: 0, errors: [] }

  let succeeded = 0
  const errors: string[] = []
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as { type?: unknown; content?: unknown }
    if (b.type !== 'web_search_tool_result') continue
    // Success shape is a list of results; the error shape is a single object.
    if (Array.isArray(b.content)) {
      succeeded++
    } else if (b.content !== undefined) {
      const code =
        typeof b.content === 'object' && b.content !== null && 'error_code' in b.content
          ? String((b.content as { error_code: unknown }).error_code)
          : JSON.stringify(b.content)
      errors.push(code)
    }
  }
  return { succeeded, errors }
}

export class AnthropicProvider implements AIProvider {
  private apiKey: string
  private deckModel: string
  private researchModel: string
  private client?: AnthropicClient

  constructor(apiKey: string, options?: AnthropicModelOptions) {
    this.apiKey = apiKey
    this.deckModel = options?.deckModel ?? DEFAULT_MODEL
    // Anthropic has no Groq-style token-budget reason to reach for a smaller
    // model for research than for the deck (that split exists for Groq
    // because its free-tier writer and research models have different quota
    // ceilings), so this defaults to the same resolved model as `deckModel`
    // unless a caller overrides it.
    this.researchModel = options?.researchModel ?? DEFAULT_MODEL
  }

  private async getClient(): Promise<AnthropicClient> {
    if (!this.client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      this.client = new Anthropic({ apiKey: this.apiKey, dangerouslyAllowBrowser: true })
    }
    return this.client
  }

  /**
   * Every catch block in this class routes through here. Only `capacity`
   * failures fail over in `FallbackProvider` (see `kindForStatus`'s doc
   * comment), so getting this mapping right is load-bearing the same way it
   * is for Groq/Gemini.
   */
  private async mapError(err: unknown): Promise<AIProviderError> {
    if (err instanceof AIProviderError) return err

    const { AuthenticationError, PermissionDeniedError, RateLimitError, APIError, AnthropicError } = await import(
      '@anthropic-ai/sdk'
    )

    if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
      return new AIProviderError(err.message, { kind: 'auth', status: err.status })
    }
    if (err instanceof RateLimitError) {
      return new AIProviderError(err.message, { kind: 'capacity', status: err.status })
    }
    // Every other `APIError` (503, 529 "overloaded", 413 "payload too large",
    // other 4xx, …) funnels through `kindForStatus` — the single source of
    // truth for the status→kind mapping — rather than hand-picking which
    // statuses to check here. `kindForStatus` already treats 429/503/413/529
    // as `capacity`, 401/403 as `auth` (unreachable here — both have their
    // own SDK classes, handled above), and other 4xx as `request`.
    if (err instanceof APIError && err.status !== undefined) {
      return new AIProviderError(err.message, { kind: kindForStatus(err.status), status: err.status })
    }
    // `client.messages.parse()` throws a plain `AnthropicError` (not an
    // `APIError`) when the model's text fails `JSON.parse` or fails the zod
    // schema handed to `output_config.format` — see `zodOutputFormat`'s
    // `parse` closure in `@anthropic-ai/sdk/helpers/zod`. `APIError extends
    // AnthropicError`, so this check MUST stay after every `APIError`
    // (sub)class check above, or a rate limit/auth/etc error would be
    // misclassified as a generic parse failure.
    if (err instanceof AnthropicError) {
      return new AIProviderError('The AI returned content that could not be parsed. Try again.', {
        kind: 'response',
      })
    }

    const message = err instanceof Error ? err.message : String(err)
    return new AIProviderError(message, { kind: 'unknown' })
  }

  async generateDeck(
    topic: string,
    brief: GenerationBrief,
    signal?: AbortSignal,
    context?: DeckContext,
  ): Promise<GeneratedDeck> {
    if (!this.apiKey.trim()) throw noKeyError()

    const client = await this.getClient()
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')

    const userPrompt = buildDeckUserPrompt(topic, brief, context)
    const messages: AnthropicMessage[] = [{ role: 'user', content: userPrompt }]

    const baseParams = {
      model: this.deckModel,
      max_tokens: 16000,
      system: DECK_SYSTEM_PROMPT,
      thinking: { type: 'adaptive' as const },
      output_config: { format: zodOutputFormat(deckOutputSchema), effort: 'medium' as const },
    }

    let first
    try {
      // No `maxRetries` override: the deck call keeps the SDK's own default
      // retry policy, same as Groq's "there's no deck without generateDeck,
      // so it's worth the wait" reasoning.
      first = await client.messages.parse({ ...baseParams, messages }, { signal })
    } catch (err) {
      throw await this.mapError(err)
    }
    // `generatedDeckSchema` (the REAL schema, with `.catch()` defaults and the
    // heading refinement), not `deckOutputSchema` (the structured-output
    // mirror) — see `deckOutputSchema.ts`'s header comment for why both exist.
    // `parsed_output` can legitimately be `null` (e.g. the model was cut off
    // before emitting a text block); feeding `null` into `safeParse` just
    // fails the normal shape check and falls into the same retry path.
    const firstResult = generatedDeckSchema.safeParse(first.parsed_output)
    if (firstResult.success) return firstResult.data

    // One retry: tell the model exactly what validation failed so it can fix
    // it, rather than blindly regenerating and possibly making the same
    // mistake. Mirrors `GroqProvider.generateDeck`'s retry wording.
    const retryMessages: AnthropicMessage[] = [
      ...messages,
      { role: 'assistant', content: JSON.stringify(first.parsed_output) },
      {
        role: 'user',
        content: `That response failed schema validation with these errors: ${formatZodErrors(firstResult.error)}. Reply again with ONLY the corrected JSON object, no other text.`,
      },
    ]
    let second
    try {
      second = await client.messages.parse({ ...baseParams, messages: retryMessages }, { signal })
    } catch (err) {
      throw await this.mapError(err)
    }
    const secondResult = generatedDeckSchema.safeParse(second.parsed_output)
    if (secondResult.success) return secondResult.data

    throw new AIProviderError('The AI returned content that could not be parsed into a deck. Try again.', {
      kind: 'response',
    })
  }

  /**
   * Caps `research()`'s `pause_turn` resumption loop: 3 resumptions (4 calls
   * total including the first). A long web-search sequence can keep pausing
   * indefinitely; this bounds it to a fixed number of extra calls rather than
   * running unbounded searches against the research budget.
   */
  private static readonly MAX_RESEARCH_RESUMPTIONS = 3

  async research(
    topic: string,
    brief: GenerationBrief,
    today: string,
    signal?: AbortSignal,
  ): Promise<EvidencePack> {
    if (!this.apiKey.trim()) throw noKeyError()

    const client = await this.getClient()

    const messages: AnthropicResearchMessage[] = [
      { role: 'user', content: buildResearchUserPrompt(topic, brief, today) },
    ]

    const baseParams = {
      model: this.researchModel,
      max_tokens: 4000,
      system: RESEARCH_SYSTEM_PROMPT,
      // `RESEARCH_SYSTEM_PROMPT` asks for "the 4-8 facts this presentation
      // most needs" — 4 was measured (2026-09-23 live check) to run out
      // mid-task: the model kept trying to search after exhausting its
      // budget, each attempt returning a `max_uses_exceeded`
      // `web_search_tool_result` error (see `searchResultStats` below) and
      // costing tokens for nothing. 8 matches the prompt's own stated upper
      // bound.
      tools: [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 8 }],
      // No `temperature`: models released after Claude Opus 4.6 (including
      // `claude-sonnet-5`) reject any value other than 1.0 with a 400 — see
      // the SDK's own JSDoc on `temperature` in
      // `resources/messages/messages.d.ts`. Sonnet 5's decoding defaults are
      // correct without it.
      //
      // `effort: 'low'` — this was the actual gap: research doesn't set
      // `output_config` at all, so it silently ran at the *default* effort,
      // which is `'high'` (the most expensive tier) — backwards for a
      // best-effort, degrade-gracefully step that `repairSlides` and
      // `generateNarration` (this file's other two best-effort calls) both
      // already run at `'low'`. Research is fact lookup via tool calls, not
      // creative writing; it doesn't need deep reasoning, and lower effort
      // also means fewer, more-consolidated tool calls per the model's own
      // documented behavior — which should also mean fewer `pause_turn`
      // resumptions, not just cheaper thinking tokens.
      output_config: { effort: 'low' as const },
    }

    let response
    try {
      // Best effort, like Groq's research call: `maxRetries: 0` rather than
      // the SDK's default retry policy — a research call is one the pipeline
      // degrades gracefully around (see `generation/pipeline.ts`), so it's
      // not worth waiting out backoff for.
      response = await client.messages.create({ ...baseParams, messages }, { signal, maxRetries: 0 })
    } catch (err) {
      throw await this.mapError(err)
    }

    // `pause_turn` means Claude paused a long web-search sequence — not an
    // error. Resume by pushing the paused assistant turn straight back onto
    // `messages` (content blocks and all: search results, server-tool-use,
    // whatever it emitted) and calling again. Each turn's own text is
    // accumulated as it's seen — the model's final JSON can legitimately be
    // split across a pause boundary — rather than keeping only the last
    // turn's text, so a capped-out loop still has everything Claude wrote so
    // far to hand to `parseEvidencePack`.
    let stats = searchResultStats(response)
    let searchSucceeded = stats.succeeded
    const searchErrors = [...stats.errors]
    let combinedText = textOf(response)
    let resumptions = 0
    while (response.stop_reason === 'pause_turn' && resumptions < AnthropicProvider.MAX_RESEARCH_RESUMPTIONS) {
      messages.push({ role: 'assistant', content: response.content })
      resumptions++
      try {
        response = await client.messages.create({ ...baseParams, messages }, { signal, maxRetries: 0 })
      } catch (err) {
        throw await this.mapError(err)
      }
      stats = searchResultStats(response)
      searchSucceeded += stats.succeeded
      searchErrors.push(...stats.errors)
      combinedText += textOf(response)
    }

    // Diagnostic only — never changes control flow or throws. One summary
    // for the whole research call (not one line per block) so a live run's
    // console says how many searches actually worked against how many
    // didn't, and what broke, in one readable line.
    if (searchErrors.length > 0) {
      console.warn(
        `[ai] Anthropic web search: ${searchSucceeded} succeeded, ${searchErrors.length} failed (${searchErrors.join(', ')})`,
      )
    }

    const pack = parseEvidencePack(combinedText)
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

    const client = await this.getClient()
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')

    const messages: AnthropicMessage[] = [
      { role: 'user', content: buildRepairUserPrompt(deck, targets, flags, context) },
    ]
    const baseParams = {
      model: this.deckModel,
      max_tokens: REPAIR_MAX_TOKENS,
      system: REPAIR_SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(repairOutputSchema), effort: 'low' as const },
    }

    // No retry loop here, unlike `generateDeck`/`generateNarration`: a
    // self-correcting retry only makes sense when the first reply can come
    // back *parsed but schema-invalid*. With `output_config.format` set,
    // `client.messages.parse()` itself throws (mapped through `mapError`
    // above, including the `AnthropicError` branch for a structured-output
    // parse/validation failure) before ever handing back a malformed
    // `parsed_output` — so a retry branch after a successful `parse()` call
    // is unreachable. `response.parsed_output` is already schema-valid
    // against `repairOutputSchema` (the structured-output mirror) by the
    // time we see it; the real, looser `repairResponseSchema` (`card:
    // z.unknown()`) is intentionally not re-run here, because
    // `generation/repair.ts`'s `applyRepairs` already validates each
    // returned card against `generatedCardSchema` before writing it.
    let response
    try {
      // Best effort, like Groq's repair call: `maxRetries: 0` rather than the
      // SDK's default retry policy — a repair call landing right after a deck
      // call often meets an already-saturated window anyway, and repair
      // failure just keeps the unrepaired deck rather than costing the user
      // anything.
      response = await client.messages.parse({ ...baseParams, messages }, { signal, maxRetries: 0 })
    } catch (err) {
      throw await this.mapError(err)
    }
    if (!response.parsed_output) {
      throw new AIProviderError('The AI returned repairs that could not be parsed. Try again.', {
        kind: 'response',
      })
    }
    return response.parsed_output
  }

  async generateNarration(
    title: string,
    slides: NarrationSlide[],
    signal?: AbortSignal,
  ): Promise<NarrationResponse> {
    if (!this.apiKey.trim()) throw noKeyError()

    const client = await this.getClient()
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')

    const messages: AnthropicMessage[] = [{ role: 'user', content: buildNarrationUserPrompt(title, slides) }]
    const baseParams = {
      model: this.deckModel,
      system: NARRATION_SYSTEM_PROMPT,
      // `narrationMaxTokens`'s ceiling of 7000 is tuned to Groq's free-tier
      // 8,000-token/minute window (see its doc comment) — a constraint that
      // has nothing to do with Claude. Reusing it as-is would cap Claude's
      // narration for a reason that doesn't apply to it, so this widens the
      // ceiling to 16000 instead of adopting Groq's tuning wholesale.
      max_tokens: Math.max(narrationMaxTokens(slides.length), 16000),
      output_config: { format: zodOutputFormat(narrationResponseSchema), effort: 'low' as const },
    }

    let first
    try {
      // No `maxRetries` override: narration keeps the full retry policy, like
      // the deck call.
      first = await client.messages.parse({ ...baseParams, messages }, { signal })
    } catch (err) {
      throw await this.mapError(err)
    }
    const firstResult = narrationResponseSchema.safeParse(first.parsed_output)
    if (firstResult.success) return firstResult.data

    // One retry with the exact validation errors, as the deck path does.
    const retryMessages: AnthropicMessage[] = [
      ...messages,
      { role: 'assistant', content: JSON.stringify(first.parsed_output) },
      {
        role: 'user',
        content: `That response failed schema validation with these errors: ${formatZodErrors(firstResult.error)}. Reply again with ONLY the corrected JSON object, no other text.`,
      },
    ]
    let second
    try {
      second = await client.messages.parse({ ...baseParams, messages: retryMessages }, { signal })
    } catch (err) {
      throw await this.mapError(err)
    }
    const secondResult = narrationResponseSchema.safeParse(second.parsed_output)
    if (secondResult.success) return secondResult.data

    throw new AIProviderError('The AI returned narration that could not be parsed. Try again.', {
      kind: 'response',
    })
  }
}
