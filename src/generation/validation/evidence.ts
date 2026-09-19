import type { Claim, ClaimType, EvidencePack, GeneratedCard, GeneratedDeck, QualityFlag, Source } from '../schemas'
import { headingOf, normalize, visibleLines } from './text'

/*
  Evidence-aware validators — see the design spec's "[3] Deterministic
  validation". Like `structure.ts`, every rule here is pure and synchronous;
  the only external input is `EvidenceContext`, never `Date` or the network,
  so `currentYear` always comes from the caller. See `structure.ts`'s header
  comment for why heuristics stay conservative.
*/

export const FRESHNESS_TERMS = [
  'today',
  'current',
  'currently',
  'latest',
  'recent',
  'recently',
  'modern',
  'this year',
  'nowadays',
  'trends',
  'trend',
] as const

const FRESHNESS_TERM_REGEXES = FRESHNESS_TERMS.map(
  (term) => new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i'),
)

/** `true` when any `FRESHNESS_TERMS` entry appears, at a word boundary, in any of `texts`. */
export function requiresFreshness(...texts: string[]): boolean {
  const combined = texts.join(' ')
  return FRESHNESS_TERM_REGEXES.some((re) => re.test(combined))
}

/** The first 19xx/20xx 4-digit run in `value`, or `undefined` when there is none. */
export function yearOf(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined
  const match = String(value).match(/(19|20)\d{2}/)
  return match ? Number(match[0]) : undefined
}

/**
 * Computes `id` and `verified` for every claim on every card. `id` is
 * `c${slideIndex + 1}-${n + 1}` (1-based, matching how a slide/claim would be
 * named to a person). `verified` requires at least one source id and every
 * one of them present in `pack.sources` — always `false` when `pack` is
 * `null`, since there is nothing to check a claim's sources against.
 */
export function verifyClaims(deck: GeneratedDeck, pack: EvidencePack | null): Claim[] {
  const knownSourceIds = new Set(pack?.sources.map((source) => source.id) ?? [])
  const claims: Claim[] = []
  deck.cards.forEach((card, slideIndex) => {
    card.claims.forEach((claim, n) => {
      const verified =
        pack !== null && claim.sourceIds.length > 0 && claim.sourceIds.every((id) => knownSourceIds.has(id))
      claims.push({ ...claim, id: `c${slideIndex + 1}-${n + 1}`, slideIndex, verified })
    })
  })
  return claims
}

export interface EvidenceContext {
  pack: EvidencePack | null
  currentYear: number
  freshnessRequired: boolean
}

function slideLabel(index: number): string {
  return `Slide ${index + 1}`
}

function claimsForCard(claims: Claim[], slideIndex: number): Claim[] {
  return claims.filter((c) => c.slideIndex === slideIndex)
}

const FIGURE_REGEX = /\d+(\.\d+)?\s?(%|percent|million|billion|trillion|x\b|×)/i
const CURRENCY_REGEX = /[$€£¥]\s?\d/

/** A card "has a figure" per rule 1: a stat block, or a matching number/currency anywhere visible. */
function cardHasFigure(card: GeneratedCard): boolean {
  if (card.blocks.some((block) => block.type === 'stat')) return true
  const lines = [headingOf(card), ...visibleLines(card)]
  return lines.some((line) => FIGURE_REGEX.test(line) || CURRENCY_REGEX.test(line))
}

function unsupportedStatisticFlags(deck: GeneratedDeck, claims: Claim[], ctx: EvidenceContext): QualityFlag[] {
  const flags: QualityFlag[] = []
  deck.cards.forEach((card, index) => {
    if (!cardHasFigure(card)) return
    const hasVerifiedClaim = claimsForCard(claims, index).some((claim) => claim.verified)
    if (hasVerifiedClaim) return
    // No pack at all (research was skipped or failed) means there was never
    // anything to cite — the prompt tells the model to list well-known facts
    // approximately and cite them with `sourceIds: []` in that case, which
    // this rule cannot tell apart from a genuinely unsupported number. `low`
    // logs it without spending a repair call on content the model was asked
    // to write exactly this way. A pack that exists but came back thin still
    // reports `medium`: research ran, so an unsupported figure there is more
    // likely a real gap.
    const severity = ctx.pack === null ? 'low' : ctx.pack.sources.length >= 1 ? 'high' : 'medium'
    flags.push({
      type: 'UNSUPPORTED_STATISTIC',
      severity,
      slideIndex: index,
      message: `${slideLabel(index)} states a figure with no verified claim backing it.`,
      suggestedAction: 'Cite a verified source for this figure, or remove it.',
    })
  })
  return flags
}

const SOURCED_CLAIM_TYPES = new Set<ClaimType>(['statistic', 'historical', 'scientific', 'comparison'])

function missingSourceFlags(deck: GeneratedDeck, claims: Claim[], ctx: EvidenceContext): QualityFlag[] {
  const flags: QualityFlag[] = []
  deck.cards.forEach((_card, index) => {
    const count = claimsForCard(claims, index).filter(
      (claim) => SOURCED_CLAIM_TYPES.has(claim.type) && !claim.verified,
    ).length
    if (count > 0) {
      // Same reasoning as UNSUPPORTED_STATISTIC: with no pack at all there was
      // nothing to cite, so an unverified sourced-type claim is the prompt's
      // documented no-evidence behavior, not a defect — log it, don't repair it.
      flags.push({
        type: 'MISSING_SOURCE',
        severity: ctx.pack === null ? 'low' : 'medium',
        slideIndex: index,
        message: `${slideLabel(index)} has ${count} claim${count === 1 ? '' : 's'} of a sourced type with no verified source.`,
        suggestedAction: 'Cite a source from the evidence pack for each claim, or soften the wording.',
      })
    }
  })
  return flags
}

/** The newest year found among the sources a claim cites, or `undefined` if none carry one. */
function newestSourceYear(claim: Claim, sourcesById: Map<string, Source>): number | undefined {
  const years = claim.sourceIds
    .map((id) => sourcesById.get(id))
    .filter((source): source is Source => source !== undefined)
    .map((source) => yearOf(source.publicationDate))
    .filter((year): year is number => year !== undefined)
  return years.length > 0 ? Math.max(...years) : undefined
}

function outdatedEvidenceFlags(deck: GeneratedDeck, claims: Claim[], ctx: EvidenceContext): QualityFlag[] {
  if (!ctx.freshnessRequired) return []
  const flags: QualityFlag[] = []
  const sourcesById = new Map((ctx.pack?.sources ?? []).map((source) => [source.id, source]))
  deck.cards.forEach((card, index) => {
    if (card.plan.purpose === 'timeline') return
    const isOutdated = claimsForCard(claims, index).some((claim) => {
      if (!claim.timeSensitive || claim.type === 'historical') return false
      const year = claim.year ?? newestSourceYear(claim, sourcesById)
      return year !== undefined && year < ctx.currentYear - 2
    })
    if (isOutdated) {
      flags.push({
        type: 'OUTDATED_EVIDENCE',
        severity: 'high',
        slideIndex: index,
        message: `${slideLabel(index)} states a time-sensitive claim with evidence older than ${ctx.currentYear - 2}.`,
        suggestedAction: 'Replace the figure with more recent evidence, or drop the time-sensitive wording.',
      })
    }
  })
  return flags
}

function ambiguousMetricFlags(deck: GeneratedDeck): QualityFlag[] {
  const flags: QualityFlag[] = []
  deck.cards.forEach((card, index) => {
    const hasAmbiguousStat = card.blocks.some((block) => block.type === 'stat' && !/\d{4}/.test(block.label))
    if (hasAmbiguousStat) {
      flags.push({
        type: 'AMBIGUOUS_METRIC',
        severity: 'low',
        slideIndex: index,
        message: `${slideLabel(index)} has a stat whose label doesn't state the year it applies to.`,
        suggestedAction: "Add the year the figure applies to in the stat's label.",
      })
    }
  })
  return flags
}

/** Rule 5(a): two stat blocks anywhere in the deck with the same normalized label but different values. */
function conflictingStatFlags(deck: GeneratedDeck): QualityFlag[] {
  const flags: QualityFlag[] = []
  const firstValueByLabel = new Map<string, string>()
  deck.cards.forEach((card, index) => {
    card.blocks.forEach((block) => {
      if (block.type !== 'stat') return
      const key = normalize(block.label)
      const priorValue = firstValueByLabel.get(key)
      if (priorValue === undefined) {
        firstValueByLabel.set(key, block.value)
        return
      }
      if (priorValue !== block.value) {
        flags.push({
          type: 'CONFLICTING_CLAIM',
          severity: 'high',
          slideIndex: index,
          message: `${slideLabel(index)}'s stat "${block.label}" conflicts with an earlier slide's value for the same metric.`,
          suggestedAction: 'Reconcile the two figures so the deck states one value.',
        })
      }
    })
  })
  return flags
}

/**
 * `statement`, normalized with every digit run replaced by `#` EXCEPT a
 * standalone 19xx/20xx year, which stays in the key as itself — alongside the
 * (non-year) digit runs it replaced, comma-joined.
 *
 * A year is part of *which claim this is*, not a number the claim is making:
 * "EV sales in 2023 were 14 million" and "EV sales in 2024 were 17 million"
 * are two different claims about two different years, not one claim stated
 * two conflicting ways — so they must land in different pattern buckets and
 * never get compared. Only two statements about the *same* year, with
 * different other numbers, are a real conflict.
 */
function digitPattern(statement: string): { pattern: string; digits: string } {
  const normalized = normalize(statement)
  const digits: string[] = []
  const pattern = normalized.replace(/\d+/g, (match) => {
    if (/^(19|20)\d{2}$/.test(match)) return match
    digits.push(match)
    return '#'
  })
  return { pattern, digits: digits.join(',') }
}

/** Rule 5(b): two claims identical once digits are removed, but whose digit sequences differ. */
function conflictingClaimStatementFlags(claims: Claim[]): QualityFlag[] {
  const flags: QualityFlag[] = []
  const firstDigitsByPattern = new Map<string, string>()
  claims.forEach((claim) => {
    const { pattern, digits } = digitPattern(claim.statement)
    const priorDigits = firstDigitsByPattern.get(pattern)
    if (priorDigits === undefined) {
      firstDigitsByPattern.set(pattern, digits)
      return
    }
    if (priorDigits !== digits) {
      flags.push({
        type: 'CONFLICTING_CLAIM',
        severity: 'high',
        slideIndex: claim.slideIndex,
        message: `${slideLabel(claim.slideIndex)}'s claim conflicts with an earlier claim's numbers for the same statement.`,
        suggestedAction: 'Reconcile the two claims so the deck states one figure.',
      })
    }
  })
  return flags
}

/**
 * All evidence-aware checks over a generated deck and its computed claims —
 * see the design spec's "[3] Deterministic validation". Pure and
 * synchronous, like `structureFlags`.
 */
export function evidenceFlags(deck: GeneratedDeck, claims: Claim[], ctx: EvidenceContext): QualityFlag[] {
  return [
    ...unsupportedStatisticFlags(deck, claims, ctx),
    ...missingSourceFlags(deck, claims, ctx),
    ...outdatedEvidenceFlags(deck, claims, ctx),
    ...ambiguousMetricFlags(deck),
    ...conflictingStatFlags(deck),
    ...conflictingClaimStatementFlags(claims),
  ]
}
