import { z } from 'zod'
import { generatedClaimSchema, sourceSchema, type ClaimType } from './schemas'

/*
  What the editor's fact check shows a teacher: which AI-written claims have no source
  behind them, slide by slide, read from the stored `presentations.generation` row.

  Pure and defensive: the row is client-written JSON that may predate a field, so it is
  read field by field and a bad claim or source is skipped, never fatal. Claims are keyed
  by card id (see `meta.ts`), so slide numbers come from the deck as it is now: a moved
  slide renumbers and a deleted one takes its claims with it. Nothing here asks a model
  anything; the teacher fixes a claim by editing the slide.
*/

const storedClaimSchema = generatedClaimSchema.extend({
  id: z.string().min(1),
  slideIndex: z.number(),
  verified: z.boolean(),
})

const RESEARCH = ['ok', 'failed', 'skipped'] as const

export interface FactCheckItem {
  claimId: string
  cardId: string
  /** 1-based, in the deck's current order. */
  slideNumber: number
  statement: string
  type: ClaimType
  /** Every cited id was found in the research pack (see `verifyClaims`). */
  verified: boolean
  sources: { title: string; publisher: string; url?: string }[]
  /** The teacher marked it checked. */
  reviewed: boolean
}

export interface FactCheck {
  research: (typeof RESEARCH)[number]
  /** Every factual claim, in slide order then the order written. Opinions are left out: they need no source. */
  items: FactCheckItem[]
  /**
   * Unsourced claims not yet marked checked. Empty when research was skipped: the brief said
   * to use only the teacher's own material, so the claims are theirs.
   */
  needsCheck: FactCheckItem[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function reviewedIds(row: Record<string, unknown>): string[] {
  return Array.isArray(row.reviewed) ? row.reviewed.filter((id): id is string => typeof id === 'string') : []
}

/** The fact check for this deck, or `null` when there is nothing to check (no row, an unreadable one, no claims). */
export function readFactCheck(meta: unknown, cards: readonly { id: string; orderIndex: number }[]): FactCheck | null {
  const row = asRecord(meta)
  if (!row || row.version !== 1) return null
  const claims = asRecord(row.claims)
  if (!claims) return null

  const research = RESEARCH.find((r) => r === row.research) ?? 'failed'
  const sources = new Map<string, z.infer<typeof sourceSchema>>()
  for (const raw of Array.isArray(row.sources) ? row.sources : []) {
    const parsed = sourceSchema.safeParse(raw)
    if (parsed.success) sources.set(parsed.data.id, parsed.data)
  }
  const reviewed = new Set(reviewedIds(row))

  const items: FactCheckItem[] = []
  const ordered = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)
  ordered.forEach((card, position) => {
    const list = claims[card.id]
    if (!Array.isArray(list)) return
    for (const raw of list) {
      const parsed = storedClaimSchema.safeParse(raw)
      if (!parsed.success || parsed.data.type === 'opinion') continue
      const claim = parsed.data
      items.push({
        claimId: claim.id,
        cardId: card.id,
        slideNumber: position + 1,
        statement: claim.statement,
        type: claim.type,
        verified: claim.verified,
        sources: claim.sourceIds.flatMap((id) => {
          const s = sources.get(id)
          return s ? [{ title: s.title, publisher: s.publisher, url: s.url }] : []
        }),
        reviewed: reviewed.has(claim.id),
      })
    }
  })
  if (items.length === 0) return null

  const needsCheck = research === 'skipped' ? [] : items.filter((i) => !i.verified && !i.reviewed)
  return { research, items, needsCheck }
}

/** The row with `claimId` added to its reviewed list (once), or `null` when the row cannot be read. */
export function markChecked(meta: unknown, claimId: string): Record<string, unknown> | null {
  const row = asRecord(meta)
  if (!row) return null
  const reviewed = reviewedIds(row)
  return { ...row, reviewed: reviewed.includes(claimId) ? reviewed : [...reviewed, claimId] }
}

/** "slide 2", "slides 2 and 4", "slides 1, 2 and 4". */
function slideList(numbers: number[]): string {
  if (numbers.length === 1) return `slide ${numbers[0]}`
  return `slides ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}

/** The editor's one-line notice, or `null` when nothing needs checking. */
export function factCheckNotice(fc: FactCheck): string | null {
  const n = fc.needsCheck.length
  if (n === 0) return null
  const slides = slideList([...new Set(fc.needsCheck.map((i) => i.slideNumber))])
  const claims = `${n} ${n === 1 ? 'claim' : 'claims'}`
  return fc.research === 'failed'
    ? `Web research didn't work for this deck, so ${claims} on ${slides} weren't checked against sources.`
    : `${claims} on ${slides} ${n === 1 ? 'has' : 'have'} no source.`
}
