import type { Claim, GeneratedDeck, QualityFlag, QualityFlagType } from '../schemas'
import { evidenceFlags, verifyClaims, type EvidenceContext } from './evidence'
import { structureFlags } from './structure'

/*
  See the design spec's "[3] Deterministic validation" and "[4] Targeted
  repair". `ValidationContext` is a type alias rather than an
  `interface … extends … {}` — an empty-body extending interface trips
  oxlint's no-empty-interface-equivalent lint, and the two are otherwise
  identical.
*/
export type ValidationContext = EvidenceContext

/**
 * Runs every deterministic validator over `deck` and computes its claims'
 * verification once, so callers never verify twice or let the two drift.
 */
export function validateDeck(deck: GeneratedDeck, ctx: ValidationContext): { flags: QualityFlag[]; claims: Claim[] } {
  const claims = verifyClaims(deck, ctx.pack)
  const flags = [...structureFlags(deck), ...evidenceFlags(deck, claims, ctx)]
  return { flags, claims }
}

/**
 * Flag types a repair call can plausibly fix by rewriting a slide's plan or
 * copy. Deliberately excludes deck-level or purely cosmetic types
 * (`LAYOUT_REPETITION`, `TEXT_ONLY_DECK`, `DUPLICATE_CONTENT`, `OVERCLAIM`,
 * `TOO_MANY_BULLETS`, `AMBIGUOUS_METRIC`) — see the design spec's "[4]
 * Targeted repair".
 *
 * `VISUAL_MISMATCH` and `LIST_DOMINANT` are in on purpose, and are the
 * exception to "cosmetic": a deck whose slides all become a heading over a list
 * of cards is the failure users see first. Both are per-slide and both are
 * fixed by re-choosing the blocks, which a replacement card can do. They still
 * go through the same once-per-generation, `MAX_REPAIR_SLIDES`-capped repair.
 */
export const REPAIRABLE: ReadonlySet<QualityFlagType> = new Set<QualityFlagType>([
  'TITLE_TOO_LONG',
  'BODY_TOO_DENSE',
  'UNSUPPORTED_STATISTIC',
  'MISSING_SOURCE',
  'FILLER_SLIDE',
  'WEAK_CONCLUSION',
  'NARRATION_DUPLICATES_SLIDE',
  'OUTDATED_EVIDENCE',
  'CONFLICTING_CLAIM',
  'VISUAL_MISMATCH',
  'LIST_DOMINANT',
])

/** At most one repair call per generation targets at most this many slides. */
export const MAX_REPAIR_SLIDES = 4

/**
 * The slide indices a repair call should target: any high-severity flag, or
 * a medium-severity flag of a `REPAIRABLE` type. Deck-level flags (no
 * `slideIndex`) are never repaired. Ranked by (count of high, count of
 * medium) descending, ties broken by index ascending, capped at
 * `MAX_REPAIR_SLIDES`, and returned sorted ascending so a repair call always
 * sees slides in deck order.
 */
export function repairTargets(flags: QualityFlag[]): number[] {
  const eligible = flags.filter(
    (flag): flag is QualityFlag & { slideIndex: number } =>
      flag.slideIndex !== undefined &&
      (flag.severity === 'high' || (flag.severity === 'medium' && REPAIRABLE.has(flag.type))),
  )

  const counts = new Map<number, { high: number; medium: number }>()
  eligible.forEach((flag) => {
    const entry = counts.get(flag.slideIndex) ?? { high: 0, medium: 0 }
    if (flag.severity === 'high') entry.high += 1
    else entry.medium += 1
    counts.set(flag.slideIndex, entry)
  })

  const ranked = [...counts.entries()].sort(([indexA, countsA], [indexB, countsB]) => {
    if (countsB.high !== countsA.high) return countsB.high - countsA.high
    if (countsB.medium !== countsA.medium) return countsB.medium - countsA.medium
    return indexA - indexB
  })

  return ranked
    .slice(0, MAX_REPAIR_SLIDES)
    .map(([index]) => index)
    .sort((a, b) => a - b)
}
