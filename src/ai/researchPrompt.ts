import { evidencePackSchema, SOURCE_TYPES, type EvidencePack } from '@/generation/schemas'
import type { GenerationBrief } from './prompts'

const SOURCE_TYPE_LIST = SOURCE_TYPES.map((v) => `"${v}"`).join(' | ')

/**
 * Design spec §37: find the facts the deck actually needs, prefer
 * authoritative sources, return every fact with its context, preserve
 * disagreement rather than picking a number, and mark uncertainty rather
 * than presenting a shaky fact as settled.
 */
export const RESEARCH_SYSTEM_PROMPT = `You are researching facts for a presentation before it is written.

Identify the 4-8 facts this presentation most needs: definitions, key dates, and the most decision-relevant statistics. Find evidence only for claims that will materially support the presentation — not everything findable on the topic.

Search the web. Prefer government, official, and academic sources over industry or news sources, and prefer primary sources over secondary ones.

For every fact you return, give its full context: the exact statement, its value and unit if it has one, the geography and population it applies to, the year or date it is from, and a definition when the metric could be read more than one way. Do not return a statistic without its context.

If reliable sources disagree, preserve the disagreement rather than selecting a number arbitrarily — report it in "disagreements" instead of picking a side.

If a claim cannot be verified, mark it unverified by giving it a low "confidence" rather than presenting it as settled.

Reply with ONE JSON object only, no markdown fences and no commentary before or after it, matching exactly this shape:
{
  "sources": [
    { "id": "s1", "title": string, "publisher": string, "url": string, "publicationDate": string, "sourceType": ${SOURCE_TYPE_LIST} }
  ],
  "findings": [
    { "statement": string, "value": string, "unit": string, "geography": string, "population": string, "year": number, "definition": string, "sourceIds": ["s1"], "confidence": number }
  ],
  "disagreements": [string]
}

Every id in a finding's "sourceIds" must be an id you defined in "sources" — never cite a source you did not list there.`

export function buildResearchUserPrompt(topic: string, brief: GenerationBrief, today: string): string {
  const audience = brief.audience.trim() || 'a general audience'
  const guidance = brief.guidance.trim()

  return `Research topic: ${topic.trim()}

Today's date: ${today}
Audience: ${audience}
Detail level: ${brief.detailLevel}
${guidance ? `User's explicit guidance (what the deck should focus on or avoid): ${guidance}\n` : ''}
Find the facts this presentation needs and return them in the JSON shape described in the system prompt.`
}

/**
 * Extracts the outermost `{...}` from a raw model reply and parses it as an
 * evidence pack, lenient about the wrapper and strict about the content (see
 * the design spec's "[1] Research").
 *
 * - `【…】`-style citation markers (a search-tool artifact seen in the wild)
 *   are stripped before scanning for braces, since they can themselves
 *   contain stray punctuation.
 * - The substring from the first `{` to the last `}` is taken so surrounding
 *   prose or ```json fences never reach `JSON.parse`.
 * - After a successful zod parse, sources with neither a `url` nor a
 *   `publisher` are dropped (unverifiable), and any finding whose
 *   `sourceIds` — filtered down to ids that survived that drop — comes up
 *   empty is dropped too. `null` is returned if no finding survives, since an
 *   evidence pack with no evidence is not worth attaching to the deck.
 */
export function parseEvidencePack(raw: string): EvidencePack | null {
  const stripped = raw.replace(/【[^】]*】/g, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null

  let json: unknown
  try {
    json = JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return null
  }

  const result = evidencePackSchema.safeParse(json)
  if (!result.success) return null

  const sources = result.data.sources.filter((s) => Boolean(s.url) || Boolean(s.publisher))
  const knownIds = new Set(sources.map((s) => s.id))

  const findings = result.data.findings
    .map((f) => ({ ...f, sourceIds: f.sourceIds.filter((id) => knownIds.has(id)) }))
    .filter((f) => f.sourceIds.length > 0)

  if (findings.length === 0) return null

  return { sources, findings, disagreements: result.data.disagreements }
}

const USER_MATERIAL_ONLY_PHRASES = [
  'only use',
  'use only',
  'only the facts',
  'facts i gave',
  'information i provided',
  'no outside',
  "don't research",
  'do not research',
  'no research',
  'without research',
  'stick to the facts i',
]

/**
 * Detects `sourceMode: 'user_material_only'` (design spec §29, "[1]
 * Research") deterministically from the brief's free-text guidance, so
 * research is skipped rather than contradicting an explicit "don't look
 * anything up" instruction.
 */
export function isUserMaterialOnly(guidance: string): boolean {
  const lower = guidance.toLowerCase()
  return USER_MATERIAL_ONLY_PHRASES.some((phrase) => lower.includes(phrase))
}
