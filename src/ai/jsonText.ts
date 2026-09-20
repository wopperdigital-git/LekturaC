/**
 * Extracts the outermost `{...}` object from a raw model reply.
 *
 * Shared by every JSON parser in `ai/` (deck, narration and repair parsing on
 * both providers, plus `researchPrompt.ts`'s evidence-pack parsing) because
 * none of them can trust a model to reply with bare JSON. `groq/compound`
 * measured 2026-09-20 replies with a markdown preamble and fence —
 * `**Presentation Deck (JSON)**\n\`\`\`json\n{…}` — and ignores
 * `response_format` entirely, so every caller needs this tolerance, not just
 * research (which already had its own inline version of this before it was
 * pulled out here).
 *
 * Deliberately dumb: it takes the substring from the first `{` to the last
 * `}` rather than balancing braces, which is enough to strip a fence or
 * prose wrapper and still survives nested objects, since the outermost pair
 * is still the first `{` and the last `}` in the reply. It does not attempt
 * to validate that the substring is well-formed JSON — that's `JSON.parse`'s
 * job, run by the caller on the string this returns.
 */
export function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  return raw.slice(start, end + 1)
}
